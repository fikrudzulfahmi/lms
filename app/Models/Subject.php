<?php

namespace App\Models;

use Database\Factories\SubjectFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['department_id', 'code', 'name', 'category'])]
class Subject extends Model
{
    /** @use HasFactory<SubjectFactory> */
    use HasFactory;

    public const CATEGORY_UMUM = 'umum';

    public const CATEGORY_KEJURUAN = 'kejuruan';

    public const CATEGORY_TYPES = [
        self::CATEGORY_UMUM,
        self::CATEGORY_KEJURUAN,
    ];

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function teachingAssignments(): HasMany
    {
        return $this->hasMany(TeachingAssignment::class, 'subject_id');
    }

    public function learningObjectives(): HasMany
    {
        return $this->hasMany(LearningObjective::class, 'subject_id');
    }
}
