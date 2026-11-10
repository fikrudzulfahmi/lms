<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Http\Requests\OverrideGradeRequest;
use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\LearningModule;
use App\Models\ModuleGrade;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use App\Services\GradeCalculationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class GradebookController extends Controller
{
    public function __construct(private readonly GradeCalculationService $grades) {}

    public function index(Request $request): Response
    {
        $user = $request->user();
        $assignments = $this->assignmentsFor($user);
        $options = $this->filterOptions($assignments);

        $resolved = $this->resolveAssignment($request, $assignments);

        return Inertia::render('Teacher/Gradebook/Index', [
            'assignments' => $options['assignments'],
            'filters' => $resolved['filters'],
            'matrix' => $resolved['assignment'] === null
                ? null
                : $this->grades->gradebook($resolved['assignment']),
            'options' => [
                'years' => $options['years'],
                'classrooms' => $options['classrooms'],
                'subjects' => $options['subjects'],
            ],
            'urls' => [
                'index' => route('teacher.gradebook.index'),
                'show' => $resolved['assignment'] === null ? null : route('teacher.gradebook.show', [
                    'classroom' => $resolved['assignment']->classroom_id,
                    'subject' => $resolved['assignment']->subject_id,
                    'year' => $resolved['assignment']->academic_year_id,
                ]),
            ],
            'has_assignments' => $assignments->isNotEmpty(),
        ]);
    }

    public function show(Request $request, Classroom $classroom, Subject $subject): Response
    {
        $assignment = $this->findScopedAssignment($request->user(), $classroom->id, $subject->id, $request->integer('year') ?: null);

        $matrix = $this->grades->gradebook($assignment);

        return Inertia::render('Teacher/Gradebook/Show', [
            'matrix' => $matrix,
            'filters' => [
                'year' => $assignment->academic_year_id,
                'classroom' => $classroom->id,
                'subject' => $subject->id,
            ],
            'urls' => [
                'index' => route('teacher.gradebook.index', [
                    'year' => $assignment->academic_year_id,
                    'classroom' => $classroom->id,
                    'subject' => $subject->id,
                ]),
                'detail' => route('teacher.gradebook.student', [
                    'classroom' => $classroom->id,
                    'subject' => $subject->id,
                    'student' => '__STUDENT__',
                    'year' => $assignment->academic_year_id,
                ]),
                'export' => route('teacher.gradebook.export', [
                    'classroom' => $classroom->id,
                    'subject' => $subject->id,
                    'year' => $assignment->academic_year_id,
                ]),
            ],
        ]);
    }

    public function studentDetail(Request $request, Classroom $classroom, Subject $subject, User $student): \Illuminate\Http\JsonResponse
    {
        $assignment = $this->findScopedAssignment($request->user(), $classroom->id, $subject->id, $request->integer('year') ?: null);

        return response()->json($this->grades->studentDetail($assignment, $student->id));
    }

    public function export(Request $request, Classroom $classroom, Subject $subject): StreamedResponse
    {
        $assignment = $this->findScopedAssignment($request->user(), $classroom->id, $subject->id, $request->integer('year') ?: null);
        $matrix = $this->grades->gradebook($assignment);

        $filename = sprintf(
            'nilai-%s-%s-%s.csv',
            Str::slug($classroom->name),
            Str::slug($subject->code ?: $subject->name),
            Str::slug(str_replace('/', '-', (string) ($assignment->academicYear?->name ?? 'tahun'))),
        );

        $headers = array_merge(
            ['No', 'NISN', 'Nama'],
            array_map(fn (array $column) => $column['code'], $matrix['columns']),
            ['Nilai Akhir', 'Status KKTP', 'Deskripsi Capaian'],
        );

        return response()->streamDownload(function () use ($matrix, $headers): void {
            $stream = fopen('php://output', 'w');

            // UTF-8 BOM agar Excel membaca aksen dan tanda baca Indonesia dengan benar.
            fwrite($stream, "\xEF\xBB\xBF");
            fputcsv($stream, $headers, ',', '"', '\\');

            foreach ($matrix['students'] as $index => $student) {
                $row = [
                    $index + 1,
                    $student['nisn'] ?? '',
                    $student['name'],
                ];

                foreach ($matrix['columns'] as $column) {
                    $score = $student['cells'][$column['key']]['score'] ?? null;
                    $row[] = $score === null ? '' : number_format((float) $score, 2, '.', '');
                }

                $row[] = $student['final_score'] === null ? '' : number_format((float) $student['final_score'], 2, '.', '');
                $row[] = match ($student['status']) {
                    GradeCalculationService::STATUS_TUNTAS => 'Tuntas',
                    GradeCalculationService::STATUS_BELUM => 'Belum Tuntas',
                    default => 'Belum Ada Nilai',
                };
                $row[] = $student['description'];

                fputcsv($stream, $row, ',', '"', '\\');
            }

            fclose($stream);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store, no-cache',
        ]);
    }

    public function override(OverrideGradeRequest $request, LearningModule $module, User $student): RedirectResponse
    {
        Gate::authorize('update', $module);

        $data = $request->validated();

        // Pastikan rekap modul sudah ada sebelum override diterapkan.
        $this->grades->recalculateModule($module);

        $grade = ModuleGrade::query()
            ->where('module_id', $module->id)
            ->where('student_id', $student->id)
            ->firstOrFail();

        $this->grades->override($grade, (float) $data['score'], $data['reason'], $request->user());

        return back()->with('success', 'Nilai siswa berhasil di-override dan alasan tercatat.');
    }

    /**
     * Plot mengajar yang boleh dilihat: admin semua, guru hanya miliknya.
     *
     * @return Collection<int, TeachingAssignment>
     */
    private function assignmentsFor(User $user): Collection
    {
        return TeachingAssignment::query()
            ->when($user->role === User::ROLE_TEACHER, fn (Builder $query) => $query->where('teacher_id', $user->id))
            ->with([
                'subject:id,code,name',
                'classroom:id,name,grade_level',
                'academicYear:id,name,semester,is_active',
            ])
            ->orderByDesc('academic_year_id')
            ->orderBy('classroom_id')
            ->get();
    }

    /**
     * @param  Collection<int, TeachingAssignment>  $assignments
     * @return array{assignments: array<int, array<string, mixed>>, years: array<int, array<string, mixed>>, classrooms: array<int, array<string, mixed>>, subjects: array<int, array<string, mixed>>}
     */
    private function filterOptions(Collection $assignments): array
    {
        return [
            'assignments' => $assignments->map(fn (TeachingAssignment $assignment) => [
                'id' => $assignment->id,
                'year_id' => $assignment->academic_year_id,
                'year' => $assignment->academicYear?->name,
                'semester' => $assignment->academicYear?->semester,
                'classroom_id' => $assignment->classroom_id,
                'classroom' => $assignment->classroom?->name,
                'subject_id' => $assignment->subject_id,
                'subject' => $assignment->subject?->name,
                'subject_code' => $assignment->subject?->code,
            ])->values()->all(),
            'years' => $assignments
                ->pluck('academicYear')
                ->filter()
                ->unique('id')
                ->map(fn (AcademicYear $year) => [
                    'id' => $year->id,
                    'name' => $year->name,
                    'semester' => $year->semester,
                    'is_active' => (bool) $year->is_active,
                ])
                ->values()
                ->all(),
            'classrooms' => $assignments
                ->pluck('classroom')
                ->filter()
                ->unique('id')
                ->map(fn (Classroom $classroom) => [
                    'id' => $classroom->id,
                    'name' => $classroom->name,
                    'grade_level' => $classroom->grade_level,
                ])
                ->values()
                ->all(),
            'subjects' => $assignments
                ->pluck('subject')
                ->filter()
                ->unique('id')
                ->map(fn (Subject $subject) => [
                    'id' => $subject->id,
                    'code' => $subject->code,
                    'name' => $subject->name,
                ])
                ->values()
                ->all(),
        ];
    }

    /**
     * @param  Collection<int, TeachingAssignment>  $assignments
     * @return array{filters: array<string, int|null>, assignment: TeachingAssignment|null}
     */
    private function resolveAssignment(Request $request, Collection $assignments): array
    {
        $filters = [
            'year' => $request->integer('year') ?: null,
            'classroom' => $request->integer('classroom') ?: null,
            'subject' => $request->integer('subject') ?: null,
        ];

        $assignment = $assignments
            ->when($filters['year'], fn (Collection $items, int $year) => $items->where('academic_year_id', $year))
            ->when($filters['classroom'], fn (Collection $items, int $classroom) => $items->where('classroom_id', $classroom))
            ->when($filters['subject'], fn (Collection $items, int $subject) => $items->where('subject_id', $subject))
            ->first();

        if ($assignment === null && $filters === ['year' => null, 'classroom' => null, 'subject' => null]) {
            $assignment = $assignments->first();
        }

        return [
            'assignment' => $assignment,
            'filters' => [
                'year' => $assignment?->academic_year_id,
                'classroom' => $assignment?->classroom_id,
                'subject' => $assignment?->subject_id,
            ],
        ];
    }

    private function findScopedAssignment(User $user, int $classroomId, int $subjectId, ?int $yearId): TeachingAssignment
    {
        $query = TeachingAssignment::query()
            ->where('classroom_id', $classroomId)
            ->where('subject_id', $subjectId)
            ->when($yearId !== null, fn (Builder $builder) => $builder->where('academic_year_id', $yearId))
            ->when($user->role === User::ROLE_TEACHER, fn (Builder $builder) => $builder->where('teacher_id', $user->id))
            ->with(['subject:id,code,name', 'classroom:id,name,grade_level', 'academicYear:id,name,semester']);

        if ($yearId === null) {
            $query->orderByDesc('academic_year_id');
        }

        $assignment = $query->first();

        abort_if($assignment === null, 403, 'Anda tidak mengampu kelas/mata pelajaran ini.');

        return $assignment;
    }
}
