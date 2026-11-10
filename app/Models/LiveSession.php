<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['module_id', 'pin_code', 'current_block_id', 'status'])]
class LiveSession extends Model
{
    use HasUuids;

    public const STATUS_WAITING = 'waiting';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_ENDED = 'ended';

    public const STATUS_TYPES = [
        self::STATUS_WAITING,
        self::STATUS_ACTIVE,
        self::STATUS_ENDED,
    ];

    public function module(): BelongsTo
    {
        return $this->belongsTo(LearningModule::class, 'module_id');
    }

    public function currentBlock(): BelongsTo
    {
        return $this->belongsTo(ModuleBlock::class, 'current_block_id');
    }
}
