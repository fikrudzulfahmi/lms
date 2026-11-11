<?php

namespace App\Http\Middleware;

use App\Models\AcademicYear;
use Illuminate\Http\Request;
use Inertia\Middleware as InertiaMiddleware;

class HandleInertiaRequests extends InertiaMiddleware
{
    /**
     * The root Blade template.
     */
    protected $rootView = 'app';

    /**
     * Props shared with every Inertia response.
     *
     * Keep every value already resolved here: Inertia only resolves closures
     * declared as direct prop values, so nested closures would leak through.
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        // Halaman tamu (login) tidak menampilkan tahun aktif, jadi lewati
        // query ini untuk guest agar rantai redirect login tetap ringan.
        $year = $request->user() === null ? null : AcademicYear::active();

        return [
            'appName' => config('app.name'),
            'auth' => [
                'user' => $request->user()?->only(['id', 'name', 'username', 'email', 'role']),
            ],
            'active_year' => $year === null ? null : [
                'id' => $year->id,
                'name' => $year->name,
                'semester' => $year->semester,
                'label' => $year->name.' '.$year->semester,
            ],
            'flash' => [
                'success' => $request->session()->get('success'),
                'error' => $request->session()->get('error'),
            ],
        ];
    }
}
