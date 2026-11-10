<?php

namespace App\Jobs;

use App\Models\ModuleBlock;
use App\Models\ModuleGrade;
use App\Models\StudentResponse;
use App\Services\AiCurriculumService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class GradeStudentEssaysJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 180;

    /**
     * @param  array<int, int>  $responseIds
     */
    public function __construct(public readonly array $responseIds) {}

    public function handle(AiCurriculumService $ai): void
    {
        $responses = StudentResponse::query()
            ->with(['block.module'])
            ->whereIn('id', $this->responseIds)
            ->where('is_graded', false)
            ->get();

        if ($responses->isEmpty()) {
            return;
        }

        $affected = [];

        foreach ($responses->groupBy('module_block_id') as $group) {
            /** @var StudentResponse $first */
            $first = $group->first();
            $block = $first->block;
            $module = $block?->module;

            if ($block === null || $module === null || $block->block_type !== ModuleBlock::BLOCK_SOAL_ESSAY_AI) {
                continue;
            }

            $pending = $group
                ->filter(fn (StudentResponse $response) => ! $response->is_graded)
                ->values();

            if ($pending->isEmpty()) {
                continue;
            }

            $answers = $pending
                ->map(fn (StudentResponse $response) => [
                    'sid' => (int) $response->student_id,
                    'ans' => $this->answerText($response),
                ])
                ->all();

            $question = (string) ($block->content['question'] ?? '');
            $rubric = (string) ($block->ai_rubric ?: 'Nilai ketepatan konsep, kelengkapan langkah kerja, dan istilah teknis.');
            $maxPoints = (float) max(1, $block->points);

            $grades = $ai->gradeEssays($question, $rubric, $answers, $maxPoints);

            foreach ($pending as $response) {
                $result = $grades[(int) $response->student_id] ?? null;
                $affected[] = [(int) $module->id, (int) $response->student_id];

                if ($result === null) {
                    continue;
                }

                StudentResponse::query()
                    ->whereKey($response->id)
                    ->where('is_graded', false)
                    ->update([
                        'earned_points' => min($maxPoints, (float) $result['pts']),
                        'ai_feedback' => $result['fb'] !== '' ? $result['fb'] : 'Dinilai otomatis oleh AI.',
                        'is_graded' => true,
                    ]);
            }
        }

        $pairs = [];

        foreach ($affected as [$moduleId, $studentId]) {
            $pairs[$moduleId.':'.$studentId] = [$moduleId, $studentId];
        }

        foreach ($pairs as [$moduleId, $studentId]) {
            $this->recalculateModuleGrade($moduleId, $studentId);
        }
    }

    private function recalculateModuleGrade(int $moduleId, int $studentId): void
    {
        $module = \App\Models\LearningModule::find($moduleId);

        if ($module === null) {
            return;
        }

        $maxPossible = (float) $module->blocks()->sum('points');

        $earned = (float) StudentResponse::query()
            ->where('student_id', $studentId)
            ->whereHas('block', fn ($query) => $query->where('module_id', $moduleId))
            ->sum('earned_points');

        $ungraded = StudentResponse::query()
            ->where('student_id', $studentId)
            ->where('is_graded', false)
            ->whereHas('block', fn ($query) => $query
                ->where('module_id', $moduleId)
                ->where('block_type', 'like', 'soal_%'))
            ->exists();

        $finalScore = $maxPossible > 0 ? round(($earned / $maxPossible) * 100, 2) : 0.0;
        $isGraded = ! $ungraded;

        ModuleGrade::updateOrCreate(
            ['module_id' => $moduleId, 'student_id' => $studentId],
            [
                'total_earned_points' => round($earned, 2),
                'max_possible_points' => round($maxPossible, 2),
                'final_score' => $finalScore,
                'is_passed' => $finalScore >= (float) $module->kktp_score,
                'status' => $isGraded ? ModuleGrade::STATUS_GRADED : ModuleGrade::STATUS_WAITING_AI,
                'completed_at' => $isGraded ? now() : null,
            ],
        );
    }

    private function answerText(StudentResponse $response): string
    {
        $payload = $response->answer_payload;

        if (is_string($payload)) {
            return trim($payload);
        }

        if (! is_array($payload)) {
            return '';
        }

        foreach (['text', 'answer', 'essay', 'jawaban', 'value'] as $key) {
            if (isset($payload[$key]) && is_string($payload[$key])) {
                return trim($payload[$key]);
            }
        }

        return trim((string) json_encode($payload, JSON_UNESCAPED_UNICODE));
    }
}
