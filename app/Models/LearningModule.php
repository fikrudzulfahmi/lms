<?php

namespace App\Models;

use Database\Factories\LearningModuleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'teaching_assignment_id',
    'learning_objective_id',
    'title',
    'assessment_type',
    'kktp_score',
    'max_attempts',
    'status',
    'settings',
    'ai_status',
    'ai_error',
    'ai_generated_at',
])]
class LearningModule extends Model
{
    /** @use HasFactory<LearningModuleFactory> */
    use HasFactory;

    public const ASSESSMENT_FORMATIF = 'formatif';

    public const ASSESSMENT_SUMATIF_LINGKUP = 'sumatif_lingkup_materi';

    public const ASSESSMENT_SUMATIF_AKHIR = 'sumatif_akhir_semester';

    public const ASSESSMENT_TYPES = [
        self::ASSESSMENT_FORMATIF,
        self::ASSESSMENT_SUMATIF_LINGKUP,
        self::ASSESSMENT_SUMATIF_AKHIR,
    ];

    public const STATUS_DRAFT = 'draft';

    public const STATUS_PUBLISHED = 'published';

    public const STATUS_TYPES = [
        self::STATUS_DRAFT,
        self::STATUS_PUBLISHED,
    ];

    public const AI_QUEUED = 'queued';

    public const AI_GENERATING = 'generating';

    public const AI_COMPLETED = 'completed';

    public const AI_FAILED = 'ai_failed';

    public const AI_STATUS_TYPES = [
        self::AI_QUEUED,
        self::AI_GENERATING,
        self::AI_COMPLETED,
        self::AI_FAILED,
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'kktp_score' => 'integer',
            'max_attempts' => 'integer',
            'settings' => 'array',
            'ai_generated_at' => 'datetime',
        ];
    }

    public function teachingAssignment(): BelongsTo
    {
        return $this->belongsTo(TeachingAssignment::class);
    }

    public function learningObjective(): BelongsTo
    {
        return $this->belongsTo(LearningObjective::class);
    }

    public function blocks(): HasMany
    {
        return $this->hasMany(ModuleBlock::class, 'module_id');
    }

    public function liveSessions(): HasMany
    {
        return $this->hasMany(LiveSession::class, 'module_id');
    }

    public function grades(): HasMany
    {
        return $this->hasMany(ModuleGrade::class, 'module_id');
    }
}
