<?php

namespace App\Policies;

use App\Models\ModuleGrade;
use App\Models\User;

class ModuleGradePolicy
{
    public function before(User $user, string $ability): ?bool
    {
        return $user->role === User::ROLE_ADMIN ? true : null;
    }

    public function view(User $user, ModuleGrade $grade): bool
    {
        return $this->owns($user, $grade);
    }

    public function update(User $user, ModuleGrade $grade): bool
    {
        return $this->owns($user, $grade);
    }

    private function owns(User $user, ModuleGrade $grade): bool
    {
        if ($user->role !== User::ROLE_TEACHER) {
            return false;
        }

        $grade->loadMissing('module.teachingAssignment');

        return $grade->module?->teachingAssignment?->teacher_id === $user->id;
    }
}
