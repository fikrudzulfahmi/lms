<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\ClassroomStudent;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Models\ModuleProgress;
use App\Models\Submission;
use App\Models\TeachingAssignment;
use App\Services\LiveSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Belajar mandiri: siswa membuka modul terpublikasi di kelasnya, menjawab
 * blok soal sebagai latihan (dinilai seketika, TIDAK masuk gradebook), dan
 * menandai blok materi selesai. Progres per siswa tersimpan di
 * module_progress; modul tuntas 100% mendapat lencana (completed_at).
 */
class PracticeController extends Controller
{
    public function __construct(private readonly LiveSessionService $sessions) {}

    public function show(Request $request, LearningModule $module): Response
    {
        $this->accessibleModule($request, $module);

        $module->load([
            'teachingAssignment.subject:id,code,name',
            'teachingAssignment.teacher:id,name',
        ]);

        $progress = $this->progressFor($request, $module);

        // Kunci berurutan: blok sesudah blok pertama yang belum selesai
        // terkunci — kontennya TIDAK dikirim sama sekali agar tidak bisa
        // diintip siswa dari data halaman.
        $lockedIds = $this->lockedBlockIds(
            $module,
            array_map('strval', $progress?->completed_blocks ?? []),
        );

        $blocks = $module->blocks()
            ->orderBy('order_index')
            ->orderBy('created_at')
            ->get()
            ->map(function (ModuleBlock $block) use ($lockedIds) {
                $locked = in_array($block->id, $lockedIds, true);

                return [
                    'id' => $block->id,
                    'order_index' => $block->order_index,
                    'block_type' => $block->block_type,
                    'points' => $block->points,
                    'locked' => $locked,
                    // Mode latihan: konten dikirim apa adanya (termasuk kunci)
                    // agar blok bisa memeriksa jawaban secara lokal. ai_rubric
                    // TIDAK ikut — itu rahasia penilaian AI guru.
                    'content' => $locked ? [] : $block->content,
                ];
            })
            ->values();

        $submissions = Submission::query()
            ->where('student_id', $request->user()->id)
            ->whereIn('module_block_id', $blocks->pluck('id'))
            ->get()
            ->mapWithKeys(fn (Submission $submission) => [
                $submission->module_block_id => $this->submissionPayload($submission),
            ])
            ->all();

        return Inertia::render('Student/Practice/Show', [
            'module' => [
                'id' => $module->id,
                'title' => $module->title,
                'subject' => $module->teachingAssignment?->subject?->name,
                'subject_code' => $module->teachingAssignment?->subject?->code,
                'teacher' => $module->teachingAssignment?->teacher?->name,
                'assessment_type' => $module->assessment_type,
                'sequential_lock' => (bool) $module->sequential_lock,
            ],
            'blocks' => $blocks,
            'progress' => $this->progressPayload($module, $progress),
            'submissions' => $submissions,
            'urls' => [
                'progress' => route('student.practice.progress', $module),
                'answer' => route('student.practice.answer', $module),
                'submission' => route('student.practice.submission', $module),
                'upload' => route('student.uploads.store'),
                'home' => route('student.home'),
            ],
        ]);
    }

    public function markProgress(Request $request, LearningModule $module): JsonResponse
    {
        $this->accessibleModule($request, $module);

        $data = $request->validate([
            'block_id' => ['required', 'string'],
        ]);

        $block = $this->findBlock($module, $data['block_id']);
        $this->ensureUnlocked($request, $module, $block);

        if ($block->block_type === ModuleBlock::BLOCK_SECTION_HEADING) {
            throw ValidationException::withMessages([
                'block_id' => 'Blok judul bagian tidak dihitung sebagai progres.',
            ]);
        }

        if ($block->block_type === ModuleBlock::BLOCK_PRAKTIK_CHECKLIST) {
            throw ValidationException::withMessages([
                'block_id' => 'Checklist praktik selesai otomatis bila semua langkah tercentang dan foto wajib terunggah.',
            ]);
        }

        if ($block->block_type === ModuleBlock::BLOCK_TUGAS_UPLOAD) {
            throw ValidationException::withMessages([
                'block_id' => 'Tugas unggah selesai dengan mengumpulkan tugas, bukan menandai selesai.',
            ]);
        }

        $progress = $this->progressFor($request, $module, create: true);

        $completed = array_map('strval', $progress->completed_blocks ?? []);
        if (! in_array($block->id, $completed, true)) {
            $completed[] = $block->id;
        }

        $progress->completed_blocks = $completed;
        $this->syncCompletion($module, $progress);

        return response()->json($this->progressPayload($module, $progress->fresh()));
    }

