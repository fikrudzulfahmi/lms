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
            return back()
                ->withErrors(['username' => 'Username atau password salah.'])
                ->onlyInput('username');
        }

        if (! $user->is_active) {
            return back()
                ->withErrors(['username' => 'Akun tidak aktif. Hubungi admin.'])
                ->onlyInput('username');
        }

        Auth::login($user);
        $request->session()->regenerate();

        return redirect($this->intendedFor($user, $request) ?? $this->homeFor($user));
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

    /**
     * Tujuan setelah login dari url.intended, hanya bila aman dan sesuai role.
     *
     * intended mentah bisa berisi halaman role lain (berujung 403), halaman
     * login sendiri, atau URL basi dari rantai redirect sebelumnya — semua
     * itu pernah membuat navigasi Inertia setelah login tidak tuntas dan
     * halaman tampak baru masuk setelah refresh manual. Selain prefix role
     * di bawah ini, fallback-nya selalu home sesuai role.
     */
    private function intendedFor(User $user, Request $request): ?string
    {
        $intended = $request->session()->pull('url.intended');

        if (! is_string($intended) || $intended === '') {
            return null;
        }

        $path = (string) parse_url($intended, PHP_URL_PATH);

        $prefixes = match ($user->role) {
            User::ROLE_ADMIN => ['/admin', '/teacher'],
            User::ROLE_TEACHER => ['/teacher'],
            User::ROLE_STUDENT => ['/student', '/live'],
            default => [],
        };

        foreach ($prefixes as $prefix) {
            if ($path === $prefix || str_starts_with($path, $prefix.'/')) {
                return $intended;
            }
        }

        return null;
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
