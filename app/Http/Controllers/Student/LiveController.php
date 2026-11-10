<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use App\Models\LiveSession;
use App\Models\ModuleBlock;
use App\Models\StudentResponse;
use App\Services\LiveSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class LiveController extends Controller
{
    public function __construct(private readonly LiveSessionService $sessions) {}

    public function joinForm(): Response
    {
        return Inertia::render('Student/Live/Join', [
            'ws_url' => config('live.public_ws_url'),
        ]);
    }

    /**
     * Masuk ke room live lewat PIN. Sesi ended tidak bisa dimasuki.
     */
    public function room(Request $request, string $pin): Response|RedirectResponse
    {
        $pin = trim($pin);

        if (! preg_match('/^\d{6}$/', $pin)) {
            return redirect()
                ->route('student.live.join')
                ->with('error', 'PIN harus 6 digit angka.');
        }

        $session = LiveSession::query()
            ->with('module')
            ->where('pin_code', $pin)
            ->whereIn('status', [LiveSession::STATUS_WAITING, LiveSession::STATUS_ACTIVE])
            ->latest('created_at')
            ->first();

        if ($session === null) {
            return redirect()
                ->route('student.live.join')
                ->with('error', 'PIN tidak ditemukan atau sesi sudah berakhir.');
        }

        $blocks = $session->module->blocks()
            ->orderBy('order_index')
            ->orderBy('created_at')
            ->get()
            ->map(fn (ModuleBlock $block) => $this->sessions->serializeBlock($block, true))
            ->values();

        $myResponses = StudentResponse::query()
            ->where('student_id', $request->user()->id)
            ->whereIn('module_block_id', $blocks->pluck('id'))
            ->get()
            ->mapWithKeys(fn (StudentResponse $response) => [
                $response->module_block_id => [
                    'answer' => $response->answer_payload,
                    'earned_points' => (float) $response->earned_points,
                    'is_graded' => (bool) $response->is_graded,
                ],
            ]);

        return Inertia::render('Student/Live/Room', [
            'session' => [
                'id' => $session->id,
                'pin_code' => $session->pin_code,
                'status' => $session->status,
                'current_block_id' => $session->current_block_id,
            ],
            'module' => [
                'id' => $session->module->id,
                'title' => $session->module->title,
            ],
            'blocks' => $blocks,
            'my_responses' => $myResponses,
            'student_name' => $request->user()->name,
            'ws_url' => config('live.public_ws_url'),
            'urls' => [
                'respond' => route('student.live.respond', ['pin' => $session->pin_code]),
                'join' => route('student.live.join'),
                'logout' => route('logout'),
            ],
        ]);
    }

    /**
     * Simpan jawaban siswa untuk blok aktif.
     */
    public function respond(Request $request, string $pin): JsonResponse
    {
        $session = LiveSession::query()
            ->where('pin_code', $pin)
            ->where('status', LiveSession::STATUS_ACTIVE)
            ->latest('created_at')
            ->first();

        if ($session === null) {
            throw ValidationException::withMessages([
                'pin' => 'Sesi tidak aktif. Tunggu guru membuka sesi.',
            ]);
        }

        $data = $request->validate([
            'block_id' => ['required', 'uuid'],
            'answer' => ['required', 'array'],
        ]);

        $block = ModuleBlock::query()
            ->whereKey($data['block_id'])
            ->where('module_id', $session->module_id)
            ->first();

        if ($block === null) {
            throw ValidationException::withMessages([
                'block_id' => 'Blok tidak berasal dari modul sesi ini.',
            ]);
        }

        if (strlen((string) json_encode($data['answer'])) > (int) config('live.max_answer_bytes', 16384)) {
            throw ValidationException::withMessages([
                'answer' => 'Jawaban terlalu besar.',
            ]);
        }

        $grade = $this->sessions->gradeAnswer($block, $data['answer']);

        $response = StudentResponse::query()->updateOrCreate(
            [
                'module_block_id' => $block->id,
                'student_id' => $request->user()->id,
            ],
            [
                'answer_payload' => $data['answer'],
                'earned_points' => $grade['earned_points'],
                'is_graded' => $grade['is_graded'],
            ],
        );

        return response()->json([
            'ok' => true,
            'response_id' => $response->id,
            'saved_at' => now()->toIso8601String(),
            'earned_points' => (float) $response->earned_points,
            'is_graded' => (bool) $response->is_graded,
            'correct' => $grade['correct'],
        ]);
    }
}
