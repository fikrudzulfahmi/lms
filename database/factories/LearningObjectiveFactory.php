<?php

namespace Database\Factories;

use App\Models\Classroom;
use App\Models\LearningObjective;
use App\Models\Subject;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<LearningObjective>
 */
class LearningObjectiveFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'subject_id' => Subject::factory(),
            'teacher_id' => User::factory()->create(['role' => User::ROLE_TEACHER])->id,
            'grade_level' => fake()->randomElement(Classroom::GRADE_LEVELS),
            'code' => 'TP-'.fake()->randomNumber(2),
            'description' => fake()->sentence(12),
        ];
    }
}
