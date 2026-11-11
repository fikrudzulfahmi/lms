<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AdminTeachersTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => User::ROLE_ADMIN, 'is_active' => true]);
    }

    private function teacher(array $attrs = []): User
    {
        return User::factory()->create(array_merge([
            'role' => User::ROLE_TEACHER,
            'is_active' => true,
        ], $attrs));
    }

    public function test_admin_can_open_teacher_management_page(): void
    {
        $this->teacher(['name' => 'Bu Sari']);
        $this->teacher(['name' => 'Pak Budi', 'is_active' => false]);

        $response = $this->actingAs($this->admin())->get('/admin/teachers');

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Admin/Teachers')
            ->has('teachers', 2)
            ->where('teachers.0.name', 'Bu Sari')
            ->where('teachers.1.name', 'Pak Budi')
            ->where('teachers.0.assignments_count', 0)
            ->where('teachers.0.modules_count', 0)
        );
    }

    public function test_admin_can_create_teacher_and_teacher_can_login(): void
    {
        $response = $this->actingAs($this->admin())->post('/admin/teachers', [
            'name' => 'Guru Baru',
            'username' => '199001012015011001',
            'email' => 'baru@smk.sch.id',
            'password' => 'guru12345',
        ]);

        $response->assertRedirect();
        $response->assertSessionHas('success');

        $teacher = User::where('username', '199001012015011001')->first();
        $this->assertNotNull($teacher);
        $this->assertSame(User::ROLE_TEACHER, $teacher->role);
        $this->assertTrue($teacher->is_active);
        $this->assertTrue(Hash::check('guru12345', $teacher->password));

        $this->post('/logout');

        $login = $this->post('/login', [
            'username' => '199001012015011001',
            'password' => 'guru12345',
        ]);
        $login->assertRedirect(route('teacher.modules.index'));
        $this->assertAuthenticatedAs($teacher);
    }

    public function test_create_teacher_rejects_duplicate_username_and_short_password(): void
    {
        $existing = $this->teacher();

        $response = $this->actingAs($this->admin())->from('/admin/teachers')->post('/admin/teachers', [
            'name' => 'Peniru',
            'username' => $existing->username,
            'email' => null,
            'password' => 'pendek',
        ]);

        $response->assertRedirect('/admin/teachers');
        $response->assertSessionHasErrors(['username', 'password']);
        $this->assertSame(1, User::where('role', User::ROLE_TEACHER)->count());
    }

    public function test_admin_can_update_teacher_without_touching_password(): void
    {
        $teacher = $this->teacher(['name' => 'Nama Lama']);
        $oldHash = $teacher->password;

        $response = $this->actingAs($this->admin())->put("/admin/teachers/{$teacher->id}", [
            'name' => 'Nama Baru',
            'username' => $teacher->username,
            'email' => 'baru@smk.sch.id',
        ]);

        $response->assertSessionHas('success');
        $teacher->refresh();
        $this->assertSame('Nama Baru', $teacher->name);
        $this->assertSame('baru@smk.sch.id', $teacher->email);
        $this->assertSame($oldHash, $teacher->password);
    }

    public function test_admin_can_reset_teacher_password(): void
    {
        $teacher = $this->teacher();

        $response = $this->actingAs($this->admin())->post("/admin/teachers/{$teacher->id}/reset-password", [
            'password' => 'password-baru-123',
        ]);

        $response->assertSessionHas('success');
        $this->assertTrue(Hash::check('password-baru-123', $teacher->refresh()->password));
    }

    public function test_deactivated_teacher_cannot_login(): void
    {
        $teacher = $this->teacher([
            'username' => 'guru-nonaktif',
            'password' => Hash::make('guru12345'),
        ]);

        $this->actingAs($this->admin())->post("/admin/teachers/{$teacher->id}/toggle-active")
            ->assertSessionHas('success');
        $this->assertFalse($teacher->refresh()->is_active);

        $this->post('/logout');

        $login = $this->from('/login')->post('/login', [
            'username' => 'guru-nonaktif',
            'password' => 'guru12345',
        ]);
        $login->assertSessionHasErrors('username');
        $this->assertGuest();
    }

    public function test_admin_can_delete_teacher_without_assignments(): void
    {
        $teacher = $this->teacher();

        $response = $this->actingAs($this->admin())->delete("/admin/teachers/{$teacher->id}");

        $response->assertSessionHas('success');
        $this->assertDatabaseMissing('users', ['id' => $teacher->id]);
    }

    public function test_delete_teacher_with_assignment_is_blocked(): void
    {
        $teacher = $this->teacher();
        $year = AcademicYear::factory()->create(['is_active' => true]);
        $classroom = Classroom::factory()->create();
        $subject = Subject::factory()->create();

        TeachingAssignment::create([
            'academic_year_id' => $year->id,
            'teacher_id' => $teacher->id,
            'subject_id' => $subject->id,
            'classroom_id' => $classroom->id,
        ]);

        $response = $this->actingAs($this->admin())->from('/admin/teachers')->delete("/admin/teachers/{$teacher->id}");

        $response->assertSessionHas('error');
        $this->assertDatabaseHas('users', ['id' => $teacher->id]);
    }

    public function test_teacher_endpoints_only_manage_teacher_role(): void
    {
        $admin = $this->admin();
        $student = User::factory()->create(['role' => User::ROLE_STUDENT]);

        $this->actingAs($admin)->put("/admin/teachers/{$student->id}", [
            'name' => 'Bukan Guru',
            'username' => $student->username,
            'email' => null,
        ])->assertNotFound();

        $this->actingAs($admin)->delete("/admin/teachers/{$student->id}")->assertNotFound();
        $this->assertDatabaseHas('users', ['id' => $student->id]);
    }

    public function test_non_admin_cannot_access_teacher_management(): void
    {
        $teacher = $this->teacher();

        $this->actingAs($teacher)->get('/admin/teachers')->assertForbidden();
        $this->actingAs($teacher)->post('/admin/teachers', [
            'name' => 'X',
            'username' => 'x-user',
            'password' => 'guru12345',
        ])->assertForbidden();

        $this->post('/logout');
        $this->get('/admin/teachers')->assertRedirect(route('login'));
    }
}
