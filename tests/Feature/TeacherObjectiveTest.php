<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\LearningModule;
use App\Models\LearningObjective;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class TeacherObjectiveTest extends TestCase
{
    use RefreshDatabase;

    private function activeYear(): AcademicYear
    {
        return AcademicYear::factory()->create([
            'name' => '2026/2027',
            'semester' => 'ganjil',
            'is_active' => true,
        ]);
    }

    private function teacherWithSubject(): array
    {
        $year = $this->activeYear();
        $teacher = User::factory()->create(['role' => User::ROLE_TEACHER, 'is_active' => true]);
        $subject = Subject::factory()->create(['code' => 'PLPK']);
        $classroom = Classroom::factory()->create(['name' => 'XI TSM 1']);

        TeachingAssignment::create([
            'academic_year_id' => $year->id,
            'teacher_id' => $teacher->id,
            'subject_id' => $subject->id,
            'classroom_id' => $classroom->id,
        ]);

        return [$teacher, $subject, $year];
    }

    public function test_guest_is_redirected_from_teacher_objectives(): void
    {
        $this->get('/teacher/objectives')->assertRedirect('/login');
    }

    public function test_teacher_only_sees_objectives_of_own_subjects(): void
    {
        [$teacher, $subject] = $this->teacherWithSubject();
        $foreign = Subject::factory()->create(['code' => 'RPL']);

        LearningObjective::create([
            'subject_id' => $subject->id,
            'grade_level' => 'XI',
            'code' => 'TP-1.1',
            'description' => 'Menjelaskan prinsip kelistrikan.',
        ]);
        LearningObjective::create([
            'subject_id' => $foreign->id,
            'grade_level' => 'XI',
            'code' => 'TP-9.9',
            'description' => 'Membuat aplikasi web.',
        ]);

        $this->actingAs($teacher)
            ->get('/teacher/objectives')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Teacher/Objectives')
                ->has('subjects', 1)
                ->where('subjects.0.code', 'PLPK')
                ->has('objectives', 1)
                ->where('objectives.0.code', 'TP-1.1')
                ->where('total', 1));
    }

    public function test_teacher_can_create_objective_for_own_subject(): void
    {
        [$teacher, $subject] = $this->teacherWithSubject();

        $this->actingAs($teacher)->post('/teacher/objectives', [
            'subject_id' => $subject->id,
            'grade_level' => 'XI',
            'code' => 'tp-1.2',
            'description' => 'Mendiagnosis gangguan sensor.',
        ])->assertRedirect();

        $this->assertDatabaseHas('learning_objectives', [
            'subject_id' => $subject->id,
            'grade_level' => 'XI',
            'code' => 'TP-1.2',
        ]);

        $this->actingAs($teacher)->post('/teacher/objectives', [
            'subject_id' => $subject->id,
            'grade_level' => 'XI',
            'code' => 'TP-1.2',
            'description' => 'Duplikat.',
        ])->assertSessionHasErrors('code');

        $this->assertSame(1, LearningObjective::count());
    }

    public function test_teacher_cannot_create_objective_for_foreign_subject(): void
    {
        [$teacher] = $this->teacherWithSubject();
        $foreign = Subject::factory()->create(['code' => 'RPL']);

        $this->actingAs($teacher)->post('/teacher/objectives', [
            'subject_id' => $foreign->id,
            'grade_level' => 'X',
            'code' => 'TP-9.1',
            'description' => 'Membuat aplikasi web.',
        ])->assertForbidden();

        $this->assertSame(0, LearningObjective::count());
    }

    public function test_teacher_cannot_delete_foreign_objective(): void
    {
        [$teacher] = $this->teacherWithSubject();
        $foreign = Subject::factory()->create(['code' => 'RPL']);
        $objective = LearningObjective::create([
            'subject_id' => $foreign->id,
            'grade_level' => 'X',
            'code' => 'TP-9.1',
            'description' => 'Membuat aplikasi web.',
        ]);

        $this->actingAs($teacher)
            ->delete("/teacher/objectives/{$objective->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('learning_objectives', ['id' => $objective->id]);
    }

    public function test_objective_used_by_module_cannot_be_deleted(): void
    {
        [$teacher, $subject] = $this->teacherWithSubject();
        $objective = LearningObjective::create([
            'subject_id' => $subject->id,
            'grade_level' => 'XI',
            'code' => 'TP-1.1',
            'description' => 'Menjelaskan prinsip kelistrikan.',
        ]);

        LearningModule::factory()->create([
            'learning_objective_id' => $objective->id,
        ]);

        $this->actingAs($teacher)
            ->delete("/teacher/objectives/{$objective->id}")
            ->assertSessionHas('error');

        $this->assertDatabaseHas('learning_objectives', ['id' => $objective->id]);
    }

    public function test_admin_sees_all_subjects_in_teacher_bank(): void
    {
        $this->teacherWithSubject();
        Subject::factory()->create(['code' => 'RPL']);
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN, 'is_active' => true]);

        $this->actingAs($admin)
            ->get('/teacher/objectives')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('subjects', 2));
    }

    public function test_admin_objectives_route_is_gone(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN, 'is_active' => true]);

        $this->actingAs($admin)->get('/admin/objectives')->assertNotFound();
    }
}
