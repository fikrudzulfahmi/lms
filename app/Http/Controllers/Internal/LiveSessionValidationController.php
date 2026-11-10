<?php

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use App\Models\LiveSession;
use App\Services\LiveSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Endpoint internal untuk ws-hub. Tidak memakai sesi login; autentikasi
 * memakai header X-Internal-Secret yang dibandingkan konstan-waktu.
 * Dikecualikan dari CSRF di bootstrap/app.php dan tidak pernah dipanggil browser.
 */
class LiveSessionValidationController extends Controller
{
    public function __construct(private readonly LiveSessionService $sessions) {}

    public function validateSession(Request $request): JsonResponse
    {
        $expected = (string) config('live.internal_secret');
        $provided = (string) $request->header('X-Internal-Secret', '');

        if ($expected === '' || ! hash_equals($expected, $provided)) {
            return response()->json(['ok' => false, 'message' => 'Unauthorized.'], 401);
        }

        $data = $request->validate([
            'pin' => ['required', 'digits:6'],
            'role' => ['required', 'in:teacher,student'],
            'control_token' => ['nullable', 'string', 'max:255'],
        ]);

        $session = LiveSession::query()
            ->with('module')
            ->where('pin_code', $data['pin'])
            ->latest('created_at')
            ->first();

        if ($session === null) {
            return response()->json(['ok' => false, 'message' => 'PIN tidak ditemukan.'], 404);
        }

        if ($session->status === LiveSession::STATUS_ENDED) {
            return response()->json(['ok' => false, 'message' => 'Sesi sudah berakhir.'], 410);
        }

        if ($data['role'] === 'teacher' && ! $this->sessions->verifyControlToken($session, $data['control_token'] ?? null)) {
            return response()->json(['ok' => false, 'message' => 'Token guru tidak valid.'], 403);
        }

        return response()->json([
            'ok' => true,
            'session' => $this->sessions->snapshot($session, $data['role']),
        ]);
    }
}
