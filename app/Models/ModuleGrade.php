<?php

namespace App\Models;

use Database\Factories\ModuleGradeFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'module_id',
    'student_id',
    'total_earned_points',
    'max_possible_points',
    'final_score',
    'is_passed',
    'status',
    'student_notes',
    'teacher_note',
    'completed_at',
    'override_score',
    'override_reason',
    'overridden_by',
    'overridden_at',
])]
class ModuleGrade extends Model
{
    /** @use HasFactory<ModuleGradeFactory> */
    use HasFactory;

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_SUBMITTED = 'submitted';

    public const STATUS_WAITING_AI = 'waiting_ai_grading';

    public const STATUS_GRADED = 'graded';

    public const STATUS_TYPES = [
        self::STATUS_IN_PROGRESS,
        self::STATUS_SUBMITTED,
        self::STATUS_WAITING_AI,
        self::STATUS_GRADED,
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'total_earned_points' => 'decimal:2',
            'max_possible_points' => 'decimal:2',
            'final_score' => 'decimal:2',
            'is_passed' => 'boolean',
            'student_notes' => 'array',
            'completed_at' => 'datetime',
            'override_score' => 'decimal:2',
            'overridden_at' => 'datetime',
        ];
    }

    /**
     * Nilai yang dipakai untuk perhitungan akhir: override guru bila ada.
     */
    public function effectiveScore(): float
    {
        return (float) ($this->override_score ?? $this->final_score);
    }

    public function hasOverride(): bool
    {
        return $this->override_score !== null;
    }

    public function overriddenBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'overridden_by');
    }

    public function module(): BelongsTo
    {
        return $this->belongsTo(LearningModule::class, 'module_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }
}
