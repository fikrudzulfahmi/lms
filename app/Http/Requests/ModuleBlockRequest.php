<?php

namespace App\Http\Requests;

use App\Models\ModuleBlock;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

abstract class ModuleBlockRequest extends FormRequest
{
    public function authorize(): bool
    {
        $module = $this->route('module');

        return $module !== null
            && in_array($this->user()?->role, [User::ROLE_ADMIN, User::ROLE_TEACHER], true)
            && $this->user()->can('update', $module);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $type = (string) $this->input('block_type');

        $rules = [
            'block_type' => ['required', Rule::in(ModuleBlock::BLOCK_TYPES)],
            'points' => ['required', 'integer', 'min:0', 'max:1000'],
            'content' => ['required', 'array'],
            'ai_rubric' => ['nullable', 'string', 'max:5000'],
        ];

        return array_merge($rules, match ($type) {
            ModuleBlock::BLOCK_SECTION_HEADING => [
                'content.title' => ['required', 'string', 'max:180'],
                'content.body' => ['nullable', 'string', 'max:2000'],
            ],
            ModuleBlock::BLOCK_MATERI_RICHTEXT => [
                'content.title' => ['nullable', 'string', 'max:180'],
                'content.body' => ['required', 'string', 'max:20000'],
            ],
            ModuleBlock::BLOCK_MATERI_VIDEO => [
                'content.title' => ['nullable', 'string', 'max:180'],
                'content.source' => ['required', 'string', Rule::in(['youtube', 'url', 'upload'])],
                'content.url' => ['required', 'string', 'max:2048', 'regex:/^(https?:\/\/|\/)/i'],
                'content.caption' => ['nullable', 'string', 'max:500'],
            ],
            ModuleBlock::BLOCK_MATERI_FILE => [
                'content.title' => ['nullable', 'string', 'max:180'],
                'content.files' => ['required', 'array', 'min:1', 'max:20'],
                'content.files.*.name' => ['required', 'string', 'max:255'],
                'content.files.*.url' => ['required', 'string', 'max:2048', 'regex:/^(https?:\/\/|\/)/i'],
                'content.files.*.size' => ['nullable', 'integer', 'min:0'],
            ],
            ModuleBlock::BLOCK_MATERI_EMBED => [
                'content.title' => ['nullable', 'string', 'max:180'],
                'content.url' => ['required', 'string', 'max:2048', 'regex:/^(https?:\/\/|\/)/i'],
                'content.embed' => ['nullable', 'boolean'],
                'content.caption' => ['nullable', 'string', 'max:500'],
            ],
            ModuleBlock::BLOCK_MATERI_TEKS => [
                'content.title' => ['required', 'string', 'max:180'],
                'content.body' => ['required', 'string', 'max:20000'],
            ],
            ModuleBlock::BLOCK_MATERI_ACCORDION => [
                'content.title' => ['required', 'string', 'max:180'],
                'content.items' => ['required', 'array', 'min:1', 'max:30'],
                'content.items.*.label' => ['required', 'string', 'max:180'],
                'content.items.*.text' => ['required', 'string', 'max:5000'],
            ],
            ModuleBlock::BLOCK_MATERI_FLASHCARD => [
                'content.title' => ['required', 'string', 'max:180'],
                'content.cards' => ['required', 'array', 'min:2', 'max:50'],
                'content.cards.*.front' => ['required', 'string', 'max:500'],
                'content.cards.*.back' => ['required', 'string', 'max:2000'],
            ],
            ModuleBlock::BLOCK_SLIDE_IMAGE => [
                'content.url' => ['nullable', 'string', 'max:2048', 'regex:/^(https?:\/\/|\/)/i'],
                'content.images' => ['nullable', 'array', 'max:60'],
                'content.images.*' => ['required', 'string', 'max:2048', 'regex:/^(https?:\/\/|\/)/i'],
                'content.caption' => ['nullable', 'string', 'max:500'],
            ],
            ModuleBlock::BLOCK_SOAL_MCQ => [
                'content.question' => ['required', 'string', 'max:5000'],
                'content.options' => ['required', 'array', 'min:2', 'max:10'],
                'content.options.*.text' => ['required', 'string', 'max:1000'],
                'content.options.*.correct' => ['required', 'boolean'],
                'content.explanation' => ['nullable', 'string', 'max:5000'],
            ],
            ModuleBlock::BLOCK_SOAL_TRUEFALSE => [
                'content.question' => ['required', 'string', 'max:5000'],
                'content.answer' => ['required', 'boolean'],
                'content.explanation' => ['nullable', 'string', 'max:5000'],
            ],
            ModuleBlock::BLOCK_SOAL_FILLBLANK => [
                'content.question' => ['required', 'string', 'max:5000'],
                'content.answers' => ['required', 'array', 'min:1', 'max:10'],
                'content.answers.*' => ['required', 'string', 'max:500'],
                'content.explanation' => ['nullable', 'string', 'max:5000'],
            ],
            ModuleBlock::BLOCK_SOAL_SEQUENCING => [
                'content.question' => ['required', 'string', 'max:5000'],
                'content.steps' => ['required', 'array', 'min:2', 'max:20'],
                'content.steps.*' => ['required', 'string', 'max:1000'],
                'content.explanation' => ['nullable', 'string', 'max:5000'],
            ],
            ModuleBlock::BLOCK_SOAL_MATCHING => [
                'content.question' => ['required', 'string', 'max:5000'],
                'content.pairs' => ['required', 'array', 'min:2', 'max:20'],
                'content.pairs.*.left' => ['required', 'string', 'max:500'],
                'content.pairs.*.right' => ['required', 'string', 'max:500'],
                'content.explanation' => ['nullable', 'string', 'max:5000'],
            ],
            ModuleBlock::BLOCK_SOAL_ESSAY_AI => [
                'content.question' => ['required', 'string', 'max:5000'],
                'content.min_words' => ['nullable', 'integer', 'min:0', 'max:2000'],
            ],
            default => [],
        });
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $type = (string) $this->input('block_type');
                $points = (int) $this->input('points', 0);
                $isQuestion = str_starts_with($type, 'soal_');

                if ($isQuestion && $points < 1) {
                    $validator->errors()->add('points', 'Blok soal wajib memiliki poin minimal 1.');
                }

                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                if ($type === ModuleBlock::BLOCK_SLIDE_IMAGE) {
                    $url = trim((string) $this->input('content.url', ''));
                    $images = array_filter((array) $this->input('content.images', []), fn ($item) => is_string($item) && trim($item) !== '');

                    if ($url === '' && $images === []) {
                        $validator->errors()->add('content.url', 'Isi URL gambar atau impor minimal satu halaman PDF.');
                    }
                }

                if ($type === ModuleBlock::BLOCK_SOAL_MCQ) {
                    $options = (array) $this->input('content.options', []);
                    $correct = collect($options)->filter(fn ($option) => (bool) ($option['correct'] ?? false))->count();

                    if ($correct !== 1) {
                        $validator->errors()->add(
                            'content.options',
                            'Pilihan ganda wajib memiliki tepat satu jawaban benar.',
                        );
                    }
                }
            },
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'content.url.regex' => 'URL harus diawali http://, https://, atau /.',
            'content.files.*.url.regex' => 'URL berkas harus diawali http://, https://, atau /.',
            'content.options.*.correct.required' => 'Tandai benar/salah untuk setiap opsi.',
        ];
    }
}
