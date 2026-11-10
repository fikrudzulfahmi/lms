<?php

namespace App\Services;

use App\Models\LearningModule;
use App\Models\LiveSession;
use App\Models\ModuleBlock;
use Illuminate\Support\Facades\DB;

/**
 * Aturan sesi live kelas: pembuatan PIN, control token guru, snapshot aman
 * untuk ws-hub, dan penilaian otomatis jawaban objektif.
 */
class LiveSessionService
{
    public function start(LearningModule $module): LiveSession
    {
        return DB::transaction(function () use ($module): LiveSession {
            // Satu modul hanya punya satu sesi berjalan.
            LiveSession::query()
                ->where('module_id', $module->id)
                ->whereIn('status', [LiveSession::STATUS_WAITING, LiveSession::STATUS_ACTIVE])
                ->update(['status' => LiveSession::STATUS_ENDED]);

            $firstBlock = $module->blocks()
                ->orderBy('order_index')
                ->orderBy('created_at')
                ->first();

            return LiveSession::create([
                'module_id' => $module->id,
                'pin_code' => $this->uniquePin(),
                'current_block_id' => $firstBlock?->id,
                'status' => LiveSession::STATUS_ACTIVE,
            ]);
        });
    }

    /**
     * PIN 6 digit unik di antara sesi yang belum berakhir. Sesi lama boleh
     * memakai ulang PIN karena sudah tidak bisa dipakai join.
     */
    public function uniquePin(): string
    {
        $length = (int) config('live.pin_length', 6);
        $floor = (int) str_pad('1', $length, '0');
        $ceiling = (int) str_pad('', $length, '9');

        for ($attempt = 0; $attempt < 30; $attempt++) {
            $pin = (string) random_int($floor, $ceiling);

            $taken = LiveSession::query()
                ->where('pin_code', $pin)
                ->whereIn('status', [LiveSession::STATUS_WAITING, LiveSession::STATUS_ACTIVE])
                ->exists();

            if (! $taken) {
                return $pin;
            }
        }

        throw new \RuntimeException('Gagal membuat PIN sesi unik. Coba lagi.');
    }

    /**
     * Token kontrol guru: HMAC sesi, hanya dikirim ke halaman panggung guru
     * pemilik. ws-hub memverifikasinya lewat endpoint internal.
     */
    public function controlToken(LiveSession $session): string
    {
        return hash_hmac('sha256', 'live-session:'.$session->id, (string) config('live.internal_secret'));
    }

    public function verifyControlToken(LiveSession $session, ?string $token): bool
    {
        if ($token === null || $token === '') {
            return false;
        }

        return hash_equals($this->controlToken($session), $token);
    }

    /**
     * Snapshot yang dikirim ke ws-hub saat join. Untuk siswa, blok dikirim
     * tanpa kunci jawaban dan tanpa ai_rubric.
     *
     * @return array<string, mixed>
     */
    public function snapshot(LiveSession $session, string $role): array
    {
        $session->loadMissing('module');

        $payload = [
            'id' => $session->id,
            'pin' => $session->pin_code,
            'status' => $session->status,
            'module_id' => $session->module_id,
            'module_title' => $session->module?->title,
            'current_block_id' => $session->current_block_id,
        ];

        if ($role === 'student') {
            $blocks = $session->module
                ? $session->module->blocks()
                    ->orderBy('order_index')
                    ->orderBy('created_at')
                    ->get()
                    ->map(fn (ModuleBlock $block) => $this->serializeBlock($block, true))
                    ->values()
                    ->all()
                : [];

            $payload['module'] = [
                'id' => $session->module_id,
                'title' => $session->module?->title,
                'blocks' => $blocks,
            ];
        }

        return $payload;
    }

    /**
     * Blok untuk siswa: kunci jawaban, pembahasan, dan rubrik AI dibuang.
     *
     * @return array<string, mixed>
     */
    public function serializeBlock(ModuleBlock $block, bool $forStudent): array
    {
        $content = $block->content ?? [];

        if ($forStudent) {
            $content = $this->sanitizeContent($block->block_type, $content);
        }

        return [
            'id' => $block->id,
            'order_index' => $block->order_index,
            'block_type' => $block->block_type,
            'points' => $block->points,
            'content' => $content,
        ];
    }

