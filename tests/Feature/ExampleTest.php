<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_root_redirects_to_login(): void
    {
        $this->get('/')->assertRedirect('/login');
    }

    public function test_root_sends_each_role_to_its_home(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $teacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
        $student = User::factory()->create(['role' => User::ROLE_STUDENT]);

        $this->actingAs($admin)->get('/')->assertRedirect('/admin');
        $this->actingAs($teacher)->get('/')->assertRedirect('/teacher/modules');
        $this->actingAs($student)->get('/')->assertRedirect('/student');
    }
}
