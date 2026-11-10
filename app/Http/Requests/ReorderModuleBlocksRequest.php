<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ReorderModuleBlocksRequest extends FormRequest
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
            'ids' => ['required', 'array', 'min:1', 'max:500'],
            'ids.*' => ['required', 'uuid', 'distinct'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                $module = $this->route('module');
                $existing = $module->blocks()->pluck('id')->sort()->values()->all();
                $submitted = collect($this->input('ids'))->sort()->values()->all();

                if ($existing !== $submitted) {
                    $validator->errors()->add(
                        'ids',
                        'Daftar urutan harus memuat tepat seluruh blok milik modul ini.',
                    );
                }
            },
        ];
    }
}
