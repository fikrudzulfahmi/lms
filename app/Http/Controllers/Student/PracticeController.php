<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\ClassroomStudent;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Models\ModuleProgress;
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

        $blocks = $module->blocks()
            ->orderBy('order_index')
            ->orderBy('created_at')
            ->get()
            ->map(fn (ModuleBlock $block) => [
                'id' => $block->id,
                'order_index' => $block->order_index,
                'block_type' => $block->block_type,
                'points' => $block->points,
                // Mode latihan: konten dikirim apa adanya (termasuk kunci)
                // agar blok bisa memeriksa jawaban secara lokal. ai_rubric
                // TIDAK ikut — itu rahasia penilaian AI guru.
                'content' => $block->content,
            ])
            ->values();

        $progress = $this->progressFor($request, $module);

        return Inertia::render('Student/Practice/Show', [
            'module' => [
                'id' => $module->id,
                'title' => $module->title,
                'subject' => $module->teachingAssignment?->subject?->name,
                'subject_code' => $module->teachingAssignment?->subject?->code,
                'teacher' => $module->teachingAssignment?->teacher?->name,
                'assessment_type' => $module->assessment_type,
            ],
            'blocks' => $blocks,
            'progress' => $this->progressPayload($module, $progress),
            'urls' => [
                'progress' => route('student.practice.progress', $module),
                'answer' => route('student.practice.answer', $module),
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

        if ($block->block_type === ModuleBlock::BLOCK_SECTION_HEADING) {
            throw ValidationException::withMessages([
                'block_id' => 'Blok judul bagian tidak dihitung sebagai progres.',
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
            if (! in_array($block->id, $completed, true)) {
                $completed[] = $block->id;
            }
            $progress->completed_blocks = $completed;
        }

        $this->syncCompletion($module, $progress);

        $payload = $this->progressPayload($module, $progress->fresh());

        return response()->json([
            'correct' => $grade['correct'],
            'earned_points' => $grade['earned_points'],
            'is_graded' => $grade['is_graded'],
            'percent' => $payload['percent'],
            'completed_at' => $payload['completed_at'],
        ]);
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
