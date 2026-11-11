<?php

use App\Http\Controllers\AuthController;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustProxies(at: '*');

        $middleware->web(append: [
            HandleInertiaRequests::class,
        ]);

        // ws-hub memanggil endpoint internal tanpa sesi/CSRF.
        $middleware->validateCsrfTokens(except: [
            'internal/live-sessions/validate',
        ]);

        // Arahkan tamu dan user yang sudah login secara deterministik.
        // Tanpa ini, refresh di /login saat sesi sudah aktif bergantung pada
        // default framework yang menunjuk ke path yang tidak ada di aplikasi.
        $middleware->redirectGuestsTo(fn () => route('login'));
        $middleware->redirectUsersTo(
            fn (Request $request) => app(AuthController::class)->homeFor($request->user())
        );

        $middleware->alias([
            'role' => EnsureRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
