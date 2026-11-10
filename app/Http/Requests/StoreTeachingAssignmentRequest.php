<?php

namespace App\Http\Requests;

use App\Models\AcademicYear;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTeachingAssignmentRequest extends FormRequest
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
            'academic_year_id' => ['required', 'integer', Rule::exists('academic_years', 'id')],
            'teacher_id' => [
                'required',
                'integer',
                Rule::exists('users', 'id')->where('role', User::ROLE_TEACHER),
            ],
            'subject_id' => ['required', 'integer', Rule::exists('subjects', 'id')],
            'classroom_ids' => ['required', 'array', 'min:1'],
            'classroom_ids.*' => ['required', 'integer', Rule::exists('classrooms', 'id')],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (blank($this->input('academic_year_id'))) {
            $yearId = AcademicYear::active()?->id;

            if ($yearId !== null) {
                $this->merge(['academic_year_id' => $yearId]);
            }
        }
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'teacher_id.exists' => 'Guru tidak ditemukan atau tidak aktif sebagai pengajar.',
            'classroom_ids.required' => 'Pilih minimal satu kelas.',
            'academic_year_id.required' => 'Belum ada tahun pelajaran aktif.',
        ];
    }
}
