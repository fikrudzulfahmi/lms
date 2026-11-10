<?php

namespace App\Http\Requests;

use App\Models\LearningModule;
use App\Models\User;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

class StoreModuleSlidesRequest extends FormRequest
{
    public const MAX_IMAGES = 60;

    public const MAX_BYTES = 4 * 1024 * 1024;

    private const DATA_URL_PATTERN = '#^data:image/(webp|png|jpe?g);base64,#i';

    public function authorize(): bool
    {
        $module = $this->route('module');

        return $module instanceof LearningModule
            && in_array($this->user()?->role, [User::ROLE_ADMIN, User::ROLE_TEACHER], true)
            && $this->user()->can('update', $module);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'source_name' => ['nullable', 'string', 'max:190'],
            'images' => ['required', 'array', 'min:1', 'max:'.self::MAX_IMAGES],
            'images.*' => ['required', 'string', $this->imageRule()],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'images.required' => 'Tidak ada halaman slide yang dikirim.',
            'images.max' => 'Maksimal '.self::MAX_IMAGES.' halaman per unggahan.',
            'images.*.required' => 'Data gambar halaman tidak boleh kosong.',
        ];
    }

    private function imageRule(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_string($value) || preg_match(self::DATA_URL_PATTERN, $value) !== 1) {
                $fail('Format gambar harus data URL WebP/PNG/JPEG base64.');

                return;
            }

            $payload = substr($value, strpos($value, ',') + 1);
            $binary = base64_decode($payload, true);

            if ($binary === false || $binary === '') {
                $fail('Gambar base64 tidak valid.');

                return;
            }

            if (strlen($binary) > self::MAX_BYTES) {
                $fail('Ukuran tiap gambar maksimal 4 MB.');

                return;
            }

            $info = @getimagesizefromstring($binary);

            if ($info === false || ! in_array($info['mime'] ?? '', ['image/webp', 'image/png', 'image/jpeg'], true)) {
                $fail('Berkas yang dikirim bukan gambar yang valid.');
            }
        };
    }
}
