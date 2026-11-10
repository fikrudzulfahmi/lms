<?php

namespace App\Services;

use App\Exceptions\AiUnavailableException;
use App\Models\ModuleBlock;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Klien kurikulum AI (gateway OpenAI-compatible).
 *
 * Aturan token:
 * 1. System prompt 100% statis dan identik setiap request (prefix cache).
 * 2. Konteks kurikulum (semi-statis) dikirim sebelum tugas dinamis.
 * 3. LLM membalas JSON dengan key pendek; service ini yang meng-expand
 *    ke bentuk content kanonik sebelum disimpan ke module_blocks.
 */
class AiCurriculumService
{
    /** Tipe blok yang boleh dihasilkan AI (slide gambar tidak, itu upload guru). */
    public const AI_BLOCK_TYPES = [
        ModuleBlock::BLOCK_MATERI_TEKS,
        ModuleBlock::BLOCK_MATERI_ACCORDION,
        ModuleBlock::BLOCK_MATERI_FLASHCARD,
        ModuleBlock::BLOCK_SOAL_MCQ,
        ModuleBlock::BLOCK_SOAL_SEQUENCING,
        ModuleBlock::BLOCK_SOAL_MATCHING,
        ModuleBlock::BLOCK_SOAL_ESSAY_AI,
    ];

    /**
     * System prompt wajib statis: tanpa tanggal, ID request, atau nama guru.
     */
    private const SYSTEM_PROMPT = <<<'PROMPT'
Anda adalah instruktur ahli SMK di Indonesia dengan pengalaman mengajar Kurikulum Merdeka pada bidang teknik otomotif dan teknologi manufaktur. Anda menyusun bahan ajar modular yang operasional, aman, dan sesuai SOP bengkel.

ATURAN OUTPUT (WAJIB):
- Balas HANYA satu objek JSON valid. Tanpa markdown, tanpa code fence, tanpa kalimat pembuka atau penutup.
- Gunakan key JSON pendek persis seperti skema. Jangan menambah key lain.
- Bahasa Indonesia teknis yang jelas, kalimat ringkas, tanpa emoji.
- Materi harus faktual, aman, dan bisa dipraktikkan siswa SMK. Jangan mengarang angka spesifikasi pabrikan bila tidak yakin; gunakan rentang umum atau minta verifikasi buku manual.
- Soal harus mengukur tujuan pembelajaran, bukan hafalan dangkal. Satu soal esai wajib punya rubrik penilaian rahasia yang spesifik.

SKEMA ENVELOPE:
{"b":[{"t":"<tipe>","pts":<integer>,"c":{...},"rub":"<rubrik, hanya esai>"}]}

SKEMA PER TIPE (key pendek):
- materi_teks: {"t":"materi_teks","pts":0,"c":{"h":"judul max 180 karakter","txt":"2-5 paragraf materi, pisahkan paragraf dengan \n\n"}}
- materi_accordion: {"t":"materi_accordion","pts":0,"c":{"h":"judul","items":[{"lbl":"nama langkah/komponen","txt":"penjelasan 1-4 kalimat"}]}} (2-8 item, urut SOP)
- materi_flashcard: {"t":"materi_flashcard","pts":0,"c":{"h":"judul","cards":[{"f":"istilah/pertanyaan","b":"jawaban singkat"}]}} (minimal 4 kartu)
- soal_mcq: {"t":"soal_mcq","pts":10,"c":{"q":"pertanyaan","options":[{"t":"teks opsi","correct":true}],"explanation":"pembahasan singkat"}} (4-5 opsi, TEPAT satu correct=true)
- soal_sequencing: {"t":"soal_sequencing","pts":10,"c":{"q":"perintah mengurutkan","steps":["langkah 1","langkah 2"],"explanation":"pembahasan"}} (3-6 langkah, array sudah dalam urutan benar)
- soal_matching: {"t":"soal_matching","pts":10,"c":{"q":"perintah mencocokkan","pairs":[{"left":"komponen","right":"fungsi"}],"explanation":"pembahasan"}} (3-6 pasangan)
- soal_essay_ai: {"t":"soal_essay_ai","pts":20,"rub":"kunci konteks dan kriteria penilaian rahasia yang spesifik","c":{"q":"studi kasus","min_words":40}}

Kualitas:
- Judul materi spesifik, bukan "Materi Pembelajaran".
- Accordion dan sequencing mencerminkan urutan kerja nyata di bengkel/lab.
- Esai berupa studi kasus diagnosa yang menuntut penalaran, bukan definisi.
PROMPT;

