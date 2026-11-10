<?php

namespace App\Http\Requests;

use App\Models\LearningModule;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateLearningModuleRequest extends FormRequest
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
            'title' => ['sometimes', 'required', 'string', 'max:180'],
            'status' => ['sometimes', 'required', Rule::in(LearningModule::STATUS_TYPES)],
            'kktp_score' => ['sometimes', 'required', 'integer', 'min:0', 'max:100'],
            'max_attempts' => ['sometimes', 'required', 'integer', 'min:1', 'max:10'],
        ];
    }
}
