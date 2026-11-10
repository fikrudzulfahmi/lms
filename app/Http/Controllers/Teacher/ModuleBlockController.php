<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Requests\ReorderModuleBlocksRequest;
use App\Http\Requests\StoreModuleBlockRequest;
use App\Http\Requests\UpdateModuleBlockRequest;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class ModuleBlockController
{
    public function store(StoreModuleBlockRequest $request, LearningModule $module): JsonResponse
    {
        $data = $request->validated();

        $block = $module->blocks()->create([
            'order_index' => $module->blocks()->max('order_index') === null
                ? 0
                : ((int) $module->blocks()->max('order_index')) + 1,
            'block_type' => $data['block_type'],
            'points' => $data['points'],
            'content' => $data['content'],
            'ai_rubric' => $data['ai_rubric'] ?? null,
        ]);

        return response()->json([
            'block' => $this->serialize($block),
            'saved_at' => now()->toIso8601String(),
        ], 201);
    }

    public function update(
        UpdateModuleBlockRequest $request,
        LearningModule $module,
        ModuleBlock $block,
    ): JsonResponse {
        $this->ensureBelongs($module, $block);

        $data = $request->validated();

        $block->update([
            'block_type' => $data['block_type'],
            'points' => $data['points'],
            'content' => $data['content'],
            'ai_rubric' => $data['ai_rubric'] ?? null,
        ]);

        return response()->json([
            'block' => $this->serialize($block->fresh()),
            'saved_at' => now()->toIso8601String(),
        ]);
    }

    public function destroy(LearningModule $module, ModuleBlock $block): JsonResponse
    {
        $this->ensureBelongs($module, $block);

        DB::transaction(function () use ($module, $block): void {
            $block->delete();

            $module->blocks()
                ->orderBy('order_index')
                ->orderBy('created_at')
                ->pluck('id')
                ->each(function (string $id, int $index): void {
                    ModuleBlock::whereKey($id)->update(['order_index' => $index]);
                });
        });

        return response()->json([
            'deleted' => $block->id,
            'saved_at' => now()->toIso8601String(),
        ]);
    }

    public function reorder(ReorderModuleBlocksRequest $request, LearningModule $module): JsonResponse
    {
        $ids = $request->validated('ids');

        DB::transaction(function () use ($ids): void {
            foreach ($ids as $index => $id) {
                ModuleBlock::whereKey($id)->update(['order_index' => $index]);
            }
        });

        return response()->json([
            'ids' => $ids,
            'saved_at' => now()->toIso8601String(),
        ]);
    }

    private function ensureBelongs(LearningModule $module, ModuleBlock $block): void
    {
        abort_unless($block->module_id === $module->id, 404);
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(ModuleBlock $block): array
    {
        return [
            'id' => $block->id,
            'order_index' => $block->order_index,
            'block_type' => $block->block_type,
            'points' => $block->points,
            'content' => $block->content,
            'ai_rubric' => $block->ai_rubric,
        ];
    }
}
