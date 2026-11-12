<?php

namespace App\Services;

use App\Models\ModuleBlock;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use ZipArchive;

/**
 * Impor soal dari berkas Word (.docx) atau RTF: ekstrak teks biasa lalu
 * parse format bank soal sederhana menjadi blok-blok Studio.
 *
 * Format yang dikenali (satu soal):
 *
 *   1. Bunyi pertanyaan...
 *   A. Pilihan pertama
 *   B. Pilihan kedua
 *   Kunci: A
 *   Pembahasan: penjelasan (opsional)
 *
 * Varian: tanpa pilihan + "Kunci: <teks>" dan pertanyaan berisi ___ menjadi
 * isian singkat; kunci Benar/Salah menjadi benar/salah; soal tanpa pilihan
 * dan tanpa kunci menjadi esai.
 */
class QuestionImportService
{
    public const MAX_QUESTIONS = 100;

    public function extractText(UploadedFile $file): string
    {
        $extension = strtolower($file->getClientOriginalExtension());

        return match ($extension) {
            'docx' => $this->docxToText((string) $file->getRealPath()),
            'rtf' => $this->rtfToText((string) file_get_contents((string) $file->getRealPath())),
            'doc' => throw ValidationException::withMessages([
                'file' => 'Format .doc lama tidak dapat dibaca. Buka berkas di Word lalu simpan ulang sebagai .docx atau .rtf.',
            ]),
            default => throw ValidationException::withMessages([
                'file' => 'Ekstensi berkas tidak didukung. Gunakan berkas .docx atau .rtf.',
            ]),
        };
    }

    private function docxToText(string $path): string
    {
        $zip = new ZipArchive;

        if ($zip->open($path) !== true) {
            throw ValidationException::withMessages([
                'file' => 'Berkas .docx tidak dapat dibuka (berkas rusak atau bukan dokumen Word).',
            ]);
        }

        $xml = $zip->getFromName('word/document.xml');
        $zip->close();

        if ($xml === false) {
            throw ValidationException::withMessages([
                'file' => 'Isi dokumen Word tidak ditemukan di dalam berkas .docx ini.',
            ]);
        }

        $xml = preg_replace('/<w:tab[^>]*\/>/', "\t", $xml);
        $xml = preg_replace('/<w:br[^>]*\/>/', "\n", $xml);
        $xml = preg_replace('/<\/w:p>/', "\n", $xml);
        $text = strip_tags((string) $xml);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_XML1, 'UTF-8');

