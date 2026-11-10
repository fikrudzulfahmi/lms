<?php

namespace Database\Factories;

use App\Models\ModuleBlock;
use App\Models\StudentResponse;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StudentResponse>
 */
class StudentResponseFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'module_block_id' => ModuleBlock::factory(),
            'student_id' => User::factory()->create(['role' => User::ROLE_STUDENT])->id,
            'answer_payload' => ['a' => fake()->word()],
            'earned_points' => 0,
            'ai_feedback' => null,
            'is_graded' => false,
        ];
    }
}
