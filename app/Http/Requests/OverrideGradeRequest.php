<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class OverrideGradeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'score' => ['required', 'numeric', 'min:0', 'max:100'],
            'reason' => ['required', 'string', 'min:5', 'max:1000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'score.required' => 'Nilai override wajib diisi.',
            'score.numeric' => 'Nilai override harus berupa angka.',
            'score.min' => 'Nilai override minimal 0.',
            'score.max' => 'Nilai override maksimal 100.',
            'reason.required' => 'Alasan override wajib diisi.',
            'reason.min' => 'Alasan override minimal 5 karakter.',
        ];
    }
}
