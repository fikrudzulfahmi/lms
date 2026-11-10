<?php

namespace App\Http\Controllers\Teacher;

use App\Jobs\GenerateModuleBlocksJob;
use App\Jobs\GradeStudentEssaysJob;
use App\Models\LearningModule;
use App\Models\LearningObjective;
use App\Models\ModuleBlock;
use App\Models\ModuleGrade;
use App\Models\StudentResponse;
use App\Services\AiCurriculumService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AiCurriculumController
{
    public function generate(Request $request, LearningModule $module): JsonResponse
    {
        Gate::authorize('update', $module);

        if (in_array($module->ai_status, [LearningModule::AI_QUEUED, LearningModule::AI_GENERATING], true)) {
            return response()->json([
                'message' => 'AI masih menyusun blok untuk modul ini. Tunggu sampai selesai.',
                'ai_status' => $module->ai_status,
            ], 409);
        }

        $data = $request->validate([
            'learning_objective_id' => ['nullable', 'integer', 'exists:learning_objectives,id'],
            'count' => ['nullable', 'integer', 'min:1', 'max:12'],
            'difficulty' => ['nullable', Rule::in(['mudah', 'sedang', 'sulit'])],
            'block_types' => ['nullable', 'array', 'min:1'],
            'block_types.*' => ['string', Rule::in(AiCurriculumService::AI_BLOCK_TYPES)],
            'instruction' => ['nullable', 'string', 'max:1000'],
        ]);

        $objectiveId = $data['learning_objective_id'] ?? null;

        if ($objectiveId !== null) {
            $subjectId = $module->teachingAssignment?->subject_id;

            if (! LearningObjective::query()->whereKey($objectiveId)->where('subject_id', $subjectId)->exists()) {
                throw ValidationException::withMessages([
                    'learning_objective_id' => 'Tujuan pembelajaran harus berasal dari mata pelajaran modul ini.',
                ]);
            }

            $module->learning_objective_id = (int) $objectiveId;
        }

        $module->forceFill([
            'ai_status' => LearningModule::AI_QUEUED,
            'ai_error' => null,
        ])->save();

        GenerateModuleBlocksJob::dispatch($module->id, [
            'count' => (int) ($data['count'] ?? 4),
            'difficulty' => $data['difficulty'] ?? 'sedang',
            'block_types' => array_values($data['block_types'] ?? []),
            'instruction' => $data['instruction'] ?? '',
        ]);

        return response()->json([
            'ai_status' => LearningModule::AI_QUEUED,
            'message' => 'AI sedang menyusun blok. Halaman ini akan diperbarui otomatis.',
        ], 202);
    }

    public function status(LearningModule $module): JsonResponse
    {
        Gate::authorize('view', $module);

        $module->refresh();

        $blocks = $module->blocks()
            ->orderBy('order_index')
            ->orderBy('created_at')
            ->get()
            ->map(fn (ModuleBlock $block) => [
                'id' => $block->id,
                'order_index' => $block->order_index,
                'block_type' => $block->block_type,
                'points' => $block->points,
                'content' => $block->content,
                'ai_rubric' => $block->ai_rubric,
                'title' => (string) ($block->content['title'] ?? $block->content['question'] ?? $block->block_type),
            ])
            ->values();

        return response()->json([
            'ai_status' => $module->ai_status,
            'ai_error' => $module->ai_error,
            'ai_generated_at' => $module->ai_generated_at?->toIso8601String(),
            'blocks_count' => $blocks->count(),
            'blocks' => $blocks,
        ]);
    }

    public function grade(StudentResponse $response): JsonResponse
    {
        $response->loadMissing('block.module');
        $block = $response->block;
        $module = $block?->module;

        abort_if($block === null || $module === null, 404);

        Gate::authorize('update', $module);

        if ($block->block_type !== ModuleBlock::BLOCK_SOAL_ESSAY_AI) {
            return response()->json([
                'message' => 'Hanya jawaban soal esai AI yang dapat dinilai otomatis.',
            ], 422);
        }

        if ($response->is_graded) {
            return response()->json([
                'message' => 'Jawaban ini sudah dinilai.',
                'already_graded' => true,
            ], 200);
        }

        ModuleGrade::query()
            ->where('module_id', $module->id)
            ->where('student_id', $response->student_id)
            ->update(['status' => ModuleGrade::STATUS_WAITING_AI]);

        GradeStudentEssaysJob::dispatch([$response->id]);

        return response()->json([
            'message' => 'Jawaban dikirim ke penilaian AI.',
            'status' => 'queued',
        ], 202);
    }
}
