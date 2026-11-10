<?php

namespace App\Policies;

use App\Models\LearningModule;
use App\Models\User;

class LearningModulePolicy
{
    /**
     * Admin boleh mengelola seluruh modul.
     */
    public function before(User $user, string $ability): ?bool
    {
        return $user->role === User::ROLE_ADMIN ? true : null;
    }

    public function viewAny(User $user): bool
    {
        return in_array($user->role, [User::ROLE_ADMIN, User::ROLE_TEACHER], true);
    }

    public function view(User $user, LearningModule $module): bool
    {
        return $this->owns($user, $module);
    }

    public function update(User $user, LearningModule $module): bool
    {
        return $this->owns($user, $module);
    }

    public function delete(User $user, LearningModule $module): bool
    {
        return $this->owns($user, $module);
    }

    private function owns(User $user, LearningModule $module): bool
    {
        if ($user->role !== User::ROLE_TEACHER) {
            return false;
        }

        $module->loadMissing('teachingAssignment');

        return $module->teachingAssignment?->teacher_id === $user->id;
    }
}
