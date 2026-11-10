<?php

namespace Database\Factories;

use App\Models\Classroom;
use App\Models\Department;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Classroom>
 */
class ClassroomFactory extends Factory
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
            'grade_level' => fake()->randomElement(Classroom::GRADE_LEVELS),
            'name' => 'KELAS-'.fake()->unique()->numberBetween(1, 99999),
        ];
    }
}
