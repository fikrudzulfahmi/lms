<?php

namespace App\Http\Requests;

use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class DuplicateModuleRequest extends FormRequest
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
        return [
            'title' => ['nullable', 'string', 'max:180'],
            'teaching_assignment_id' => ['nullable', 'integer', Rule::exists('teaching_assignments', 'id')],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                $assignmentId = $this->input('teaching_assignment_id');

                if ($assignmentId === null) {
                    return;
                }

                $assignment = TeachingAssignment::find((int) $assignmentId);
                $user = $this->user();

                if ($assignment === null) {
                    return;
                }

                if ($user->role === User::ROLE_TEACHER && $assignment->teacher_id !== $user->id) {
                    $validator->errors()->add(
                        'teaching_assignment_id',
                        'Anda hanya boleh menduplikasi modul ke kelas yang Anda ampu.',
                    );
                }
            },
        ];
    }
}
