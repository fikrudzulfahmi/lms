<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\ClassroomStudent;
use App\Models\Department;
use App\Models\LearningObjective;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AdminPanelTest extends TestCase
{
    use RefreshDatabase;

    protected function admin(): User
    {
        return User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'is_active' => true,
        ]);
    }

    protected function activeYear(): AcademicYear
    {
        return AcademicYear::factory()->create([
            'name' => '2026/2027',
            'semester' => 'ganjil',
            'is_active' => true,
        ]);
    }

    public function test_guest_is_redirected_from_admin(): void
    {
        $this->get('/admin')->assertRedirect('/login');
    }

    public function test_teacher_cannot_access_admin(): void
    {
        $teacher = User::factory()->create(['role' => User::ROLE_TEACHER]);

        $this->actingAs($teacher)->get('/admin')->assertForbidden();
    }

    public function test_dashboard_renders_stats_and_respects_filters(): void
    {
        $year = $this->activeYear();
        $department = Department::factory()->create(['code' => 'TSM', 'name' => 'Teknik Sepeda Motor']);
        $other = Department::factory()->create(['code' => 'TKJ', 'name' => 'Teknik Komputer']);
        $classroom = Classroom::factory()->create([
            'department_id' => $department->id,
            'grade_level' => 'XI',
            'name' => 'XI TSM 1',
        ]);
        Classroom::factory()->create([
            'department_id' => $other->id,
            'grade_level' => 'X',
            'name' => 'X TKJ 1',
        ]);

        $student = User::factory()->create(['role' => User::ROLE_STUDENT]);
        ClassroomStudent::create([
            'academic_year_id' => $year->id,
            'classroom_id' => $classroom->id,
            'student_id' => $student->id,
        ]);

        $this->actingAs($this->admin())
            ->get('/admin?department_id='.$department->id)
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Dashboard')
                ->where('stats.classrooms', 1)
                ->where('stats.students', 1)
                ->where('filters.department_id', $department->id)
                ->has('options.departments', 2)
                ->has('by_department'));
    }

    public function test_academic_year_can_be_created_and_activated(): void
    {
        $admin = $this->admin();
        $first = $this->activeYear();

        $this->actingAs($admin)
            ->post('/admin/academic-years', ['name' => '2027/2028', 'semester' => 'genap'])
            ->assertRedirect();

        $second = AcademicYear::where('name', '2027/2028')->firstOrFail();

        $this->actingAs($admin)
            ->post("/admin/academic-years/{$second->id}/activate")
            ->assertRedirect();

        $this->assertTrue($second->fresh()->is_active);
        $this->assertFalse($first->fresh()->is_active);
    }

    public function test_academic_year_name_must_use_valid_format(): void
    {
        $this->actingAs($this->admin())
            ->post('/admin/academic-years', ['name' => 'dua ribu', 'semester' => 'ganjil'])
            ->assertSessionHasErrors('name');
    }

    public function test_department_crud_works(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)
            ->post('/admin/departments', ['code' => 'tkj', 'name' => 'Teknik Komputer dan Jaringan'])
            ->assertRedirect();

        $department = Department::where('code', 'TKJ')->firstOrFail();
        $this->assertSame('Teknik Komputer dan Jaringan', $department->name);

        $this->actingAs($admin)
            ->put("/admin/departments/{$department->id}", ['code' => 'TKJ', 'name' => 'TKJ Revisi'])
            ->assertRedirect();

        $this->assertSame('TKJ Revisi', $department->fresh()->name);

        $this->actingAs($admin)
            ->delete("/admin/departments/{$department->id}")
            ->assertRedirect();

        $this->assertDatabaseMissing('departments', ['id' => $department->id]);
    }

    public function test_department_with_classrooms_cannot_be_deleted(): void
    {
        $department = Department::factory()->create();
        Classroom::factory()->create(['department_id' => $department->id]);

        $this->actingAs($this->admin())
            ->delete("/admin/departments/{$department->id}")
            ->assertRedirect()
            ->assertSessionHas('error');

        $this->assertDatabaseHas('departments', ['id' => $department->id]);
    }

    public function test_classroom_crud_works(): void
    {
        $admin = $this->admin();
        $department = Department::factory()->create(['code' => 'TSM']);

        $this->actingAs($admin)->post('/admin/classrooms', [
            'department_id' => $department->id,
            'grade_level' => 'XI',
            'name' => 'XI TSM 1',
        ])->assertRedirect();

        $classroom = Classroom::where('name', 'XI TSM 1')->firstOrFail();

        $this->actingAs($admin)->put("/admin/classrooms/{$classroom->id}", [
            'department_id' => $department->id,
            'grade_level' => 'XII',
            'name' => 'XII TSM 1',
        ])->assertRedirect();

        $this->assertSame('XII TSM 1', $classroom->fresh()->name);

        $this->actingAs($admin)
            ->delete("/admin/classrooms/{$classroom->id}")
            ->assertRedirect();

        $this->assertDatabaseMissing('classrooms', ['id' => $classroom->id]);
    }

    public function test_classroom_name_is_unique_per_department(): void
    {
        $department = Department::factory()->create();
        Classroom::factory()->create(['department_id' => $department->id, 'name' => 'XI TSM 1']);

        $this->actingAs($this->admin())->post('/admin/classrooms', [
            'department_id' => $department->id,
            'grade_level' => 'XI',
            'name' => 'XI TSM 1',
        ])->assertSessionHasErrors('name');
    }

    public function test_csv_import_creates_students_and_places_them(): void
    {
        $this->activeYear();
        $classroom = Classroom::factory()->create(['grade_level' => 'XI']);

        $csv = "name,username,email,nisn\n"
            ."Siti Aminah,SISWA9001,siti@student.sch.id,9001\n"
            ."Budi Dua,,budi2@student.sch.id,9002\n";

        $file = UploadedFile::fake()->createWithContent('siswa.csv', $csv);

        $this->actingAs($this->admin())
            ->post('/admin/classrooms/import-students', [
                'csv' => $file,
                'classroom_id' => $classroom->id,
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertDatabaseHas('users', ['username' => 'SISWA9001', 'role' => User::ROLE_STUDENT]);

        $imported = User::where('nisn', '9001')->firstOrFail();
        $generated = User::where('nisn', '9002')->firstOrFail();

        $this->assertNotSame('', $generated->username);
        $this->assertDatabaseHas('classroom_student', [
            'classroom_id' => $classroom->id,
            'student_id' => $imported->id,
        ]);
        $this->assertDatabaseHas('classroom_student', [
            'classroom_id' => $classroom->id,
            'student_id' => $generated->id,
        ]);
    }

    public function test_ploting_upsert_and_delete(): void
    {
        $year = $this->activeYear();
        $teacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
        $subject = Subject::factory()->create();
        $classroom = Classroom::factory()->create();

        $payload = [
            'academic_year_id' => $year->id,
            'teacher_id' => $teacher->id,
            'subject_id' => $subject->id,
            'classroom_ids' => [$classroom->id],
        ];

        $this->actingAs($this->admin())->post('/admin/ploting', $payload)->assertRedirect();
        $this->actingAs($this->admin())->post('/admin/ploting', $payload)->assertRedirect();

        $this->assertSame(1, TeachingAssignment::count());

        $assignment = TeachingAssignment::firstOrFail();

        $this->actingAs($this->admin())
            ->delete("/admin/ploting/{$assignment->id}")
            ->assertRedirect();

        $this->assertSame(0, TeachingAssignment::count());
    }

    public function test_objective_bank_rejects_duplicate_code_per_subject_and_grade(): void
    {
        $admin = $this->admin();
        $subject = Subject::factory()->create();

        $payload = [
            'subject_id' => $subject->id,
            'grade_level' => 'XI',
            'code' => 'TP-1.2',
            'description' => 'Mendiagnosis gangguan sensor.',
        ];

        $this->actingAs($admin)->post('/admin/objectives', $payload)->assertRedirect();
        $this->actingAs($admin)->post('/admin/objectives', $payload)->assertSessionHasErrors('code');

        $this->assertSame(1, LearningObjective::count());

        $objective = LearningObjective::firstOrFail();

        $this->actingAs($admin)->put("/admin/objectives/{$objective->id}", [
            'subject_id' => $subject->id,
            'grade_level' => 'XII',
            'code' => 'TP-1.2',
            'description' => 'Diperbarui.',
        ])->assertRedirect();

        $this->assertSame('XII', $objective->fresh()->grade_level);
    }
}
