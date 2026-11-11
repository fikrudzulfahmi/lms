<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;

class AuthController
{
    public function showLogin(): Response
    {
        return Inertia::render('Auth/Login');
    }

    public function login(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('username', $data['username'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            return back()->withInput()->with('error', 'Username atau password salah.');
        }

        if (! $user->is_active) {
            return back()->with('error', 'Akun tidak aktif. Hubungi admin.');
        }

        Auth::login($user);
        $request->session()->regenerate();

        return redirect()->intended($this->homeFor($user));
    }

    /**
     * Dev shortcut: log in as first user of a role (default admin).
     */
    public function devLogin(Request $request): RedirectResponse
    {
        abort_unless(app()->environment(['local', 'staging']), 404);

        $expected = (string) config('app.dev_login_token', '');
        $given = $request->string('token')->toString();

        if ($expected === '' || ! hash_equals($expected, $given)) {
            abort(404);
        }

        $role = $request->string('as')->trim()->toString();
        $role = in_array($role, [User::ROLE_ADMIN, User::ROLE_TEACHER, User::ROLE_STUDENT], true) ? $role : User::ROLE_ADMIN;

        $user = User::where('role', $role)->where('is_active', true)->first();

        if ($user === null) {
            return redirect('/login')->with('error', 'Belum ada akun '.$role.'.');
        }

        Auth::login($user);
        $request->session()->regenerate();

        return redirect($this->homeFor($user));
    }

    public function homeFor(User $user): string
    {
        return match ($user->role) {
            User::ROLE_TEACHER => route('teacher.modules.index'),
            User::ROLE_ADMIN => route('admin.dashboard'),
            User::ROLE_STUDENT => route('student.home'),
            default => '/',
        };
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/login');
    }
}
