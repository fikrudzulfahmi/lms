<?php

namespace Database\Factories;

use App\Models\AcademicYear;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AcademicYear>
 */
class AcademicYearFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $start = fake()->numberBetween(2020, 2035);

        return [
            'name' => $start.'/'.($start + 1),
            'semester' => fake()->randomElement(['ganjil', 'genap']),
            'is_active' => false,
        ];
    }
}