    public function answer(Request $request, LearningModule $module): JsonResponse
    {
        $this->accessibleModule($request, $module);

        $data = $request->validate([
            'block_id' => ['required', 'string'],
            'answer' => ['required', 'array'],
        ]);

        if (strlen((string) json_encode($data['answer'])) > (int) config('live.max_answer_bytes', 16384)) {
            throw ValidationException::withMessages([
                'answer' => 'Jawaban terlalu besar.',
            ]);
        }

        $block = $this->findBlock($module, $data['block_id']);
        $this->ensureUnlocked($request, $module, $block);

        $grade = $this->sessions->gradeAnswer($block, $data['answer']);

        $progress = $this->progressFor($request, $module, create: true);

        $answers = $progress->answers ?? [];
        $answers[$block->id] = [
            'payload' => $data['answer'],
            'correct' => $grade['correct'],
            'earned_points' => $grade['earned_points'],
            'is_graded' => $grade['is_graded'],
            'answered_at' => now()->toIso8601String(),
        ];
        $progress->answers = $answers;

        if ($block->block_type !== ModuleBlock::BLOCK_SECTION_HEADING) {
            $completed = array_map('strval', $progress->completed_blocks ?? []);

            // Checklist praktik: selesai hanya bila SEMUA langkah tercentang
            // dan semua foto wajib sudah terunggah; bila siswa membatalkan
            // centang, status selesai ikut dicabut.
            $isComplete = $block->block_type !== ModuleBlock::BLOCK_PRAKTIK_CHECKLIST
                || $this->checklistComplete($block, $data['answer']);

            if ($isComplete && ! in_array($block->id, $completed, true)) {
                $completed[] = $block->id;
            }
            if (! $isComplete) {
                $completed = array_values(array_diff($completed, [$block->id]));
            }
            $progress->completed_blocks = $completed;
        }

        $this->syncCompletion($module, $progress);

        $payload = $this->progressPayload($module, $progress->fresh());

        return response()->json([
            'correct' => $grade['correct'],
            'earned_points' => $grade['earned_points'],
            'is_graded' => $grade['is_graded'],
            'completed_blocks' => $payload['completed_blocks'],
            'percent' => $payload['percent'],
            'completed_at' => $payload['completed_at'],
        ]);
    }