        return str_replace(["\r\n", "\r"], "\n", $text);
    }

    /**
     * Konversi RTF sederhana ke teks: abaikan grup tujuan (font, warna,
     * info), ubah \par menjadi baris baru, \uN menjadi karakter unicode,
     * dan \'hh menjadi karakter Windows-1252.
     */
    private function rtfToText(string $rtf): string
    {
        $text = '';
        $length = strlen($rtf);
        $i = 0;
        $stack = [];
        $ignorable = false;
        $destinations = ['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'footnote'];

        while ($i < $length) {
            $char = $rtf[$i];

            if ($char === '{') {
                $stack[] = $ignorable;
                $i++;
                continue;
            }

            if ($char === '}') {
                $ignorable = array_pop($stack) ?? false;
                $i++;
                continue;
            }

            if ($char === '\\' && $i + 1 < $length) {
                $next = $rtf[$i + 1];

                if ($next === "'") {
                    $hex = substr($rtf, $i + 2, 2);
                    if (preg_match('/^[0-9a-fA-F]{2}$/', $hex) && ! $ignorable) {
                        $text .= mb_convert_encoding(chr((int) hexdec($hex)), 'UTF-8', 'Windows-1252');
                    }
                    $i += 4;
                    continue;
                }

                if (ctype_alpha($next)) {
                    $j = $i + 1;
                    $word = '';
                    while ($j < $length && ctype_alpha($rtf[$j])) {
                        $word .= $rtf[$j];
                        $j++;
                    }
                    $number = '';
                    if ($j < $length && ($rtf[$j] === '-' || ctype_digit($rtf[$j]))) {
                        if ($rtf[$j] === '-') {
                            $number .= '-';
                            $j++;
                        }
                        while ($j < $length && ctype_digit($rtf[$j])) {
                            $number .= $rtf[$j];
                            $j++;
                        }
                    }
                    // Satu spasi setelah control word adalah delimiter.
                    if ($j < $length && $rtf[$j] === ' ') {
                        $j++;
                    }

                    if ($word === '*' || in_array($word, $destinations, true)) {
                        $ignorable = true;
                    } elseif (! $ignorable) {
                        if ($word === 'par' || $word === 'line') {
                            $text .= "\n";
                        } elseif ($word === 'tab') {
                            $text .= "\t";
                        } elseif ($word === 'u' && $number !== '') {
                            $codepoint = (int) $number;
                            if ($codepoint < 0) {
                                $codepoint += 65536;
                            }
                            $text .= mb_chr($codepoint, 'UTF-8');
                            // Lewati satu karakter fallback setelah \uN.
                            if ($j < $length && $rtf[$j] !== '\\' && $rtf[$j] !== '{' && $rtf[$j] !== '}') {
                                $j++;
                            }
                        }
                    }

                    $i = $j;
                    continue;
                }

                if (! $ignorable) {
                    if ($next === '~') {
                        $text .= ' ';
                    } elseif ($next === '_') {
                        $text .= '-';
                    }
                }
                $i += 2;
                continue;
            }

            if (! $ignorable && $char !== "\r" && $char !== "\n") {
                $text .= $char;
            }
            $i++;
        }

        return str_replace(["\r\n", "\r"], "\n", $text);
    }

    /**
     * @return array{questions: array<int, array{block_type: string, points: int, content: array<string, mixed>}>, skipped: int, warnings: array<int, string>}
     */
    public function parseQuestions(string $text): array
    {
        $lines = array_map(
            fn (string $line) => trim($line),
            explode("\n", str_replace(["\r\n", "\r"], "\n", $text)),
        );

        $segments = [];
        $current = null;

        foreach ($lines as $line) {
            if (preg_match('/^(?:soal\s*)?\d{1,3}\s*[\.\)]\s*(.+)$/iu', $line, $match)) {
                if ($current !== null) {
                    $segments[] = $current;
                }
                $current = ['question_lines' => [$match[1]], 'options' => [], 'key' => null, 'explanation' => null, 'in_explanation' => false];
                continue;
            }

            if ($current === null) {
                continue;
            }

            if (preg_match('/^(?:kunci(?:\s*jawaban)?|jawaban)\s*[:\-]\s*(.+)$/iu', $line, $match)) {
                $current['key'] = trim($match[1]);
                $current['in_explanation'] = false;
                continue;
            }

            if (preg_match('/^(?:pembahasan|penjelasan)\s*[:\-]\s*(.*)$/iu', $line, $match)) {
                $current['explanation'] = trim($match[1]);
                $current['in_explanation'] = true;
                continue;
            }

            if ($line !== '' && preg_match('/^([A-E])\s*[\.\)]\s*(.+)$/u', $line, $match) && $current['explanation'] === null) {
                $current['options'][] = ['letter' => strtoupper($match[1]), 'text' => trim($match[2])];
                continue;
            }

            if ($line === '') {
                continue;
            }

            // Baris lanjutan: menempel ke pembahasan, opsi terakhir, atau soal.
            if ($current['in_explanation']) {
                $current['explanation'] = trim(($current['explanation'] ?? '').' '.$line);
            } elseif ($current['options'] !== []) {
                $last = count($current['options']) - 1;
                $current['options'][$last]['text'] .= ' '.$line;
            } else {
                $current['question_lines'][] = $line;
            }
        }

        if ($current !== null) {
            $segments[] = $current;
        }

        $questions = [];
        $skipped = 0;
        $warnings = [];

        foreach ($segments as $index => $segment) {
            $number = $index + 1;

            if (count($questions) >= self::MAX_QUESTIONS) {
                $skipped++;
                $warnings[] = 'Batas '.self::MAX_QUESTIONS.' soal per impor tercapai; sisa soal dilewati.';
                break;
            }

            $built = $this->buildBlock($segment);

            if ($built === null) {
                $skipped++;
                $warnings[] = "Soal ke-{$number} dilewati (format tidak lengkap atau kunci tidak cocok).";
                continue;
            }

            $questions[] = $built;
        }

        return ['questions' => $questions, 'skipped' => $skipped, 'warnings' => $warnings];
    }

    /**
     * @param  array{question_lines: array<int, string>, options: array<int, array{letter: string, text: string}>, key: ?string, explanation: ?string}  $segment
     * @return array{block_type: string, points: int, content: array<string, mixed>}|null
     */
    private function buildBlock(array $segment): ?array
    {
        $question = trim(implode(' ', $segment['question_lines']));
        $explanation = $segment['explanation'] !== null ? mb_substr($segment['explanation'], 0, 5000) : '';
        $key = $segment['key'] !== null ? trim($segment['key']) : null;
        $options = $segment['options'];

        if ($question === '' || mb_strlen($question) > 5000) {
            return null;
        }

        foreach ($options as $option) {
            if ($option['text'] === '' || mb_strlen($option['text']) > 1000) {
                return null;
            }
        }

        if (count($options) >= 2) {
            $correctIndex = $this->resolveKeyIndex($options, $key);

            if ($correctIndex === null) {
                return null;
            }

            // Benar/salah: tepat dua opsi "Benar" dan "Salah".
            $normalized = array_map(fn ($option) => mb_strtolower(trim($option['text'])), $options);
            if (count($options) === 2 && array_diff($normalized, ['benar', 'salah']) === [] && array_diff(['benar', 'salah'], $normalized) === []) {
                return [
                    'block_type' => ModuleBlock::BLOCK_SOAL_TRUEFALSE,
                    'points' => 10,
                    'content' => [
                        'question' => $question,
                        'answer' => $normalized[$correctIndex] === 'benar',
                        'explanation' => $explanation,
                    ],
                ];
            }

            return [
                'block_type' => ModuleBlock::BLOCK_SOAL_MCQ,
                'points' => 10,
                'content' => [
                    'question' => $question,
                    'options' => array_map(fn ($option, $optionIndex) => [
                        'text' => $option['text'],
                        'correct' => $optionIndex === $correctIndex,
                    ], $options, array_keys($options)),
                    'explanation' => $explanation,
                ],
            ];
        }

        if ($key !== null && $key !== '') {
            if (mb_stripos($question, '___') !== false) {
                return [
                    'block_type' => ModuleBlock::BLOCK_SOAL_FILLBLANK,
                    'points' => 10,
                    'content' => [
                        'question' => $question,
                        'answers' => [mb_substr($key, 0, 500)],
                        'explanation' => $explanation,
                    ],
                ];
            }

            if (in_array(mb_strtolower($key), ['benar', 'salah'], true)) {
                return [
                    'block_type' => ModuleBlock::BLOCK_SOAL_TRUEFALSE,
                    'points' => 10,
                    'content' => [
                        'question' => $question,
                        'answer' => mb_strtolower($key) === 'benar',
                        'explanation' => $explanation,
                    ],
                ];
            }

            return null;
        }

        // Tanpa pilihan dan tanpa kunci: soal esai.
        return [
            'block_type' => ModuleBlock::BLOCK_SOAL_ESSAY_AI,
            'points' => 10,
            'content' => [
                'question' => $question,
                'min_words' => 30,
            ],
        ];
    }

    /**
     * Petakan kunci ("B", "b", atau teks opsi persis) ke indeks opsi.
     *
     * @param  array<int, array{letter: string, text: string}>  $options
     */
    private function resolveKeyIndex(array $options, ?string $key): ?int
    {
        if ($key === null || $key === '') {
            return null;
        }

        if (preg_match('/^([A-E])[\.\)]?$/u', strtoupper(trim($key)), $match)) {
            foreach ($options as $index => $option) {
                if ($option['letter'] === $match[1]) {
                    return $index;
                }
            }

            return null;
        }

        foreach ($options as $index => $option) {
            if (mb_strtolower(trim($option['text'])) === mb_strtolower(trim($key))) {
                return $index;
            }
        }

        return null;
    }

    /**
     * Isi berkas template .rtf yang bisa dibuka & diedit di Word.
     */
    public function templateRtf(): string
    {
        return <<<'RTF'
{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0\fnil Arial;}}
\f0\fs22 TEMPLATE IMPOR SOAL\par
\par
Petunjuk format:\par
- Setiap soal diawali nomor, contoh: 1. lalu bunyi pertanyaan.\par
- Pilihan jawaban ditulis A. B. C. D. pada baris sendiri-sendiri.\par
- Baris Kunci: berisi huruf pilihan yang benar (atau teks jawabannya).\par
- Baris Pembahasan: bersifat opsional.\par
- Soal tanpa pilihan dan tanpa kunci menjadi soal esai.\par
- Soal berisi ___ dengan Kunci berupa teks menjadi isian singkat.\par
- Dua pilihan Benar dan Salah menjadi soal benar/salah.\par
- Hapus bagian petunjuk ini dan contoh di bawah sebelum mengimpor, atau biarkan saja: teks sebelum soal pertama akan diabaikan.\par
\par
1. Apa fungsi sensor MAP pada sistem PGM-FI?\par
A. Mengukur tekanan udara pada intake manifold\par
B. Mengukur suhu oli mesin\par
C. Mengatur putaran kipas radiator\par
D. Mengukur tegangan baterai\par
Kunci: A\par
Pembahasan: Sensor MAP mengukur tekanan udara di intake manifold untuk menentukan beban mesin.\par
\par
2. Ibu kota Provinsi Jawa Barat adalah ___.\par
Kunci: Bandung\par
\par
3. Sensor CKP menghasilkan sinyal berupa tegangan DC tetap.\par
A. Benar\par
B. Salah\par
Kunci: B\par
\par
4. Jelaskan langkah-langkah memeriksa kontinuitas kabel massa (ground) pada sepeda motor!\par
}
RTF;
    }
}
