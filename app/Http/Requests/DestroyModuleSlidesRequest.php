<?php

namespace App\Http\Requests;

use App\Models\LearningModule;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class DestroyModuleSlidesRequest extends FormRequest
{
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
        $module = $this->route('module');

        return [
            'paths' => ['required', 'array', 'min:1', 'max:'.StoreModuleSlidesRequest::MAX_IMAGES],
            'paths.*' => [
                'required',
                'string',
                'max:255',
                'distinct',
                $module instanceof LearningModule
                    ? Rule::in($this->storedPaths($module))
                    : 'string',
            ],
        ];
    }

    /**
     * @return array<int, string>
     */
    private function storedPaths(LearningModule $module): array
    {
        $prefix = 'modules/'.$module->id.'/';

        return collect(\Illuminate\Support\Facades\Storage::disk('public')->files($prefix))
            ->map(fn (string $path) => $path)
            ->values()
            ->all();
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'paths.*.in' => 'Berkas slide tidak ditemukan pada modul ini.',
        ];
    }
}
