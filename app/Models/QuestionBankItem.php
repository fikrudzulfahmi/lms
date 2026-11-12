<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'teacher_id',
    'block_type',
    'points',
    'content',
    'ai_rubric',
    'topic',
])]
class QuestionBankItem extends Model
{
    use HasUuids;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'points' => 'integer',
            'content' => 'array',
        ];
    }

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    /** Cuplikan teks untuk daftar bank soal. */
    public function snippet(): string
    {
        $content = (array) ($this->content ?? []);

        foreach (['question', 'title'] as $key) {
            if (isset($content[$key]) && is_string($content[$key]) && trim($content[$key]) !== '') {
                return mb_strlen($content[$key]) > 140
                    ? mb_substr($content[$key], 0, 140).'…'
                    : $content[$key];
            }
        }

        return '(tanpa teks)';
    }
}
