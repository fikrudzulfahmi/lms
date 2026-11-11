<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Progres belajar mandiri seorang siswa pada satu modul: blok yang sudah
 * ditandai selesai dan jawaban latihan terakhir per blok (tidak dinilai
 * ke gradebook — murni latihan).
 */
#[Fillable(['student_id', 'module_id', 'completed_blocks', 'answers', 'completed_at'])]
class ModuleProgress extends Model
{
    protected $table = 'module_progress';

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'completed_blocks' => 'array',
            'answers' => 'array',
            'completed_at' => 'datetime',
        ];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function module(): BelongsTo
    {
        return $this->belongsTo(LearningModule::class, 'module_id');
    }
}
