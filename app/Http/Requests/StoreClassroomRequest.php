<?php

namespace App\Http\Requests;

use App\Models\Classroom;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreClassroomRequest extends FormRequest
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
        $classroomId = $this->route('classroom')?->id;

        return [
            'department_id' => ['required', 'integer', Rule::exists('departments', 'id')],
            'grade_level' => ['required', Rule::in(Classroom::GRADE_LEVELS)],
            'name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('classrooms', 'name')
                    ->where('department_id', $this->input('department_id'))
                    ->ignore($classroomId),
            ],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('name')) {
            $this->merge(['name' => trim((string) $this->input('name'))]);
        }
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.unique' => 'Nama kelas sudah dipakai pada jurusan ini.',
        ];
    }
}
