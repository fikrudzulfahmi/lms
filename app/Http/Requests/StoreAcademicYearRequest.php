<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAcademicYearRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === User::ROLE_ADMIN;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => [
                'required',
                'string',
                'regex:/^\d{4}\/\d{4}$/',
                'max:20',
                Rule::unique('academic_years', 'name')
                    ->where('semester', $this->input('semester'))
                    ->ignore($this->route('year')?->id),
            ],
            'semester' => ['required', Rule::in(['ganjil', 'genap'])],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->filled('name')) {
            $this->merge(['name' => trim((string) $this->input('name'))]);
        }
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.regex' => 'Format tahun pelajaran harus 2026/2027.',
            'name.unique' => 'Tahun pelajaran + semester tersebut sudah ada.',
        ];
    }
}
