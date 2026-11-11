<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthLoginTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $role, bool $active = true): User
    {
        return User::factory()->create([
            'username' => 'user-'.$role,
            'password' => Hash::make('secret-password'),
            'role' => $role,
            'is_active' => $active,
        ]);
    }

    public function test_admin_login_redirects_to_admin_dashboard(): void
    {
        $admin = $this->makeUser(User::ROLE_ADMIN);

        $response = $this->post('/login', [
            'username' => 'user-'.User::ROLE_ADMIN,
            'password' => 'secret-password',
        ]);

        $response->assertRedirect(route('admin.dashboard'));
        $this->assertAuthenticatedAs($admin);
    }

    public function test_teacher_login_redirects_to_module_index(): void
    {
        $teacher = $this->makeUser(User::ROLE_TEACHER);

        $response = $this->post('/login', [
            'username' => 'user-'.User::ROLE_TEACHER,
            'password' => 'secret-password',
        ]);

        $response->assertRedirect(route('teacher.modules.index'));
        $this->assertAuthenticatedAs($teacher);
    }

    public function test_student_login_redirects_to_student_home(): void
    {
        $student = $this->makeUser(User::ROLE_STUDENT);

        $response = $this->post('/login', [
            'username' => 'user-'.User::ROLE_STUDENT,
            'password' => 'secret-password',
        ]);

        $response->assertRedirect(route('student.home'));
        $this->assertAuthenticatedAs($student);
    }

    public function test_student_login_honours_intended_live_room(): void
    {
        $student = $this->makeUser(User::ROLE_STUDENT);

        // Siswa membuka link live sebagai tamu: middleware menyimpan intended.
        $this->get('/live/ABC123')->assertRedirect(route('login'));

        $response = $this->post('/login', [
            'username' => 'user-'.User::ROLE_STUDENT,
            'password' => 'secret-password',
        ]);

        $response->assertRedirect('/live/ABC123');
        $this->assertAuthenticatedAs($student);
    }

    public function test_login_ignores_intended_from_another_role(): void
    {
        $this->makeUser(User::ROLE_TEACHER);

        // Intended menunjuk area admin; guru tidak boleh diarahkan ke sana.
        $this->withSession(['url.intended' => url('/admin')]);

        $response = $this->post('/login', [
            'username' => 'user-'.User::ROLE_TEACHER,
            'password' => 'secret-password',
        ]);

        $response->assertRedirect(route('teacher.modules.index'));
    }

    public function test_wrong_password_returns_error_and_stays_guest(): void
    {
        $this->makeUser(User::ROLE_ADMIN);

        $response = $this->from('/login')->post('/login', [
            'username' => 'user-'.User::ROLE_ADMIN,
            'password' => 'wrong-password',
        ]);

        $response->assertRedirect('/login');
        $response->assertSessionHasErrors('username');
        $response->assertSessionMissing('password');
        $this->assertGuest();
    }

    public function test_inactive_account_cannot_login(): void
    {
        $this->makeUser(User::ROLE_STUDENT, active: false);

        $response = $this->from('/login')->post('/login', [
            'username' => 'user-'.User::ROLE_STUDENT,
            'password' => 'secret-password',
        ]);

        $response->assertSessionHasErrors('username');
        $this->assertGuest();
    }

    public function test_authenticated_user_visiting_login_is_sent_to_role_home(): void
    {
        $teacher = $this->makeUser(User::ROLE_TEACHER);

        $response = $this->actingAs($teacher)->get('/login');

        $response->assertRedirect(route('teacher.modules.index'));
    }

    public function test_login_is_throttled_after_repeated_failures(): void
    {
        $this->makeUser(User::ROLE_ADMIN);

        for ($i = 0; $i < 5; $i++) {
            $this->from('/login')->post('/login', [
                'username' => 'user-'.User::ROLE_ADMIN,
                'password' => 'wrong-password',
            ]);
        }

        $response = $this->from('/login')->post('/login', [
            'username' => 'user-'.User::ROLE_ADMIN,
            'password' => 'secret-password',
        ]);

        $response->assertStatus(429);
        $this->assertGuest();
    }
}
