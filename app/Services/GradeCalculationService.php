<?php

namespace App\Services;

use App\Models\ClassroomStudent;
use App\Models\LearningModule;
use App\Models\ModuleGrade;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Perhitungan nilai Buku Nilai Kurikulum Merdeka (KKTP + deskripsi capaian TP).
 *
 * Sumber kebenaran skor modul adalah `student_responses` (ambil nilai terbaik
 * per blok agar percobaan remedial tidak menggandakan poin). `module_grades`
 * menyimpan hasil rekap dan menjadi tempat override guru; kolom `final_score`
 * tetap menyimpan nilai sistem, sedangkan `override_score` menimpanya saat
 * perhitungan akhir.
 */
class GradeCalculationService
{
    public const STATUS_TUNTAS = 'tuntas';

    public const STATUS_BELUM = 'belum';

    public const STATUS_NO_SCORE = 'belum_ada_nilai';

    public function kktpDefault(): float
    {
        return (float) config('lms.kktp.default', 75);
    }

    /**
     * Rata-rata dari nilai yang benar-benar ada (null diabaikan).
     *
     * @param  array<int, int|float|string|null>  $scores
     */
    private function averageOf(array $scores): ?float
    {
        $values = array_values(array_filter($scores, fn ($score) => $score !== null && $score !== ''));

        if ($values === []) {
            return null;
        }

        return round(array_sum(array_map('floatval', $values)) / count($values), 2);
    }

    /**
     * @return array<string, float>
     */
    public function weights(): array
    {
        return [
            LearningModule::ASSESSMENT_FORMATIF => (float) config('lms.weights.formatif', 0.30),
            LearningModule::ASSESSMENT_SUMATIF_LINGKUP => (float) config('lms.weights.sumatif_lingkup_materi', 0.30),
            LearningModule::ASSESSMENT_SUMATIF_AKHIR => (float) config('lms.weights.sumatif_akhir_semester', 0.40),
        ];
    }

    public function kktpFor(LearningModule $module): float
    {
        return (float) ($module->kktp_score ?? $this->kktpDefault());
    }

    /**
     * Hitung ulang seluruh siswa pada satu modul (idempoten, bulk upsert).
     */
    public function recalculateModule(LearningModule $module): int
    {
        $module->loadMissing('teachingAssignment');

        return $this->recalculateModules(collect([$module]));
    }

    /**
     * Hitung ulang seluruh modul pada satu ploting mengajar.
     */
    public function recalculateAssignment(TeachingAssignment $assignment): int
    {
        $modules = LearningModule::query()
            ->where('teaching_assignment_id', $assignment->id)
            ->get();

        return $this->recalculateModules($modules);
    }

