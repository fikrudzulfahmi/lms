<?php

namespace Database\Factories;

use App\Models\LearningModule;
use App\Models\ModuleBlock;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ModuleBlock>
 */
class ModuleBlockFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'module_id' => LearningModule::factory(),
            'order_index' => fake()->numberBetween(0, 50),
            'block_type' => ModuleBlock::BLOCK_MATERI_TEKS,
            'points' => 0,
            'content' => ['q' => fake()->sentence(10)],
            'ai_rubric' => null,
        ];
    }
}