    private const GRADER_SYSTEM_PROMPT = <<<'PROMPT'
Anda adalah asesor kompetensi SMK yang menilai jawaban esai siswa secara adil dan konsisten. Anda memahami Kurikulum Merdeka, keselamatan kerja, dan SOP teknik otomotif.

ATURAN OUTPUT (WAJIB):
- Balas HANYA satu objek JSON valid. Tanpa markdown, tanpa code fence, tanpa kalimat pembuka.
- Gunakan key pendek persis: {"g":[{"sid":<id siswa>,"pts":<angka>,"fb":"<umpan balik>"}]}
- Nilai SETIAP sid yang diberikan tepat satu kali.
- pts bilangan 0 sampai batas maksimum yang diberikan. Jangan pernah melebihi maksimum.
- fb maksimal 2 kalimat: sebutkan yang sudah benar dan satu perbaikan konkret. Bahasa Indonesia, tanpa emoji.
- Nilai berdasarkan rubrik guru. Jika jawaban kosong atau tidak relevan beri 0 dan jelaskan singkat.
- Jangan memihak, jangan menebak identitas siswa, dan jangan mengubah pertanyaan.
PROMPT;

    public function __construct(
        private readonly ?string $baseUrl = null,
        private readonly ?string $apiKey = null,
        private readonly ?string $model = null,
        private readonly ?int $timeout = null,
        private readonly ?int $maxTokens = null,
    ) {}

    /**
     * @param  array{module_title?: string, department?: string, count?: int, difficulty?: string, block_types?: array<int, string>, instruction?: string, existing_titles?: array<int, string>}  $context
     * @return array<int, array{block_type: string, points: int, content: array<string, mixed>, ai_rubric: ?string}>
     */
    public function generateModuleBlocks(
        string $subject,
        string $gradeLevel,
        string $objective,
        array $context = [],
    ): array {
        $types = $this->allowedTypes($context['block_types'] ?? []);
        $count = max(1, min(12, (int) ($context['count'] ?? 4)));
        $difficulty = in_array(($context['difficulty'] ?? 'sedang'), ['mudah', 'sedang', 'sulit'], true)
            ? $context['difficulty']
            : 'sedang';

        $messages = [
            ['role' => 'system', 'content' => self::SYSTEM_PROMPT],
            [
                'role' => 'user',
                'content' => $this->contextBlock($subject, $gradeLevel, $objective, $context),
            ],
            [
                'role' => 'user',
                'content' => $this->taskBlock($count, $difficulty, $types, $context),
            ],
        ];

        return $this->requestJson(
            $messages,
            fn (array $data): ?array => $this->normalizeBlocks($data, $types),
            0.4,
        );
    }

    /**
     * Nilai satu jawaban esai. Dipakai untuk pemakaian langsung; job memakai
     * gradeEssays() agar satu request menilai banyak siswa sekaligus.
     *
     * @return array{score: float, max_score: float, feedback: string}
     */
    public function gradeEssay(string $question, string $rubric, string $answer, float $maxPoints = 20.0): array
    {
        $results = $this->gradeEssays($question, $rubric, [['sid' => 1, 'ans' => $answer]], $maxPoints);
        $result = $results[1] ?? ['pts' => 0.0, 'fb' => 'Jawaban belum dapat dinilai otomatis.'];

        return [
            'score' => (float) $result['pts'],
            'max_score' => $maxPoints,
            'feedback' => (string) $result['fb'],
        ];
    }

