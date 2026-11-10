<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'username', 'nisn', 'email', 'password', 'role', 'is_active'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Column defaults mirrored on the model so freshly created instances
     * behave like their persisted rows (the role middleware reads is_active
     * before the row is re-fetched).
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'role' => self::ROLE_STUDENT,
        'is_active' => true,
    ];

    public const ROLE_ADMIN = 'admin';

    public const ROLE_TEACHER = 'teacher';

    public const ROLE_STUDENT = 'student';

    public const ROLE_TYPES = [
        self::ROLE_ADMIN,
        self::ROLE_TEACHER,
        self::ROLE_STUDENT,
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    public function classrooms(): HasMany
    {
        return $this->hasMany(ClassroomStudent::class, 'student_id');
    }

    public function teachingAssignments(): HasMany
    {
        return $this->hasMany(TeachingAssignment::class, 'teacher_id');
    }

    public function learningObjectives(): HasMany
    {
        return $this->hasMany(LearningObjective::class, 'teacher_id');
    }

    public function responses(): HasMany
    {
        return $this->hasMany(StudentResponse::class, 'student_id');
    }

    public function moduleGrades(): HasMany
    {
        return $this->hasMany(ModuleGrade::class, 'student_id');
    }
}