    /**
     * @param  Collection<int, LearningModule>  $modules
     */
    public function recalculateModules(Collection $modules): int
    {
        if ($modules->isEmpty()) {
            return 0;
        }

        foreach ($modules as $module) {
            $module->loadMissing('teachingAssignment');
        }

        $moduleIds = $modules->pluck('id')->all();
        $maxPoints = $this->maxPointsForModules($moduleIds);
        $earned = $this->earnedByStudentForModules($moduleIds);
        $studentIds = $this->studentIdsForModules($modules);
        $now = now();

        $rows = [];

        foreach ($modules as $module) {
            $max = (float) ($maxPoints[$module->id] ?? 0);
            $kktp = $this->kktpFor($module);

            foreach ($studentIds as $studentId) {
                $hasResponse = isset($earned[$module->id][$studentId]);
                $total = round((float) ($earned[$module->id][$studentId] ?? 0), 2);
                $score = $max > 0 ? round(min(100, ($total / $max) * 100), 2) : 0.0;

                $rows[] = [
                    'module_id' => $module->id,
                    'student_id' => $studentId,
                    'total_earned_points' => $total,
                    'max_possible_points' => round($max, 2),
                    'final_score' => $score,
                    'is_passed' => $score >= $kktp,
                    'status' => $hasResponse
                        ? ModuleGrade::STATUS_GRADED
                        : ModuleGrade::STATUS_IN_PROGRESS,
                    'completed_at' => $hasResponse ? $now : null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        foreach (array_chunk($rows, 200) as $chunk) {
            ModuleGrade::query()->upsert(
                $chunk,
                ['module_id', 'student_id'],
                [
                    'total_earned_points',
                    'max_possible_points',
                    'final_score',
                    'is_passed',
                    'status',
                    'completed_at',
                    'updated_at',
                ],
            );
        }

        return count($rows);
    }

    /**
     * Matriks Buku Nilai: baris siswa, kolom TP (atau modul tanpa TP).
     *
     * @return array<string, mixed>
     */
    public function gradebook(TeachingAssignment $assignment): array
    {
        $assignment->loadMissing(['subject:id,code,name', 'classroom:id,name,grade_level', 'academicYear:id,name,semester']);

        $modules = LearningModule::query()
            ->where('teaching_assignment_id', $assignment->id)
            ->with('learningObjective:id,code,description')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        $students = $this->studentsForAssignment($assignment);

        $matrix = $this->computeMatrix($modules, $students);

        return array_merge($matrix, [
            'assignment' => [
                'id' => $assignment->id,
                'subject_id' => $assignment->subject_id,
                'subject' => $assignment->subject?->name,
                'subject_code' => $assignment->subject?->code,
                'classroom_id' => $assignment->classroom_id,
                'classroom' => $assignment->classroom?->name,
                'grade_level' => $assignment->classroom?->grade_level,
                'year_id' => $assignment->academic_year_id,
                'year' => $assignment->academicYear?->name,
                'semester' => $assignment->academicYear?->semester,
                'kktp' => $this->kktpDefault(),
            ],
        ]);
    }

    /**
     * @param  Collection<int, LearningModule>  $modules
     * @param  Collection<int, User>  $students
     * @return array{columns: array<int, array<string, mixed>>, students: array<int, array<string, mixed>>, summary: array<string, mixed>}
     */
    public function computeMatrix(Collection $modules, Collection $students): array
    {
        $modules = $modules->values();
        $moduleIds = $modules->pluck('id')->all();
        $studentIds = $students->pluck('id')->all();

        $maxPoints = $this->maxPointsForModules($moduleIds);
        $earned = $this->earnedByStudentForModules($moduleIds, $studentIds);

        $grades = ModuleGrade::query()
            ->whereIn('module_id', $moduleIds)
            ->whereIn('student_id', $studentIds)
            ->get()
            ->keyBy(fn (ModuleGrade $grade) => $grade->module_id.':'.$grade->student_id);

        [$columns, $columnModules] = $this->buildColumns($modules);

        $weightMap = $this->weights();
        $rows = [];
        $allFinals = [];

        foreach ($students as $student) {
            $cells = [];
            $moduleScores = [];
            $objectiveScores = [];

            foreach ($modules as $module) {
                $grade = $grades->get($module->id.':'.$student->id);
                $max = (float) ($maxPoints[$module->id] ?? 0);
                $raw = isset($earned[$module->id][$student->id])
                    ? round(min(100, ($earned[$module->id][$student->id] / max($max, 1)) * 100), 2)
                    : null;

                $score = $grade !== null && $grade->override_score !== null
                    ? (float) $grade->override_score
                    : $raw;

                $moduleScores[$module->id] = [
                    'module_id' => $module->id,
                    'title' => $module->title,
                    'assessment_type' => $module->assessment_type,
                    'kktp' => $this->kktpFor($module),
                    'score' => $score,
                    'system_score' => $raw,
                    'override_score' => $grade?->override_score !== null ? (float) $grade->override_score : null,
                    'override_reason' => $grade?->override_reason,
                    'overridden_by' => $grade?->overridden_by,
                    'overridden_at' => $grade?->overridden_at?->toIso8601String(),
                    'grade_id' => $grade?->id,
                    'status' => $grade?->status,
                    'is_passed' => $score === null ? null : $score >= $this->kktpFor($module),
                ];
            }

            foreach ($columns as $column) {
                $pairs = [];
                $cellModules = [];

                foreach ($columnModules[$column['key']] as $moduleId) {
                    $moduleScore = $moduleScores[$moduleId] ?? null;

                    if ($moduleScore === null) {
                        continue;
                    }

                    $cellModules[] = $moduleScore;

                    if ($moduleScore['score'] !== null) {
                        $pairs[] = [
                            'score' => $moduleScore['score'],
                            'weight' => (float) ($weightMap[$moduleScore['assessment_type']] ?? 0),
                        ];
                    }
                }

                $columnScore = $this->weightedAverage($pairs);
                $passed = $columnScore === null ? null : $columnScore >= $column['kktp'];

                $cells[$column['key']] = [
                    'score' => $columnScore,
                    'passed' => $passed,
                    'has_override' => collect($cellModules)->contains(fn ($m) => $m['override_score'] !== null),
                    'modules' => array_map(fn ($m) => [
                        'module_id' => $m['module_id'],
                        'title' => $m['title'],
                        'assessment_type' => $m['assessment_type'],
                        'score' => $m['score'],
                        'system_score' => $m['system_score'],
                        'override_score' => $m['override_score'],
                        'kktp' => $m['kktp'],
                        'is_passed' => $m['is_passed'],
                        'grade_id' => $m['grade_id'],
                        'status' => $m['status'],
                    ], $cellModules),
                ];

                if ($columnScore !== null) {
                    $objectiveScores[] = [
                        'key' => $column['key'],
                        'code' => $column['code'],
                        'description' => $column['description'],
                        'score' => $columnScore,
                        'kktp' => $column['kktp'],
                    ];
                }
            }

            $finalPairs = [];
            foreach ($moduleScores as $moduleScore) {
                if ($moduleScore['score'] === null) {
                    continue;
                }

                $finalPairs[] = [
                    'score' => $moduleScore['score'],
                    'weight' => (float) ($weightMap[$moduleScore['assessment_type']] ?? 0),
                ];
            }

            $final = $this->weightedAverage($finalPairs);
            $status = $final === null
                ? self::STATUS_NO_SCORE
                : ($final >= $this->kktpDefault() ? self::STATUS_TUNTAS : self::STATUS_BELUM);

            if ($final !== null) {
                $allFinals[] = $final;
            }

            $rows[] = [
                'id' => $student->id,
                'name' => $student->name,
                'nisn' => $student->nisn,
                'username' => $student->username,
                'final_score' => $final,
                'is_passed' => $final === null ? null : $final >= $this->kktpDefault(),
                'status' => $status,
                'description' => $this->describeAchievement($objectiveScores),
                'cells' => $cells,
                'modules' => array_values($moduleScores),
            ];
        }

        usort($rows, fn (array $a, array $b) => strcasecmp((string) $a['name'], (string) $b['name']));

        $tuntas = collect($rows)->where('status', self::STATUS_TUNTAS)->count();
        $belum = collect($rows)->where('status', self::STATUS_BELUM)->count();

        return [
            'columns' => $columns,
            'students' => $rows,
            'summary' => [
                'students' => count($rows),
                'graded' => count($allFinals),
                'tuntas' => $tuntas,
                'belum' => $belum,
                'average' => $allFinals === [] ? null : round(array_sum($allFinals) / count($allFinals), 2),
                'kktp' => $this->kktpDefault(),
            ],
        ];
    }

    /**
     * Rincian jawaban siswa per blok pada satu ploting (untuk slide-over).
     *
     * @return array<string, mixed>
     */
    public function studentDetail(TeachingAssignment $assignment, int $studentId): array
    {
        $assignment->loadMissing(['subject:id,code,name', 'classroom:id,name']);

        $student = User::query()->find($studentId);

        abort_if($student === null, 404);

        $modules = LearningModule::query()
            ->where('teaching_assignment_id', $assignment->id)
            ->with('learningObjective:id,code,description')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        $matrix = $this->computeMatrix($modules, collect([$student]));
        $row = $matrix['students'][0] ?? null;

        $blocks = DB::table('module_blocks as mb')
            ->leftJoin('student_responses as sr', function ($join) use ($studentId) {
                $join->on('sr.module_block_id', '=', 'mb.id')
                    ->where('sr.student_id', '=', $studentId);
            })
            ->whereIn('mb.module_id', $modules->pluck('id')->all())
            ->orderBy('mb.module_id')
            ->orderBy('mb.order_index')
            ->select([
                'mb.id as block_id',
                'mb.module_id',
                'mb.order_index',
                'mb.block_type',
                'mb.points',
                'sr.id as response_id',
                'sr.answer_payload',
                'sr.earned_points',
                'sr.ai_feedback',
                'sr.is_graded',
                'sr.updated_at as answered_at',
            ])
            ->get()
            ->groupBy('module_id');

        $detailModules = $modules->map(function (LearningModule $module) use ($row, $blocks) {
            $moduleRow = collect($row['modules'] ?? [])->firstWhere('module_id', $module->id);

            return [
                'id' => $module->id,
                'title' => $module->title,
                'assessment_type' => $module->assessment_type,
                'kktp' => $this->kktpFor($module),
                'objective' => $module->learningObjective?->only(['id', 'code', 'description']),
                'score' => $moduleRow['score'] ?? null,
                'system_score' => $moduleRow['system_score'] ?? null,
                'override_score' => $moduleRow['override_score'] ?? null,
                'override_reason' => $moduleRow['override_reason'] ?? null,
                'grade_id' => $moduleRow['grade_id'] ?? null,
                'is_passed' => $moduleRow['is_passed'] ?? null,
                'blocks' => collect($blocks->get($module->id, []))->map(fn ($block) => [
                    'block_id' => $block->block_id,
                    'block_type' => $block->block_type,
                    'points' => (int) $block->points,
                    'earned_points' => $block->response_id === null ? null : (float) $block->earned_points,
                    'is_graded' => $block->response_id === null ? null : (bool) $block->is_graded,
                    'ai_feedback' => $block->ai_feedback,
                    'answer' => $block->answer_payload === null ? null : json_decode($block->answer_payload, true),
                    'answered_at' => $block->answered_at,
                ])->values()->all(),
            ];
        })->values()->all();

        return [
            'student' => [
                'id' => $student->id,
                'name' => $student->name,
                'nisn' => $student->nisn,
                'username' => $student->username,
            ],
            'final_score' => $row['final_score'] ?? null,
            'status' => $row['status'] ?? self::STATUS_NO_SCORE,
            'description' => $row['description'] ?? $this->describeAchievement([]),
            'modules' => $detailModules,
        ];
    }

    /**
     * Rekap nilai siswa lintas mapel pada satu tahun pelajaran.
     *
     * @return array<string, mixed>
     */
    public function studentReport(User $student, ?int $academicYearId = null): array
    {
        $yearId = $academicYearId
            ?? ClassroomStudent::query()->where('student_id', $student->id)->max('academic_year_id');

        $classroomIds = ClassroomStudent::query()
            ->where('student_id', $student->id)
            ->when($yearId, fn ($query) => $query->where('academic_year_id', $yearId))
            ->pluck('classroom_id')
            ->all();

        $assignments = TeachingAssignment::query()
            ->whereIn('classroom_id', $classroomIds)
            ->when($yearId, fn ($query) => $query->where('academic_year_id', $yearId))
            ->with(['subject:id,code,name', 'classroom:id,name', 'academicYear:id,name,semester'])
            ->get();

        $modules = LearningModule::query()
            ->whereIn('teaching_assignment_id', $assignments->pluck('id')->all())
            ->with(['learningObjective:id,code,description,subject_id', 'teachingAssignment:id,subject_id'])
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        $kktp = $this->kktpDefault();
        $subjects = [];

        foreach ($modules->groupBy(fn (LearningModule $module) => $module->teachingAssignment?->subject_id ?? $module->learningObjective?->subject_id ?? 0) as $subjectId => $subjectModules) {
            $assignment = $assignments->firstWhere('subject_id', $subjectId);
            $matrix = $this->computeMatrix($subjectModules->values(), collect([$student]));
            $row = $matrix['students'][0] ?? null;

            if ($row === null) {
                continue;
            }

            $assessments = collect($row['modules'])
                ->filter(fn (array $module) => $module['score'] !== null)
                ->map(fn (array $module) => [
                    'module_id' => $module['module_id'],
                    'title' => $module['title'],
                    'assessment_type' => $module['assessment_type'],
                    'kktp' => $module['kktp'],
                    'score' => $module['score'],
                    'is_passed' => $module['is_passed'],
                    'has_override' => $module['override_score'] !== null,
                    'status' => $module['status'],
                ])
                ->values()
                ->all();

            $subjects[] = [
                'subject_id' => (int) $subjectId,
                'subject_code' => $assignment?->subject?->code,
                'subject' => $assignment?->subject?->name ?? 'Mata Pelajaran',
                'classroom' => $assignment?->classroom?->name,
                'year' => $assignment?->academicYear?->name,
                'semester' => $assignment?->academicYear?->semester,
                'kktp' => $kktp,
                'final_score' => $row['final_score'],
                'is_passed' => $row['is_passed'],
                'status' => $row['status'],
                'description' => $row['description'],
                'objectives' => array_map(fn (array $column) => [
                    'key' => $column['key'],
                    'code' => $column['code'],
                    'description' => $column['description'],
                    'kktp' => $column['kktp'],
                    'score' => $row['cells'][$column['key']]['score'] ?? null,
                    'passed' => $row['cells'][$column['key']]['passed'] ?? null,
                ], $matrix['columns']),
                'assessments' => $assessments,
            ];
        }

        usort($subjects, fn (array $a, array $b) => strcasecmp((string) $a['subject'], (string) $b['subject']));

        return [
            'student' => [
                'id' => $student->id,
                'name' => $student->name,
                'nisn' => $student->nisn,
            ],
            'year' => $yearId,
            'kktp' => $kktp,
            'subjects' => $subjects,
            'summary' => [
                'subjects' => count($subjects),
                'average' => $this->averageOf(collect($subjects)->pluck('final_score')->all()),
                'tuntas' => collect($subjects)->where('status', self::STATUS_TUNTAS)->count(),
                'belum' => collect($subjects)->where('status', self::STATUS_BELUM)->count(),
            ],
        ];
    }

    /**
     * Terapkan override manual guru pada satu rekap modul.
     */
    public function override(ModuleGrade $grade, float $score, string $reason, User $actor): ModuleGrade
    {
        $grade->forceFill([
            'override_score' => round($score, 2),
            'override_reason' => $reason,
            'overridden_by' => $actor->id,
            'overridden_at' => now(),
        ])->save();

        return $grade->refresh();
    }

    public function clearOverride(ModuleGrade $grade): ModuleGrade
    {
        $grade->forceFill([
            'override_score' => null,
            'override_reason' => null,
            'overridden_by' => null,
            'overridden_at' => null,
        ])->save();

        return $grade->refresh();
    }

    /**
     * Deskripsi capaian TP otomatis (0 token AI) dari skor per TP.
     *
     * @param  array<int, array{code?: string, description: string, score: float|null}>  $objectives
     */
    public function describeAchievement(array $objectives, ?float $kktp = null): string
    {
        $kktp ??= $this->kktpDefault();

        $scored = array_values(array_filter(
            $objectives,
            fn (array $objective) => isset($objective['score']) && $objective['score'] !== null,
        ));

        if ($scored === []) {
            return 'Belum ada nilai asesmen yang tercatat.';
        }

        usort($scored, fn (array $a, array $b) => $b['score'] <=> $a['score']);

        $highest = $scored[0];
        $lowest = $scored[count($scored) - 1];

        $text = $this->masteryClause($highest['description'], (float) $highest['score'], $kktp).'.';

        if (count($scored) > 1) {
            if ((float) $lowest['score'] < $kktp) {
                $text .= ' Perlu pendampingan pada '.$this->cleanDescription($lowest['description']).'.';
            } elseif (((float) $highest['score'] - (float) $lowest['score']) >= 5) {
                $text .= ' Capaian terendah pada '.$this->cleanDescription($lowest['description']).' masih memenuhi KKTP.';
            }
        }

        return $text;
    }

    private function masteryClause(string $description, float $score, float $kktp): string
    {
        $description = $this->cleanDescription($description);

        return match (true) {
            $score >= 90 => 'Menguasai '.$description.' dengan sangat baik',
            $score >= $kktp => 'Menguasai '.$description.' dengan baik',
            $score >= max(0, $kktp - 10) => 'Cukup menguasai '.$description,
            default => 'Belum menguasai '.$description,
        };
    }

    private function cleanDescription(string $description): string
    {
        return $this->lowerFirst(rtrim(trim($description), '. '));
    }

    private function lowerFirst(string $text): string
    {
        if ($text === '') {
            return $text;
        }

        return mb_strtolower(mb_substr($text, 0, 1)).mb_substr($text, 1);
    }

    /**
     * Rata-rata berbobot yang dinormalisasi hanya pada bobot yang tersedia.
     *
     * @param  array<int, array{score: float, weight: float}>  $pairs
     */
    private function weightedAverage(array $pairs): ?float
    {
        if ($pairs === []) {
            return null;
        }

        $weightSum = array_sum(array_column($pairs, 'weight'));
        $total = 0.0;

        if ($weightSum <= 0) {
            foreach ($pairs as $pair) {
                $total += $pair['score'];
            }

            return round($total / count($pairs), 2);
        }

        foreach ($pairs as $pair) {
            $total += $pair['score'] * $pair['weight'];
        }

        return round($total / $weightSum, 2);
    }

    /**
     * @param  Collection<int, LearningModule>  $modules
     * @return array{0: array<int, array<string, mixed>>, 1: array<string, array<int, int>>}
     */
    private function buildColumns(Collection $modules): array
    {
        $columns = [];
        $columnModules = [];

        foreach ($modules as $module) {
            $objective = $module->learningObjective;
            $key = $objective !== null ? 'tp-'.$objective->id : 'module-'.$module->id;

            if (! isset($columnModules[$key])) {
                $columnModules[$key] = [];
                $columns[] = [
                    'key' => $key,
                    'code' => $objective?->code ?? 'MOD-'.$module->id,
                    'description' => $objective?->description ?? $module->title,
                    'kktp' => $this->kktpFor($module),
                ];
            }

            $columnModules[$key][] = $module->id;

            // KKTP kolom TP mengikuti ambang tertinggi di antara modulnya.
            $index = array_search($key, array_column($columns, 'key'), true);
            if ($index !== false) {
                $columns[$index]['kktp'] = max($columns[$index]['kktp'], $this->kktpFor($module));
            }
        }

        return [$columns, $columnModules];
    }

    /**
     * @param  array<int, int>  $moduleIds
     * @return array<int, float>
     */
    private function maxPointsForModules(array $moduleIds): array
    {
        if ($moduleIds === []) {
            return [];
        }

        return DB::table('module_blocks')
            ->whereIn('module_id', $moduleIds)
            ->groupBy('module_id')
            ->selectRaw('module_id, SUM(points) as total_points')
            ->pluck('total_points', 'module_id')
            ->map(fn ($points) => (float) $points)
            ->all();
    }

    /**
     * Poin terbaik per blok per siswa, dijumlahkan per modul.
     *
     * @param  array<int, int>  $moduleIds
     * @param  array<int, int>  $studentIds
     * @return array<int, array<int, float>>
     */
    private function earnedByStudentForModules(array $moduleIds, array $studentIds = []): array
    {
        if ($moduleIds === []) {
            return [];
        }

        $bestPerBlock = DB::table('student_responses as sr')
            ->join('module_blocks as mb', 'mb.id', '=', 'sr.module_block_id')
            ->whereIn('mb.module_id', $moduleIds)
            ->when($studentIds !== [], fn ($query) => $query->whereIn('sr.student_id', $studentIds))
            ->groupBy('mb.module_id', 'sr.student_id', 'sr.module_block_id')
            ->selectRaw('mb.module_id, sr.student_id, MAX(sr.earned_points) as best_points')
            ->get();

        $earned = [];

        foreach ($bestPerBlock as $row) {
            $moduleId = (int) $row->module_id;
            $studentId = (int) $row->student_id;
            $earned[$moduleId][$studentId] = ($earned[$moduleId][$studentId] ?? 0) + (float) $row->best_points;
        }

        return $earned;
    }

    /**
     * @return Collection<int, User>
     */
    private function studentsForAssignment(TeachingAssignment $assignment): Collection
    {
        $studentIds = ClassroomStudent::query()
            ->where('academic_year_id', $assignment->academic_year_id)
            ->where('classroom_id', $assignment->classroom_id)
            ->pluck('student_id')
            ->all();

        return User::query()
            ->whereIn('id', $studentIds)
            ->orderBy('name')
            ->get(['id', 'name', 'nisn', 'username']);
    }

    /**
     * @param  Collection<int, LearningModule>  $modules
     * @return array<int, int>
     */
    private function studentIdsForModules(Collection $modules): array
    {
        $ids = [];

        foreach ($modules->groupBy(fn (LearningModule $module) => $module->teachingAssignment?->classroom_id.'|'.$module->teachingAssignment?->academic_year_id) as $group) {
            $assignment = $group->first()?->teachingAssignment;

            if ($assignment === null) {
                continue;
            }

            $ids = array_merge($ids, ClassroomStudent::query()
                ->where('academic_year_id', $assignment->academic_year_id)
                ->where('classroom_id', $assignment->classroom_id)
                ->pluck('student_id')
                ->all());
        }

        return array_values(array_unique(array_map('intval', $ids)));
    }
}
