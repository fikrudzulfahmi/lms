<?php

namespace App\Jobs;

use App\Exceptions\AiUnavailableException;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Services\AiCurriculumService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class GenerateModuleBlocksJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 180;

    /**
     * @param  array{learning_objective_id?: int|null, count?: int, difficulty?: string, block_types?: array<int, string>, instruction?: string}  $options
     */
    public function __construct(
        public readonly int $moduleId,
        public readonly array $options = [],
    ) {}

    public function handle(AiCurriculumService $ai): void
    {
        $module = LearningModule::query()
            ->with([
                'teachingAssignment.subject:id,code,name,department_id',
                'teachingAssignment.subject.department:id,name',
                'teachingAssignment.classroom:id,name,grade_level',
                'learningObjective:id,code,description',
            ])
            ->find($this->moduleId);

        if ($module === null) {
            return;
        }

        $module->forceFill(['ai_status' => LearningModule::AI_GENERATING, 'ai_error' => null])->save();

        try {
            $assignment = $module->teachingAssignment;
            $subject = $assignment?->subject;
            $objective = $module->learningObjective;

            $objectiveText = $objective
                ? trim(($objective->code ? $objective->code.' — ' : '').$objective->description)
                : $module->title;

            $existingTitles = $module->blocks()
                ->orderBy('order_index')
                ->get(['block_type', 'content'])
                ->map(fn (ModuleBlock $block) => (string) ($block->content['title'] ?? $block->content['question'] ?? $block->block_type))
                ->filter()
                ->values()
                ->all();

            $blocks = $ai->generateModuleBlocks(
                subject: $subject?->name ?? 'Mata pelajaran',
                gradeLevel: $assignment?->classroom?->grade_level ?? 'XI',
                objective: $objectiveText,
                context: [
                    'module_title' => $module->title,
                    'department' => $subject?->department?->name,
                    'count' => (int) ($this->options['count'] ?? 4),
                    'difficulty' => (string) ($this->options['difficulty'] ?? 'sedang'),
                    'block_types' => (array) ($this->options['block_types'] ?? []),
                    'instruction' => (string) ($this->options['instruction'] ?? ''),
                    'existing_titles' => $existingTitles,
                ],
            );

            DB::transaction(function () use ($module, $blocks): void {
                $nextOrder = (int) ($module->blocks()->max('order_index') ?? -1) + 1;

                foreach ($blocks as $block) {
                    $module->blocks()->create([
                        'order_index' => $nextOrder++,
                        'block_type' => $block['block_type'],
                        'points' => $block['points'],
                        'content' => $block['content'],
                        'ai_rubric' => $block['ai_rubric'],
                    ]);
                }

                $module->forceFill([
                    'ai_status' => LearningModule::AI_COMPLETED,
                    'ai_error' => null,
                    'ai_generated_at' => now(),
                ])->save();
            });
        } catch (AiUnavailableException $exception) {
            $this->markFailed($module, $exception->userMessage());

            throw $exception;
        } catch (Throwable $exception) {
            $this->markFailed($module, 'AI gagal menyusun blok. Coba lagi atau tambahkan blok manual.');

            throw $exception;
        }
    }

    public function failed(?Throwable $exception): void
    {
        $module = LearningModule::find($this->moduleId);

        if ($module !== null && $module->ai_status !== LearningModule::AI_FAILED) {
            $this->markFailed($module, 'AI gagal menyusun blok. Coba lagi atau tambahkan blok manual.');
        }
    }

    private function markFailed(LearningModule $module, string $message): void
    {
        $module->forceFill([
            'ai_status' => LearningModule::AI_FAILED,
            'ai_error' => Str::limit($message, 900),
        ])->save();
    }
}
