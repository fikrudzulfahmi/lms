<?php

namespace App\Models;

use Database\Factories\AcademicYearFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'semester', 'is_active'])]
class AcademicYear extends Model
{
    /** @use HasFactory<AcademicYearFactory> */
    use HasFactory;

    protected $table = 'academic_years';

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function classroomStudents(): HasMany
    {
        return $this->hasMany(ClassroomStudent::class, 'academic_year_id');
    }

    public function teachingAssignments(): HasMany
    {
        return $this->hasMany(TeachingAssignment::class, 'academic_year_id');
    }

    /**
     * Activate this academic year: all others become inactive.
     */
    public function activate(): static
    {
        static::where('is_active', true)
            ->where('id', '!=', $this->id)
            ->update(['is_active' => false]);

        $this->is_active = true;

        return $this->save() ? $this : $this;
    }

    /**
     * Get the currently active academic year.
     */
    public static function active(): ?static
    {
        return static::where('is_active', true)->first();
    }
}
