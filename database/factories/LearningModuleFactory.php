<?php

namespace Database\Factories;

use App\Models\LearningModule;
use App\Models\TeachingAssignment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<LearningModule>
 */
class LearningModuleFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'teaching_assignment_id' => TeachingAssignment::factory(),
            'learning_objective_id' => null,
            'title' => fake()->sentence(4),
            'assessment_type' => LearningModule::ASSESSMENT_FORMATIF,
            'kktp_score' => 75,
            'max_attempts' => 1,
            'status' => LearningModule::STATUS_DRAFT,
            'settings' => null,
        ];
    }
}
