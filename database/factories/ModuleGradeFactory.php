<?php

namespace Database\Factories;

use App\Models\LearningModule;
use App\Models\ModuleGrade;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ModuleGrade>
 */
class ModuleGradeFactory extends Factory
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
            'student_id' => User::factory()->create(['role' => User::ROLE_STUDENT])->id,
            'total_earned_points' => 0,
            'max_possible_points' => 0,
            'final_score' => 0,
            'is_passed' => false,
            'status' => ModuleGrade::STATUS_IN_PROGRESS,
            'student_notes' => null,
            'teacher_note' => null,
            'completed_at' => null,
        ];
    }
}