    /**
     * Kumpulkan (atau kumpulkan ulang) tugas unggah. Pengumpulan ulang
     * mengosongkan nilai lama — guru menilai ulang dari awal.
     */
    public function submitAssignment(Request $request, LearningModule $module): JsonResponse
    {
        $this->accessibleModule($request, $module);

        $data = $request->validate([
            'block_id' => ['required', 'string'],
            'files' => ['required', 'array', 'min:1', 'max:5'],
            'files.*.name' => ['required', 'string', 'max:255'],
            'files.*.url' => ['required', 'string', 'max:2048'],
            'files.*.size' => ['nullable', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:5000'],
        ]);

        $block = $this->findBlock($module, $data['block_id']);
        $this->ensureUnlocked($request, $module, $block);

        if ($block->block_type !== ModuleBlock::BLOCK_TUGAS_UPLOAD) {
            throw ValidationException::withMessages([
                'block_id' => 'Blok ini bukan tugas unggah.',
            ]);
        }

        $maxFiles = max(1, min(5, (int) ($block->content['max_files'] ?? 3)));

        if (count($data['files']) > $maxFiles) {
            throw ValidationException::withMessages([
                'files' => "Tugas ini menerima maksimal {$maxFiles} berkas.",
            ]);
        }

        // Siswa hanya boleh menautkan berkas dari folder unggahannya sendiri.
        $ownPrefix = '/storage/student-uploads/'.$request->user()->id.'/';

        foreach ($data['files'] as $file) {
            if (! str_starts_with((string) ($file['url'] ?? ''), $ownPrefix)) {
                throw ValidationException::withMessages([
                    'files' => 'Berkas harus berasal dari unggahanmu sendiri.',
                ]);
            }
        }

        $submission = Submission::query()->updateOrCreate(
            [
                'module_block_id' => $block->id,
                'student_id' => $request->user()->id,
            ],
            [
                'files' => array_values(array_map(fn ($file) => [
                    'name' => (string) $file['name'],
                    'url' => (string) $file['url'],
                    'size' => (int) ($file['size'] ?? 0),
                ], $data['files'])),
                'note' => $data['note'] ?? null,
                'status' => Submission::STATUS_SUBMITTED,
                'rubric_scores' => null,
                'feedback' => null,
                'score' => null,
                'graded_by' => null,
                'graded_at' => null,
            ],
        );

        $progress = $this->progressFor($request, $module, create: true);
        $completed = array_map('strval', $progress->completed_blocks ?? []);
        if (! in_array($block->id, $completed, true)) {
            $completed[] = $block->id;
        }
        $progress->completed_blocks = $completed;
        $this->syncCompletion($module, $progress);

        $payload = $this->progressPayload($module, $progress->fresh());

        return response()->json([
            'submission' => $this->submissionPayload($submission->fresh()),
            'percent' => $payload['percent'],
            'completed_at' => $payload['completed_at'],
        ]);
    }

    /**
     * Checklist lengkap = semua indeks langkah ada di daftar centang dan
     * setiap langkah wajib foto punya URL foto pada indeks yang sama.
     *
     * @param  array<string, mixed>  $payload
     */
    private function checklistComplete(ModuleBlock $block, array $payload): bool
    {
        $steps = array_values((array) ($block->content['steps'] ?? []));
        $checked = array_map('intval', (array) ($payload['checked'] ?? []));
        $photos = (array) ($payload['photos'] ?? []);

        foreach ($steps as $index => $step) {
            if (! in_array($index, $checked, true)) {
                return false;
            }

            if ((bool) ($step['require_photo'] ?? false)
                && trim((string) ($photos[(string) $index] ?? $photos[$index] ?? '')) === '') {
                return false;
            }
        }

        return $steps !== [];
    }

    /**
     * @return array<string, mixed>
     */
    private function submissionPayload(Submission $submission): array
    {
        return [
            'id' => $submission->id,
            'files' => $submission->files ?? [],
            'note' => $submission->note,
            'status' => $submission->status,
            'score' => $submission->score,
            'rubric_scores' => $submission->rubric_scores,
            'feedback' => $submission->feedback,
            'graded_at' => $submission->graded_at?->toIso8601String(),
            'updated_at' => $submission->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Modul hanya boleh dibuka bila: diterbitkan, mengizinkan latihan, dan
     * plotingnya berada di kelas + tahun penempatan siswa — logika cakupan
     * yang sama dengan HomeController@index.
     */
    private function accessibleModule(Request $request, LearningModule $module): void
    {
        $student = $request->user();
        $activeYear = AcademicYear::active();

        $placement = ClassroomStudent::query()
            ->where('student_id', $student->id)
            ->when($activeYear, fn ($query) => $query->where('academic_year_id', $activeYear->id))
            ->orderByDesc('academic_year_id')
            ->first();

        $yearId = $placement?->academic_year_id ?? $activeYear?->id;

        $accessible = $placement !== null
            && $module->status === LearningModule::STATUS_PUBLISHED
            && (bool) $module->allow_practice
            && TeachingAssignment::query()
                ->whereKey($module->teaching_assignment_id)
                ->where('classroom_id', $placement->classroom_id)
                ->when($yearId, fn ($query) => $query->where('academic_year_id', $yearId))
                ->exists();

        abort_unless($accessible, 404);
    }

    private function findBlock(LearningModule $module, string $blockId): ModuleBlock
    {
        $block = $module->blocks()->whereKey($blockId)->first();

        if ($block === null) {
            throw ValidationException::withMessages([
                'block_id' => 'Blok tidak berasal dari modul ini.',
            ]);
        }

        return $block;
    }

    /**
     * Daftar id blok yang terkunci oleh kunci berurutan: semua blok (selain
     * judul bagian) yang berada SETELAH blok pertama yang belum selesai.
     * Blok selesai dan blok pertama yang belum selesai tidak terkunci.
     *
     * @param  array<int, string>  $completedIds
     * @return array<int, string>
     */
    private function lockedBlockIds(LearningModule $module, array $completedIds): array
    {
        if (! $module->sequential_lock) {
            return [];
        }

        $orderedIds = $module->blocks()
            ->where('block_type', '!=', ModuleBlock::BLOCK_SECTION_HEADING)
            ->orderBy('order_index')
            ->orderBy('created_at')
            ->pluck('id')
            ->map(fn ($id) => (string) $id)
            ->all();

        $locked = [];
        $gateClosed = false;

        foreach ($orderedIds as $id) {
            if ($gateClosed) {
                $locked[] = $id;
                continue;
            }

            if (! in_array($id, $completedIds, true)) {
                $gateClosed = true;
            }
        }

        return $locked;
    }

    /**
     * Tolak aksi (jawab / tandai selesai / kumpulkan tugas) pada blok yang
     * masih terkunci kunci berurutan.
     */
    private function ensureUnlocked(Request $request, LearningModule $module, ModuleBlock $block): void
    {
        if (! $module->sequential_lock
            || $block->block_type === ModuleBlock::BLOCK_SECTION_HEADING) {
            return;
        }

        $progress = $this->progressFor($request, $module);
        $completed = array_map('strval', $progress?->completed_blocks ?? []);

        if (in_array($block->id, $this->lockedBlockIds($module, $completed), true)) {
            throw ValidationException::withMessages([
                'block_id' => 'Blok ini masih terkunci. Selesaikan blok sebelumnya terlebih dahulu.',
            ]);
        }
    }

    private function progressFor(Request $request, LearningModule $module, bool $create = false): ?ModuleProgress
    {
        $attributes = ['student_id' => $request->user()->id, 'module_id' => $module->id];

        return $create
            ? ModuleProgress::query()->firstOrCreate($attributes)
            : ModuleProgress::query()->where($attributes)->first();
    }

    /**
     * Blok yang dihitung dalam progres: semua blok selain judul bagian.
     *
     * @return array<int, string>
     */
    private function eligibleBlockIds(LearningModule $module): array
    {
        return $module->blocks()
            ->where('block_type', '!=', ModuleBlock::BLOCK_SECTION_HEADING)
            ->pluck('id')
            ->map(fn ($id) => (string) $id)
            ->all();
    }

    private function syncCompletion(LearningModule $module, ModuleProgress $progress): void
    {
        $eligible = $this->eligibleBlockIds($module);
        $completed = array_values(array_intersect(
            $eligible,
            array_map('strval', $progress->completed_blocks ?? []),
        ));

        $progress->completed_blocks = $completed;
        $progress->completed_at = $eligible !== [] && count($completed) === count($eligible)
            ? ($progress->completed_at ?? now())
            : null;
        $progress->save();
    }

    /**
     * @return array<string, mixed>
     */
    private function progressPayload(LearningModule $module, ?ModuleProgress $progress): array
    {
        $eligible = $this->eligibleBlockIds($module);
        $completed = array_values(array_intersect(
            $eligible,
            array_map('strval', $progress?->completed_blocks ?? []),
        ));
        $total = count($eligible);

        return [
            'completed_blocks' => $completed,
            'answers' => $progress?->answers ?? [],
            'percent' => $total > 0 ? (int) round(count($completed) / $total * 100) : 0,
            'completed_at' => $progress?->completed_at?->toIso8601String(),
        ];
    }
}
