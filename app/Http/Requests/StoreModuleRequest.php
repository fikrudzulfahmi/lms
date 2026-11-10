<?php

namespace App\Http\Requests;

use App\Models\LearningModule;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreModuleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, [User::ROLE_ADMIN, User::ROLE_TEACHER], true);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'teaching_assignment_id' => ['required', 'integer', Rule::exists('teaching_assignments', 'id')],
            'learning_objective_id' => ['nullable', 'integer', Rule::exists('learning_objectives', 'id')],
            'title' => ['required', 'string', 'max:180'],
            'assessment_type' => ['required', Rule::in(LearningModule::ASSESSMENT_TYPES)],
            'kktp_score' => ['nullable', 'integer', 'min:0', 'max:100'],
            'max_attempts' => ['nullable', 'integer', 'min:1', 'max:10'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                $assignment = TeachingAssignment::find($this->integer('teaching_assignment_id'));
                $user = $this->user();

                if ($assignment === null) {
                    return;
                }

                if ($user->role === User::ROLE_TEACHER && $assignment->teacher_id !== $user->id) {
                    $validator->errors()->add(
                        'teaching_assignment_id',
                        'Anda hanya boleh membuat modul pada kelas yang Anda ampu.',
                    );

                    return;
                }

                $objectiveId = $this->input('learning_objective_id');

                if ($objectiveId !== null) {
                    $matchesSubject = \App\Models\LearningObjective::query()
                        ->whereKey($objectiveId)
                        ->where('subject_id', $assignment->subject_id)
                        ->exists();

                    if (! $matchesSubject) {
                        $validator->errors()->add(
                            'learning_objective_id',
                            'Tujuan pembelajaran harus berasal dari mata pelajaran yang sama.',
                        );
                    }
                }
            },
        ];
    }
}
