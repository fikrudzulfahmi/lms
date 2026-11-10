<?php

namespace App\Providers;

use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use Inertia\Inertia;

class InertiaServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Inertia::setRootView('app');

        // Cache-buster for compiled assets. Returns null before the first
        // `vite build`, which Inertia treats as "no version".
        Inertia::version(fn () => Vite::manifestHash());
    }
}
