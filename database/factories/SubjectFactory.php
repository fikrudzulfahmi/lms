<?php

namespace Database\Factories;

use App\Models\Department;
use App\Models\Subject;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Subject>
 */
class SubjectFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'department_id' => Department::factory(),
            'code' => 'MAT-'.fake()->unique()->numberBetween(1, 9999),
            'name' => fake()->unique()->words(2, true),
            'category' => Subject::CATEGORY_KEJURUAN,
        ];
    }

    public function umum(): static
    {
        return $this->state(fn () => [
            'department_id' => null,
            'category' => Subject::CATEGORY_UMUM,
        ]);
    }
}
