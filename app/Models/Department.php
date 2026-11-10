<?php

namespace App\Models;

use Database\Factories\DepartmentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['code', 'name'])]
class Department extends Model
{
    /** @use HasFactory<DepartmentFactory> */
    use HasFactory;

    public function classrooms(): HasMany
    {
        return $this->hasMany(Classroom::class, 'department_id');
    }

    public function subjects(): HasMany
    {
        return $this->hasMany(Subject::class, 'department_id');
    }
}
