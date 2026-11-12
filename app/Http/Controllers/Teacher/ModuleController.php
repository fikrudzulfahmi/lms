<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Requests\DuplicateModuleRequest;
use App\Http\Requests\StoreModuleRequest;
use App\Http\Requests\UpdateLearningModuleRequest;
use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\LearningModule;
use App\Models\LiveSession;
use App\Models\LearningObjective;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class ModuleController
{
    public function index(Request $request): Response
    {
        $user = $request->user();

        $modules = LearningModule::query()
            ->when(
                $user->role === User::ROLE_TEACHER,
                fn ($query) => $query->whereHas(
                    'teachingAssignment',
                    fn ($assignment) => $assignment->where('teacher_id', $user->id),
                ),
            )
            ->with([
                'teachingAssignment.subject:id,code,name',
                'teachingAssignment.classroom:id,name,grade_level',
                'teachingAssignment.academicYear:id,name,semester',
                'learningObjective:id,code,description',
            ])
            ->withCount('blocks')
            ->latest('updated_at')
            ->get()
            ->map(fn (LearningModule $module) => $this->serializeModule($module));

        $assignments = TeachingAssignment::query()
            ->when(
                $user->role === User::ROLE_TEACHER,
                fn ($query) => $query->where('teacher_id', $user->id),
            )
            ->with(['subject:id,code,name', 'classroom:id,name', 'academicYear:id,name,semester'])
            ->orderBy('subject_id')
            ->get()
            ->map(fn (TeachingAssignment $assignment) => [
                'id' => $assignment->id,
                'subject_id' => $assignment->subject_id,
                'subject' => $assignment->subject?->name,
                'subject_code' => $assignment->subject?->code,
                'classroom' => $assignment->classroom?->name,
                'year' => $assignment->academicYear?->name,
                'semester' => $assignment->academicYear?->semester,
            ]);

        return Inertia::render('Teacher/Modules/Index', [
            'modules' => $modules,
            'assignments' => $assignments,
            'objectives' => $this->objectiveOptions($assignments->pluck('subject_id')->unique()->all()),
            'assessment_types' => [
                ['value' => LearningModule::ASSESSMENT_FORMATIF, 'label' => 'Formatif'],
                ['value' => LearningModule::ASSESSMENT_SUMATIF_LINGKUP, 'label' => 'Sumatif Lingkup Materi'],
                ['value' => LearningModule::ASSESSMENT_SUMATIF_AKHIR, 'label' => 'Sumatif Akhir Semester'],
            ],
            'stats' => [
                'total' => $modules->count(),
                'draft' => $modules->where('status', LearningModule::STATUS_DRAFT)->count(),
                'published' => $modules->where('status', LearningModule::STATUS_PUBLISHED)->count(),
                'blocks' => $modules->sum('blocks_count'),
            ],
            'active_year' => AcademicYear::active()?->only(['id', 'name', 'semester']),
        ]);
    }

    public function store(StoreModuleRequest $request): RedirectResponse
    {
        $data = $request->validated();

        $module = LearningModule::create([
            'teaching_assignment_id' => $data['teaching_assignment_id'],
            'learning_objective_id' => $data['learning_objective_id'] ?? null,
            'title' => $data['title'],
            'assessment_type' => $data['assessment_type'],
            'kktp_score' => $data['kktp_score'] ?? 75,
            'max_attempts' => $data['max_attempts'] ?? 1,
            'status' => LearningModule::STATUS_DRAFT,
            'settings' => null,
        ]);

        return redirect()
            ->route('teacher.modules.edit', $module)
            ->with('success', 'Modul dibuat. Mulai susun blok materi.');
    }

    public function duplicate(DuplicateModuleRequest $request, LearningModule $module): RedirectResponse
    {
        $data = $request->validated();

        $targetAssignment = isset($data['teaching_assignment_id'])
            ? TeachingAssignment::findOrFail($data['teaching_assignment_id'])
            : $module->teachingAssignment;

        $title = isset($data['title']) && trim((string) $data['title']) !== ''
            ? trim((string) $data['title'])
            : $module->title.' (Salinan)';

        $copy = DB::transaction(function () use ($module, $targetAssignment, $title): LearningModule {
            // TP hanya dipertahankan bila mapel tujuan sama; TP mapel lain
            // akan menyesatkan pemetaan capaian dan generate AI.
            $sameSubject = $targetAssignment !== null
                && $targetAssignment->subject_id === $module->teachingAssignment?->subject_id;

            $copy = LearningModule::create([
                'teaching_assignment_id' => $targetAssignment?->id ?? $module->teaching_assignment_id,
                'learning_objective_id' => $sameSubject ? $module->learning_objective_id : null,
                'title' => $title,
                'assessment_type' => $module->assessment_type,
                'kktp_score' => $module->kktp_score,
                'max_attempts' => $module->max_attempts,
                'status' => LearningModule::STATUS_DRAFT,
                'allow_practice' => $module->allow_practice,
                'sequential_lock' => $module->sequential_lock,
                'settings' => $module->settings,
            ]);

            $blocks = $module->blocks()
                ->orderBy('order_index')
                ->orderBy('created_at')
                ->get();

            foreach ($blocks as $block) {
                $copy->blocks()->create([
                    'order_index' => $block->order_index,
                    'block_type' => $block->block_type,
                    'points' => $block->points,
                    'content' => $block->content,
                    'ai_rubric' => $block->ai_rubric,
                ]);
            }

            return $copy;
        });

        return redirect()
            ->route('teacher.modules.edit', $copy)
            ->with('success', 'Modul diduplikasi sebagai draft. Periksa dan terbitkan bila sudah siap.');
    }

    public function edit(Request $request, LearningModule $module): Response
    {
        Gate::authorize('view', $module);

        $module->load([
            'teachingAssignment.subject:id,code,name',
            'teachingAssignment.classroom:id,name,grade_level',
            'teachingAssignment.academicYear:id,name,semester',
            'learningObjective:id,code,description',
        ]);

        $blocks = $module->blocks()
            ->orderBy('order_index')
            ->orderBy('created_at')
            ->get()
            ->map(fn ($block) => [
                'id' => $block->id,
                'order_index' => $block->order_index,
                'block_type' => $block->block_type,
                'points' => $block->points,
                'content' => $block->content,
                'ai_rubric' => $block->ai_rubric,
            ]);

        $activeSession = $module->liveSessions()
            ->whereIn('status', [LiveSession::STATUS_WAITING, LiveSession::STATUS_ACTIVE])
            ->latest()
            ->first();

        return Inertia::render('Teacher/Modules/Edit', [
            'live' => $activeSession === null ? null : [
                'session_id' => $activeSession->id,
                'stage_url' => route('teacher.live.show', $activeSession),
            ],
            'module' => [
                'id' => $module->id,
                'title' => $module->title,
                'status' => $module->status,
                'allow_practice' => (bool) $module->allow_practice,
                'sequential_lock' => (bool) $module->sequential_lock,
                'assessment_type' => $module->assessment_type,
                'kktp_score' => $module->kktp_score,
                'max_attempts' => $module->max_attempts,
                'subject' => $module->teachingAssignment?->subject?->name,
                'subject_code' => $module->teachingAssignment?->subject?->code,
                'classroom' => $module->teachingAssignment?->classroom?->name,
                'grade_level' => $module->teachingAssignment?->classroom?->grade_level,
                'year' => $module->teachingAssignment?->academicYear?->name,
                'semester' => $module->teachingAssignment?->academicYear?->semester,
                'objective' => $module->learningObjective?->only(['id', 'code', 'description']),
            ],
            'blocks' => $blocks,
            'block_types' => $this->blockTypeOptions(),
            'objectives' => $this->objectiveOptions(
                [$module->teachingAssignment?->subject_id],
                $module->teachingAssignment?->classroom?->grade_level,
            ),
            'ai' => [
                'status' => $module->ai_status,
                'error' => $module->ai_error,
                'generated_at' => $module->ai_generated_at?->toIso8601String(),
            ],
            'urls' => [
                'index' => route('teacher.modules.index'),
                'update' => route('teacher.modules.update', $module),
                'blocks' => route('teacher.modules.blocks.store', $module),
                'blocks_import' => route('teacher.modules.blocks.import', $module),
                'blocks_import_template' => route('teacher.modules.blocks.import.template', $module),
                'upload' => route('teacher.modules.blocks.upload', $module),
                'reorder' => route('teacher.modules.blocks.reorder', $module),
                'slides' => route('teacher.modules.slides.store', $module),
                'ai_generate' => route('teacher.modules.ai.generate', $module),
                'ai_status' => route('teacher.modules.ai.status', $module),
                'submissions' => route('teacher.modules.submissions.index', $module),
                'work' => route('teacher.modules.work', $module),
            ],
        ]);
    }

    public function update(UpdateLearningModuleRequest $request, LearningModule $module): JsonResponse|RedirectResponse
    {
        $module->update($request->validated());

        if ($request->expectsJson()) {
            return response()->json([
                'saved_at' => now()->toIso8601String(),
                'module' => $this->serializeModule($module->fresh(['teachingAssignment.subject', 'teachingAssignment.classroom', 'teachingAssignment.academicYear', 'learningObjective'])),
            ]);
        }

        return back()->with('success', 'Modul diperbarui.');
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeModule(LearningModule $module): array
    {
        return [
            'id' => $module->id,
            'teaching_assignment_id' => $module->teaching_assignment_id,
            'title' => $module->title,
            'status' => $module->status,
            'assessment_type' => $module->assessment_type,
            'kktp_score' => $module->kktp_score,
            'blocks_count' => $module->blocks_count ?? $module->blocks()->count(),
            'subject' => $module->teachingAssignment?->subject?->name,
            'subject_code' => $module->teachingAssignment?->subject?->code,
            'classroom' => $module->teachingAssignment?->classroom?->name,
            'year' => $module->teachingAssignment?->academicYear?->name,
            'semester' => $module->teachingAssignment?->academicYear?->semester,
            'objective_code' => $module->learningObjective?->code,
            'objective' => $module->learningObjective?->description,
            'updated_at' => $module->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @param  array<int, int|null>  $subjectIds
     * @return array<int, array<string, mixed>>
     */
    private function objectiveOptions(array $subjectIds, ?string $gradeLevel = null): array
    {
        return LearningObjective::query()
            ->whereIn('subject_id', array_filter($subjectIds))
            ->when($gradeLevel, fn ($query) => $query->where('grade_level', $gradeLevel))
            ->orderBy('code')
            ->get()
            ->map(fn (LearningObjective $objective) => [
                'id' => $objective->id,
                'subject_id' => $objective->subject_id,
                'code' => $objective->code,
                'description' => $objective->description,
                'grade_level' => $objective->grade_level,
            ])
            ->all();
    }

    /**
     * @return array<int, array<string, string>>
     */
    private function blockTypeOptions(): array
    {
        return [
            ['value' => 'section_heading', 'label' => 'Judul Bagian', 'group' => 'Materi'],
            ['value' => 'materi_richtext', 'label' => 'Teks Kaya', 'group' => 'Materi'],
            ['value' => 'materi_video', 'label' => 'Video', 'group' => 'Materi'],
            ['value' => 'materi_video_interaktif', 'label' => 'Video Interaktif', 'group' => 'Materi'],
            ['value' => 'materi_file', 'label' => 'Lampiran Berkas', 'group' => 'Materi'],
            ['value' => 'materi_embed', 'label' => 'Tautan / Embed', 'group' => 'Materi'],
            ['value' => 'materi_teks', 'label' => 'Teks Materi', 'group' => 'Materi'],
            ['value' => 'materi_accordion', 'label' => 'Accordion SOP', 'group' => 'Materi'],
            ['value' => 'materi_flashcard', 'label' => 'Flashcard', 'group' => 'Materi'],
            ['value' => 'slide_image', 'label' => 'Slide Gambar', 'group' => 'Materi'],
            ['value' => 'soal_mcq', 'label' => 'Pilihan Ganda', 'group' => 'Soal'],
            ['value' => 'soal_truefalse', 'label' => 'Benar / Salah', 'group' => 'Soal'],
            ['value' => 'soal_fillblank', 'label' => 'Isian Singkat', 'group' => 'Soal'],
            ['value' => 'soal_sequencing', 'label' => 'Urutan Prosedur', 'group' => 'Soal'],
            ['value' => 'soal_matching', 'label' => 'Mencocokkan', 'group' => 'Soal'],
            ['value' => 'soal_hotspot', 'label' => 'Labeli Gambar / Hotspot', 'group' => 'Soal'],
            ['value' => 'soal_essay_ai', 'label' => 'Studi Kasus Esai', 'group' => 'Soal'],
            ['value' => 'polling', 'label' => 'Polling Kilat', 'group' => 'Soal'],
            ['value' => 'praktik_checklist', 'label' => 'Checklist Praktik', 'group' => 'Praktik'],
            ['value' => 'tugas_upload', 'label' => 'Tugas Unggah', 'group' => 'Praktik'],
        ];
    }
}
