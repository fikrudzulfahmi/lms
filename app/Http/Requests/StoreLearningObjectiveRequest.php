<?php

namespace App\Http\Requests;

use App\Models\Classroom;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreLearningObjectiveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, [User::ROLE_ADMIN, User::ROLE_TEACHER], true);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'subject_id' => ['required', 'integer', Rule::exists('subjects', 'id')],
            'grade_level' => ['required', Rule::in(Classroom::GRADE_LEVELS)],
            'code' => [
                'required',
                'string',
                'max:30',
                Rule::unique('learning_objectives', 'code')
                    ->where('subject_id', $this->input('subject_id'))
                    ->where('grade_level', $this->input('grade_level'))
                    ->ignore($this->route('objective')?->id),
            ],
            'description' => ['required', 'string', 'max:1000'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->filled('code')) {
            $this->merge(['code' => strtoupper(trim((string) $this->input('code')))]);
        }

        if ($this->filled('description')) {
            $this->merge(['description' => trim((string) $this->input('description'))]);
        }
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'code.unique' => 'Kode TP sudah dipakai untuk mapel & jenjang ini.',
        ];
    }
}