    /**
     * @param  array<string, mixed>  $content
     * @return array<string, mixed>
     */
    private function sanitizeContent(string $type, array $content): array
    {
        unset($content['explanation'], $content['pembahasan']);

        if ($type === ModuleBlock::BLOCK_SOAL_MCQ) {
            $content['options'] = collect($content['options'] ?? [])
                ->map(fn ($option) => ['text' => is_array($option) ? ($option['text'] ?? $option['label'] ?? '') : (string) $option])
                ->values()
                ->all();
        }

        if ($type === ModuleBlock::BLOCK_SOAL_SEQUENCING) {
            $steps = array_values(array_filter((array) ($content['steps'] ?? []), 'is_string'));
            shuffle($steps);
            $content['steps'] = $steps;
            $content['keyless'] = true;
        }

        if ($type === ModuleBlock::BLOCK_SOAL_MATCHING) {
            $pairs = array_values((array) ($content['pairs'] ?? []));
            $rights = array_values(array_filter(array_map(
                fn ($pair) => is_array($pair) ? (string) ($pair['right'] ?? '') : '',
                $pairs,
            )));
            shuffle($rights);

            $content['pairs'] = array_map(
                fn ($pair) => ['left' => is_array($pair) ? (string) ($pair['left'] ?? '') : ''],
                $pairs,
            );
            $content['rights'] = $rights;
            $content['keyless'] = true;
        }

        // Jaring pengaman: schema AI bisa menyelipkan field kunci tambahan.
        return $this->scrubSensitive($content);
    }

    /**
     * @param  array<string, mixed>  $value
     * @return array<string, mixed>
     */
    private function scrubSensitive(array $value): array
    {
        $blocked = [
            'correct', 'correct_index', 'correct_option', 'correct_options', 'correct_answers',
            'is_correct', 'correct_answer', 'answer', 'answer_key', 'answers', 'key', 'keys',
            'kunci', 'jawaban', 'rubric', 'ai_rubric', 'solution', 'pembahasan', 'explanation',
        ];

        foreach ($value as $key => $item) {
            if (in_array((string) $key, $blocked, true)) {
                unset($value[$key]);
                continue;
            }

            if (is_array($item)) {
                $value[$key] = $this->scrubSensitive($item);
            }
        }

        return $value;
    }

    /**
     * Nilai jawaban objektif di server. Esai dibiarkan untuk AI job.
     *
     * @param  array<string, mixed>  $answer
     * @return array{earned_points: float, is_graded: bool, correct: bool|null}
     */
    public function gradeAnswer(ModuleBlock $block, array $answer): array
    {
        $content = $block->content ?? [];
        $points = (float) ($block->points ?? 0);

        $correct = match ($block->block_type) {
            ModuleBlock::BLOCK_SOAL_MCQ => $this->gradeMcq($content, $answer),
            ModuleBlock::BLOCK_SOAL_SEQUENCING => $this->gradeSequencing($content, $answer),
            ModuleBlock::BLOCK_SOAL_MATCHING => $this->gradeMatching($content, $answer),
            default => null,
        };

        return [
            'earned_points' => $correct === true ? $points : 0.0,
            'is_graded' => $correct !== null,
            'correct' => $correct,
        ];
    }

    /**
     * @param  array<string, mixed>  $content
     * @param  array<string, mixed>  $answer
     */
    private function gradeMcq(array $content, array $answer): bool
    {
        $index = $answer['option_index'] ?? null;
        if (! is_int($index) && ! (is_string($index) && ctype_digit($index))) {
            return false;
        }

        $options = array_values((array) ($content['options'] ?? []));

        return isset($options[(int) $index]) && (bool) ($options[(int) $index]['correct'] ?? false);
    }

    /**
     * @param  array<string, mixed>  $content
     * @param  array<string, mixed>  $answer
     */
    private function gradeSequencing(array $content, array $answer): bool
    {
        $expected = array_values((array) ($content['steps'] ?? []));
        $given = array_values((array) ($answer['order'] ?? []));

        if (count($expected) === 0 || count($expected) !== count($given)) {
            return false;
        }

        foreach ($expected as $position => $step) {
            if ((string) $step !== (string) $given[$position]) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $content
     * @param  array<string, mixed>  $answer
     */
    private function gradeMatching(array $content, array $answer): bool
    {
        $given = (array) ($answer['matching'] ?? []);
        $pairs = array_values((array) ($content['pairs'] ?? []));

        if (count($pairs) === 0) {
            return false;
        }

        foreach ($pairs as $pair) {
            $left = (string) ($pair['left'] ?? '');
            if (! isset($given[$left]) || (string) $given[$left] !== (string) ($pair['right'] ?? '')) {
                return false;
            }
        }

        return true;
    }
}
