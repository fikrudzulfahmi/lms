<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    /**
     * Gates a route to one or more of the LMS roles.
     * Usage: ->middleware(\App\Http\Middleware\EnsureRole::class.'admin')
     * or registered alias: ->middleware('role:admin')
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        abort_unless($user !== null && $user->is_active, 403, 'Akun tidak aktif.');

        abort_unless(
            $user && $user->role !== null && in_array($user->role, $roles, true),
            403,
            'Anda tidak memiliki peran yang diperlukan.',
        );

        return $next($request);
    }
}
