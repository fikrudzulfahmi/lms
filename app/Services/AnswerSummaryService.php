<?php

namespace App\Services;

use App\Models\ModuleBlock;

/**
 * Ringkasan jawaban siswa yang bisa dibaca guru, per tipe blok. Dipakai
 * halaman Pekerjaan Siswa agar guru tidak perlu membaca JSON mentah.
 */
class AnswerSummaryService
{
    /**
     * @param  array<string, mixed>|null  $payload
     */
    public function summarize(ModuleBlock $block, ?array $payload): string
    {
        if ($payload === null || $payload === []) {
            return '—';
        }

        $content = (array) ($block->content ?? []);

        return match ($block->block_type) {
            ModuleBlock::BLOCK_SOAL_MCQ => $this->mcq($content, $payload),
            ModuleBlock::BLOCK_SOAL_TRUEFALSE => $this->trueFalse($payload),
            ModuleBlock::BLOCK_SOAL_FILLBLANK => $this->text($payload, ['text', 'answer', 'value']),
            ModuleBlock::BLOCK_SOAL_ESSAY_AI => $this->text($payload, ['text', 'answer', 'essay', 'jawaban', 'value']),
            ModuleBlock::BLOCK_SOAL_SEQUENCING => $this->sequencing($payload),
            ModuleBlock::BLOCK_SOAL_MATCHING => $this->matching($payload),
            ModuleBlock::BLOCK_SOAL_HOTSPOT => $this->hotspot($payload),
            ModuleBlock::BLOCK_POLLING => $this->polling($content, $payload),
            ModuleBlock::BLOCK_MATERI_VIDEO_INTERAKTIF => $this->videoCheckpoints($payload),
            ModuleBlock::BLOCK_PRAKTIK_CHECKLIST => $this->checklist($content, $payload),
            ModuleBlock::BLOCK_TUGAS_UPLOAD => $this->files($payload),
            default => $this->fallback($payload),
        };
    }

    /**
     * @param  array<string, mixed>  $content
     * @param  array<string, mixed>  $payload
     */
    private function mcq(array $content, array $payload): string
    {
        $index = $payload['option_index'] ?? null;
        $options = array_values((array) ($content['options'] ?? []));

        if ($index === null || ! isset($options[(int) $index])) {
            return 'Tidak memilih opsi.';
        }

        $letter = chr(65 + (int) $index);
        $text = is_array($options[(int) $index])
            ? (string) ($options[(int) $index]['text'] ?? '')
            : (string) $options[(int) $index];

        return "Opsi {$letter}: {$text}";
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function trueFalse(array $payload): string
    {
        $value = $payload['value'] ?? $payload['answer'] ?? null;

        return is_bool($value) ? ($value ? 'Benar' : 'Salah') : 'Tidak menjawab.';
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, string>  $keys
     */
    private function text(array $payload, array $keys): string
    {
        foreach ($keys as $key) {
            if (isset($payload[$key]) && is_string($payload[$key]) && trim($payload[$key]) !== '') {
                return trim($payload[$key]);
            }
        }

        return 'Tidak ada teks jawaban.';
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function sequencing(array $payload): string
    {
        $order = array_values((array) ($payload['order'] ?? []));

        return $order === [] ? 'Tidak menjawab.' : implode(' → ', array_map(fn ($step) => (string) $step, $order));
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function matching(array $payload): string
    {
        $pairs = (array) ($payload['matching'] ?? []);
        $parts = [];

        foreach ($pairs as $left => $right) {
            $parts[] = "{$left} → {$right}";
        }

        return $parts === [] ? 'Tidak menjawab.' : implode('; ', $parts);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function hotspot(array $payload): string
    {
        $assignments = (array) ($payload['assignments'] ?? []);
        $parts = [];

        foreach ($assignments as $index => $label) {
            $parts[] = 'Titik '.((int) $index + 1).": {$label}";
        }

        return $parts === [] ? 'Tidak menjawab.' : implode('; ', $parts);
    }

    /**
     * @param  array<string, mixed>  $content
     * @param  array<string, mixed>  $payload
     */
    private function polling(array $content, array $payload): string
    {
        $index = $payload['option_index'] ?? null;
        $options = array_values((array) ($content['options'] ?? []));

        if ($index === null || ! isset($options[(int) $index])) {
            return 'Tidak memilih opsi.';
        }

        $option = $options[(int) $index];

        return 'Memilih: '.(is_array($option) ? (string) ($option['text'] ?? '') : (string) $option);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function videoCheckpoints(array $payload): string
    {
        $answers = (array) ($payload['answers'] ?? []);

        return 'Menjawab '.count($answers).' checkpoint.';
    }

    /**
     * @param  array<string, mixed>  $content
     * @param  array<string, mixed>  $payload
     */
    private function checklist(array $content, array $payload): string
    {
        $steps = array_values((array) ($content['steps'] ?? []));
        $checked = array_map('intval', (array) ($payload['checked'] ?? []));

        return 'Mencentang '.count($checked).' dari '.count($steps).' langkah.';
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function files(array $payload): string
    {
        $files = array_values((array) ($payload['files'] ?? []));
        $names = array_map(fn ($file) => is_array($file) ? (string) ($file['name'] ?? 'berkas') : 'berkas', $files);

        return $names === [] ? 'Belum mengumpulkan berkas.' : 'Berkas: '.implode(', ', $names);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function fallback(array $payload): string
    {
        $json = (string) json_encode($payload, JSON_UNESCAPED_UNICODE);

        return mb_strlen($json) > 300 ? mb_substr($json, 0, 300).'…' : $json;
    }
}
