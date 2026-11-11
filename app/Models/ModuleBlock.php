<?php

namespace App\Models;

use Database\Factories\ModuleBlockFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['module_id', 'order_index', 'block_type', 'points', 'content', 'ai_rubric'])]
class ModuleBlock extends Model
{
    /** @use HasFactory<ModuleBlockFactory> */
    use HasFactory, HasUuids;

    public const BLOCK_SECTION_HEADING = 'section_heading';

    public const BLOCK_MATERI_RICHTEXT = 'materi_richtext';

    public const BLOCK_MATERI_VIDEO = 'materi_video';

    public const BLOCK_MATERI_FILE = 'materi_file';

    public const BLOCK_MATERI_EMBED = 'materi_embed';

    public const BLOCK_MATERI_TEKS = 'materi_teks';

    public const BLOCK_MATERI_ACCORDION = 'materi_accordion';

    public const BLOCK_MATERI_FLASHCARD = 'materi_flashcard';

    public const BLOCK_SLIDE_IMAGE = 'slide_image';

    public const BLOCK_SOAL_TRUEFALSE = 'soal_truefalse';

    public const BLOCK_SOAL_FILLBLANK = 'soal_fillblank';

    public const BLOCK_SOAL_MCQ = 'soal_mcq';

    public const BLOCK_SOAL_SEQUENCING = 'soal_sequencing';

    public const BLOCK_SOAL_MATCHING = 'soal_matching';

    public const BLOCK_SOAL_ESSAY_AI = 'soal_essay_ai';

    public const BLOCK_TYPES = [
        self::BLOCK_SECTION_HEADING,
        self::BLOCK_MATERI_RICHTEXT,
        self::BLOCK_MATERI_VIDEO,
        self::BLOCK_MATERI_FILE,
        self::BLOCK_MATERI_EMBED,
        self::BLOCK_MATERI_TEKS,
        self::BLOCK_MATERI_ACCORDION,
        self::BLOCK_MATERI_FLASHCARD,
        self::BLOCK_SLIDE_IMAGE,
        self::BLOCK_SOAL_MCQ,
        self::BLOCK_SOAL_TRUEFALSE,
        self::BLOCK_SOAL_FILLBLANK,
        self::BLOCK_SOAL_SEQUENCING,
        self::BLOCK_SOAL_MATCHING,
        self::BLOCK_SOAL_ESSAY_AI,
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'order_index' => 'integer',
            'points' => 'integer',
            'content' => 'array',
        ];
    }

    public function module(): BelongsTo
    {
        return $this->belongsTo(LearningModule::class, 'module_id');
    }

    public function responses(): HasMany
    {
        return $this->hasMany(StudentResponse::class, 'module_block_id');
    }
}
