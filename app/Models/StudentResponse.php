<?php

namespace App\Models;

use Database\Factories\StudentResponseFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['module_block_id', 'student_id', 'answer_payload', 'earned_points', 'ai_feedback', 'is_graded'])]
class StudentResponse extends Model
{
    /** @use HasFactory<StudentResponseFactory> */
    use HasFactory;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'answer_payload' => 'array',
            'earned_points' => 'decimal:2',
            'is_graded' => 'boolean',
        ];
    }

    public function block(): BelongsTo
    {
        return $this->belongsTo(ModuleBlock::class, 'module_block_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }
}
