<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pengumpulan blok Tugas Unggah oleh seorang siswa: berkas + catatan,
 * lalu dinilai guru per kriteria rubrik. Nilai persennya diteruskan ke
 * StudentResponse agar terbaca buku nilai.
 */
#[Fillable([
    'module_block_id',
    'student_id',
    'files',
    'note',
    'status',
    'rubric_scores',
    'feedback',
    'score',
    'graded_by',
    'graded_at',
])]
class Submission extends Model
{
    public const STATUS_SUBMITTED = 'submitted';

    public const STATUS_GRADED = 'graded';

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'files' => 'array',
            'rubric_scores' => 'array',
            'score' => 'float',
            'graded_at' => 'datetime',
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

    public function grader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'graded_by');
    }
}