    /**
     * Batch auto-grader: satu request untuk banyak siswa (hemat token).
     *
     * @param  array<int, array{sid: int, ans: string}>  $answers
     * @return array<int, array{pts: float, fb: string}> keyed by sid
     */
    public function gradeEssays(string $question, string $rubric, array $answers, float $maxPoints = 20.0): array
    {
        if ($answers === []) {
            return [];
        }

        $maxPoints = max(1.0, $maxPoints);

        $messages = [
            ['role' => 'system', 'content' => self::GRADER_SYSTEM_PROMPT],
            [
                'role' => 'user',
                'content' => "KONTEKS SOAL\nPertanyaan: {$question}\n\nRubrik rahasia guru: {$rubric}\n\nBatas maksimum poin: ".$this->formatNumber($maxPoints)."\nNilai array jawaban berikut. Balas dengan sid yang sama.",
            ],
            [
                'role' => 'user',
                'content' => 'JAWABAN SISWA (JSON): '.$this->encodeJson(['a' => array_values($answers)]),
            ],
        ];

        return $this->requestJson(
            $messages,
            fn (array $data): ?array => $this->normalizeGrades($data, $maxPoints),
            0.1,
        );
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $messages
     * @param  callable(array<string, mixed>): (array<mixed>|null)  $validator
     * @return array<mixed>
     */
    private function requestJson(array $messages, callable $validator, float $temperature): array
    {
        $lastRaw = '';

        for ($attempt = 1; $attempt <= 2; $attempt++) {
            $raw = $this->chatOnce($messages, $temperature);
            $lastRaw = $raw;

            $decoded = $this->decodeJson($raw);

            if (is_array($decoded)) {
                $validated = $validator($decoded);

                if (is_array($validated) && $validated !== []) {
                    return $validated;
                }
            }

            if ($attempt === 1) {
                $messages[] = ['role' => 'assistant', 'content' => mb_substr($raw, 0, 4000)];
                $messages[] = [
                    'role' => 'user',
                    'content' => 'Balasan sebelumnya bukan JSON valid sesuai skema. Ulangi HANYA dengan satu objek JSON valid, tanpa penjelasan dan tanpa code fence.',
                ];
            }
        }

        throw AiUnavailableException::badResponse(
            'JSON tidak valid setelah satu percobaan ulang. Cuplikan: '.mb_substr(trim($lastRaw), 0, 200),
        );
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $messages
     */
    private function chatOnce(array $messages, float $temperature): string
    {
        $baseUrl = rtrim($this->baseUrl ?? (string) config('ai.base_url'), '/');
        $apiKey = $this->apiKey ?? (string) config('ai.api_key');
        $model = $this->model ?? (string) config('ai.model');
        $timeout = $this->timeout ?? (int) config('ai.timeout', 90);
        $maxTokens = $this->maxTokens ?? (int) config('ai.max_tokens', 3500);

        if ($baseUrl === '' || $model === '') {
            throw AiUnavailableException::unreachable('AI_BASE_URL atau AI_MODEL belum dikonfigurasi.');
        }

        try {
            $response = Http::withToken($apiKey)
                ->acceptJson()
                ->asJson()
                ->timeout(max(5, $timeout))
                ->post($baseUrl.'/chat/completions', [
                    'model' => $model,
                    'messages' => $messages,
                    'temperature' => $temperature,
                    'max_tokens' => $maxTokens,
                    'stream' => false,
                ]);
        } catch (ConnectionException $exception) {
            throw AiUnavailableException::unreachable($exception->getMessage(), $exception);
        }

        if (! $response->successful()) {
            $status = $response->status();
            $userMessage = match (true) {
                $status === 429 => 'Kuota AI sedang penuh. Tunggu sebentar lalu coba lagi.',
                in_array($status, [401, 403], true) => 'Konfigurasi layanan AI belum benar. Hubungi admin.',
                $status >= 500 => 'Layanan AI sedang gangguan. Coba lagi beberapa saat.',
                default => 'Permintaan ke AI ditolak. Coba lagi dengan pengaturan berbeda.',
            };

            throw new AiUnavailableException(
                "Gateway AI membalas HTTP {$status}: ".mb_substr($response->body(), 0, 300),
                $userMessage,
            );
        }

        $payload = $response->json();
        $content = $payload['choices'][0]['message']['content'] ?? null;

        if (is_array($content)) {
            $content = collect($content)
                ->map(fn ($part) => is_array($part) ? ($part['text'] ?? '') : (string) $part)
                ->implode('');
        }

        if (! is_string($content) || trim($content) === '') {
            throw AiUnavailableException::badResponse('Pilihan message.content kosong.');
        }

        return $content;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function decodeJson(string $raw): ?array
    {
        $text = trim(preg_replace('/^\xEF\xBB\xBF/', '', $raw) ?? $raw);

        if (str_starts_with($text, '```')) {
            $text = preg_replace('/^```[a-zA-Z0-9_-]*\s*/', '', $text) ?? $text;
            $text = preg_replace('/\s*```$/', '', $text) ?? $text;
            $text = trim($text);
        }

        $start = strpos($text, '{');
        $end = strrpos($text, '}');

        if ($start !== false && $end !== false && $end > $start) {
            $text = substr($text, $start, $end - $start + 1);
        }

        $decoded = json_decode($text, true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<int, string>  $allowed
     * @return array<int, array{block_type: string, points: int, content: array<string, mixed>, ai_rubric: ?string}>
     */
    private function normalizeBlocks(array $data, array $allowed): array
    {
        $rawBlocks = $data['b'] ?? $data['blocks'] ?? null;

        if (! is_array($rawBlocks)) {
            return [];
        }

        $blocks = [];

        foreach ($rawBlocks as $raw) {
            if (! is_array($raw)) {
                continue;
            }

            $type = (string) ($raw['t'] ?? $raw['type'] ?? $raw['block_type'] ?? '');
            $content = $raw['c'] ?? $raw['content'] ?? null;

            if (! in_array($type, $allowed, true) || ! is_array($content)) {
                continue;
            }

            $expanded = $this->expandContent($type, $content);

            if ($expanded === null) {
                continue;
            }

            $isQuestion = str_starts_with($type, 'soal_');
            $points = (int) ($raw['pts'] ?? $raw['points'] ?? ($isQuestion ? 10 : 0));
            $points = max(0, min(1000, $points));
            $points = $isQuestion ? max(1, $points) : 0;

            $rubric = $raw['rub'] ?? $raw['ai_rubric'] ?? null;
            $rubric = is_string($rubric) ? trim($rubric) : '';

            if ($type === ModuleBlock::BLOCK_SOAL_ESSAY_AI && $rubric === '') {
                $rubric = 'Nilai ketepatan konsep, kelengkapan langkah kerja, keselamatan kerja, dan penggunaan istilah teknis yang benar.';
            }

            $blocks[] = [
                'block_type' => $type,
                'points' => $points,
                'content' => $expanded,
                'ai_rubric' => $type === ModuleBlock::BLOCK_SOAL_ESSAY_AI ? mb_substr($rubric, 0, 5000) : null,
            ];
        }

        return array_slice($blocks, 0, 12);
    }

    /**
     * Expand key pendek LLM -> content kanonik yang dipakai renderer & validasi.
     *
     * @param  array<string, mixed>  $c
     * @return array<string, mixed>|null
     */
    private function expandContent(string $type, array $c): ?array
    {
        return match ($type) {
            ModuleBlock::BLOCK_MATERI_TEKS => $this->textContent($c),
            ModuleBlock::BLOCK_MATERI_ACCORDION => $this->accordionContent($c),
            ModuleBlock::BLOCK_MATERI_FLASHCARD => $this->flashcardContent($c),
            ModuleBlock::BLOCK_SOAL_MCQ => $this->mcqContent($c),
            ModuleBlock::BLOCK_SOAL_SEQUENCING => $this->sequencingContent($c),
            ModuleBlock::BLOCK_SOAL_MATCHING => $this->matchingContent($c),
            ModuleBlock::BLOCK_SOAL_ESSAY_AI => $this->essayContent($c),
            default => null,
        };
    }

    /**
     * @param  array<string, mixed>  $c
     * @return array<string, string>|null
     */
    private function textContent(array $c): ?array
    {
        $title = $this->pick($c, ['h', 'title'], 180);
        $body = $this->pick($c, ['txt', 'body', 'text'], 20000);

        return $title !== '' && $body !== '' ? ['title' => $title, 'body' => $body] : null;
    }

    /**
     * @param  array<string, mixed>  $c
     * @return array<string, mixed>|null
     */
    private function accordionContent(array $c): ?array
    {
        $title = $this->pick($c, ['h', 'title'], 180);
        $items = [];

        foreach ((array) ($c['items'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }

            $label = $this->pick($item, ['lbl', 'label', 'title'], 180);
            $text = $this->pick($item, ['txt', 'text', 'body'], 5000);

            if ($label !== '' && $text !== '') {
                $items[] = ['label' => $label, 'text' => $text];
            }
        }

        $items = array_slice($items, 0, 30);

        return $title !== '' && $items !== [] ? ['title' => $title, 'items' => $items] : null;
    }

    /**
     * @param  array<string, mixed>  $c
     * @return array<string, mixed>|null
     */
    private function flashcardContent(array $c): ?array
    {
        $title = $this->pick($c, ['h', 'title'], 180);
        $cards = [];

        foreach ((array) ($c['cards'] ?? []) as $card) {
            if (! is_array($card)) {
                continue;
            }

            $front = $this->pick($card, ['f', 'front'], 500);
            $back = $this->pick($card, ['b', 'back'], 2000);

            if ($front !== '' && $back !== '') {
                $cards[] = ['front' => $front, 'back' => $back];
            }
        }

        $cards = array_slice($cards, 0, 50);

        return $title !== '' && count($cards) >= 2 ? ['title' => $title, 'cards' => $cards] : null;
    }

    /**
     * @param  array<string, mixed>  $c
     * @return array<string, mixed>|null
     */
    private function mcqContent(array $c): ?array
    {
        $question = $this->pick($c, ['q', 'question'], 5000);
        $options = [];

        foreach ((array) ($c['options'] ?? []) as $option) {
            if (is_string($option)) {
                $options[] = ['text' => mb_substr(trim($option), 0, 1000), 'correct' => false];

                continue;
            }

            if (! is_array($option)) {
                continue;
            }

            $text = $this->pick($option, ['t', 'text', 'label'], 1000);

            if ($text !== '') {
                $options[] = ['text' => $text, 'correct' => (bool) ($option['correct'] ?? false)];
            }
        }

        $options = array_slice($options, 0, 10);

        if ($question === '' || count($options) < 2) {
            return null;
        }

        $correctIndexes = array_keys(array_filter($options, fn (array $option) => $option['correct'] === true));

        if ($correctIndexes === []) {
            $options[0]['correct'] = true;
        } elseif (count($correctIndexes) > 1) {
            foreach ($options as $index => $option) {
                $options[$index]['correct'] = $index === $correctIndexes[0];
            }
        }

        return [
            'question' => $question,
            'options' => $options,
            'explanation' => $this->pick($c, ['explanation', 'pembahasan'], 5000),
        ];
    }

    /**
     * @param  array<string, mixed>  $c
     * @return array<string, mixed>|null
     */
    private function sequencingContent(array $c): ?array
    {
        $question = $this->pick($c, ['q', 'question'], 5000);
        $steps = [];

        foreach ((array) ($c['steps'] ?? []) as $step) {
            if (is_string($step) && trim($step) !== '') {
                $steps[] = mb_substr(trim($step), 0, 1000);
            }
        }

        $steps = array_slice($steps, 0, 20);

        return $question !== '' && count($steps) >= 2
            ? ['question' => $question, 'steps' => $steps, 'explanation' => $this->pick($c, ['explanation', 'pembahasan'], 5000)]
            : null;
    }

    /**
     * @param  array<string, mixed>  $c
     * @return array<string, mixed>|null
     */
    private function matchingContent(array $c): ?array
    {
        $question = $this->pick($c, ['q', 'question'], 5000);
        $pairs = [];

        foreach ((array) ($c['pairs'] ?? []) as $pair) {
            if (! is_array($pair)) {
                continue;
            }

            $left = $this->pick($pair, ['left', 'l'], 500);
            $right = $this->pick($pair, ['right', 'r'], 500);

            if ($left !== '' && $right !== '') {
                $pairs[] = ['left' => $left, 'right' => $right];
            }
        }

        $pairs = array_slice($pairs, 0, 20);

        return $question !== '' && count($pairs) >= 2
            ? ['question' => $question, 'pairs' => $pairs, 'explanation' => $this->pick($c, ['explanation', 'pembahasan'], 5000)]
            : null;
    }

    /**
     * @param  array<string, mixed>  $c
     * @return array<string, mixed>|null
     */
    private function essayContent(array $c): ?array
    {
        $question = $this->pick($c, ['q', 'question'], 5000);

        if ($question === '') {
            return null;
        }

        $minWords = (int) ($c['min_words'] ?? 40);

        return ['question' => $question, 'min_words' => max(0, min(2000, $minWords))];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<int, array{pts: float, fb: string}>
     */
    private function normalizeGrades(array $data, float $maxPoints): array
    {
        $rows = $data['g'] ?? $data['grades'] ?? null;

        if (! is_array($rows)) {
            return [];
        }

        $grades = [];

        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $sid = (int) ($row['sid'] ?? $row['student_id'] ?? 0);
            $points = (float) ($row['pts'] ?? $row['score'] ?? -1);
            $feedback = $row['fb'] ?? $row['feedback'] ?? '';

            if ($sid <= 0 || $points < 0 || ! is_string($feedback)) {
                continue;
            }

            $grades[$sid] = [
                'pts' => round(max(0.0, min($maxPoints, $points)), 2),
                'fb' => mb_substr(trim($feedback), 0, 1000),
            ];
        }

        return $grades;
    }

    /**
     * @param  array<int, mixed>  $requested
     * @return array<int, string>
     */
    private function allowedTypes(array $requested): array
    {
        $requested = array_values(array_filter(
            array_map('strval', $requested),
            fn (string $type): bool => in_array($type, self::AI_BLOCK_TYPES, true),
        ));

        return $requested === [] ? self::AI_BLOCK_TYPES : array_values(array_unique($requested));
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function contextBlock(string $subject, string $gradeLevel, string $objective, array $context): string
    {
        $lines = [
            'KONTEKS KURIKULUM',
            'Jurusan: '.($context['department'] ?? '-'),
            'Kelas: '.$gradeLevel,
            'Mata pelajaran: '.$subject,
            'Modul: '.($context['module_title'] ?? '-'),
            'Tujuan pembelajaran: '.$objective,
        ];

        $existing = array_values(array_filter((array) ($context['existing_titles'] ?? [])));

        if ($existing !== []) {
            $lines[] = 'Blok yang sudah ada (jangan duplikasi judul/soal): '.implode(' | ', array_slice($existing, 0, 20));
        }

        return implode("\n", $lines);
    }

    /**
     * @param  array<int, string>  $types
     * @param  array<string, mixed>  $context
     */
    private function taskBlock(int $count, string $difficulty, array $types, array $context): string
    {
        $instruction = trim((string) ($context['instruction'] ?? ''));

        $lines = [
            'TUGAS',
            "Buat tepat {$count} blok untuk modul ini dengan tingkat kesulitan {$difficulty}.",
            'Tipe blok yang diizinkan: '.implode(', ', $types).'.',
            'Jangan memakai tipe di luar daftar tersebut. Pastikan minimal satu blok soal dan satu blok materi.',
            'Urutkan blok secara pedagogis: materi -> contoh -> latihan -> asesmen.',
        ];

        if ($instruction !== '') {
            $lines[] = 'Catatan khusus guru: '.$instruction;
        }

        $lines[] = 'Ingat: balas hanya objek JSON {"b":[...]} tanpa teks lain.';

        return implode("\n", $lines);
    }

    /**
     * @param  array<string, mixed>  $source
     * @param  array<int, string>  $keys
     */
    private function pick(array $source, array $keys, int $max): string
    {
        foreach ($keys as $key) {
            $value = $source[$key] ?? null;

            if (is_string($value) && trim($value) !== '') {
                return mb_substr(trim($value), 0, $max);
            }
        }

        return '';
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function encodeJson(array $payload): string
    {
        return json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]';
    }

    private function formatNumber(float $value): string
    {
        return rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.');
    }
}
