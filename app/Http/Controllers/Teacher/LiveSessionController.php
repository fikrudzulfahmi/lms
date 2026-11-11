<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Models\LearningModule;
use App\Models\LiveSession;
use App\Models\ModuleBlock;
use App\Services\GradeCalculationService;
use App\Services\LiveSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class LiveSessionController extends Controller
{
    public function __construct(
        private readonly LiveSessionService $sessions,
        private readonly GradeCalculationService $grades,
    ) {}

    /**
     * Mulai sesi live untuk modul milik guru.
     */
    public function start(Request $request, LearningModule $module): RedirectResponse
    {
        Gate::authorize('update', $module);

        $session = $this->sessions->start($module);

        return redirect()
            ->route('teacher.live.show', $session)
            ->with('success', 'Sesi live dimulai. PIN '.$session->pin_code.' siap dibagikan.');
    }

    /**
     * Panggung proyektor guru.
     */
    public function show(Request $request, LiveSession $session): Response
    {
        $session->load(['module.teachingAssignment.subject:id,name,code', 'module.teachingAssignment.classroom:id,name']);

        Gate::authorize('view', $session->module);

        $blocks = $session->module->blocks()
            ->orderBy('order_index')
            ->orderBy('created_at')
            ->get()
            ->map(fn (ModuleBlock $block) => $this->sessions->serializeBlock($block, false))
            ->values();

        return Inertia::render('Teacher/Live/Stage', [
            'session' => [
                'id' => $session->id,
                'pin_code' => $session->pin_code,
                'status' => $session->status,
                'current_block_id' => $session->current_block_id,
            ],
            'module' => [
                'id' => $session->module->id,
                'title' => $session->module->title,
                'subject' => $session->module->teachingAssignment?->subject?->name,
                'subject_code' => $session->module->teachingAssignment?->subject?->code,
                'classroom' => $session->module->teachingAssignment?->classroom?->name,
            ],
            'blocks' => $blocks,
            'ws_url' => config('live.public_ws_url'),
            'control_token' => $this->sessions->controlToken($session),
            'urls' => [
                'update' => route('teacher.live.update', $session),
                'end' => route('teacher.live.end', $session),
                'index' => route('teacher.modules.index'),
                'edit' => route('teacher.modules.edit', $session->module),
            ],
        ]);
    }

    /**
     * Simpan state slide (dipanggil panggung guru sebelum broadcast WS).
     */
    public function update(Request $request, LiveSession $session): JsonResponse
    {
        Gate::authorize('view', $session->module);

        $data = $request->validate([
            'current_block_id' => ['nullable', 'uuid'],
            'status' => ['nullable', Rule::in([LiveSession::STATUS_WAITING, LiveSession::STATUS_ACTIVE])],
        ]);

        if (array_key_exists('current_block_id', $data) && $data['current_block_id'] !== null) {
            $belongs = ModuleBlock::query()
                ->whereKey($data['current_block_id'])
                ->where('module_id', $session->module_id)
                ->exists();

            if (! $belongs) {
                throw ValidationException::withMessages([
                    'current_block_id' => 'Blok tidak berasal dari modul sesi ini.',
                ]);
            }
        }

        if (($data['status'] ?? null) === LiveSession::STATUS_ACTIVE && $session->status === LiveSession::STATUS_ENDED) {
            throw ValidationException::withMessages([
                'status' => 'Sesi yang sudah berakhir tidak bisa diaktifkan lagi.',
            ]);
        }

        if (array_key_exists('current_block_id', $data)) {
            $session->current_block_id = $data['current_block_id'];
        }
        if (! empty($data['status'])) {
            $session->status = $data['status'];
        }
        $session->save();

        return response()->json([
            'ok' => true,
            'saved_at' => now()->toIso8601String(),
            'session' => [
                'id' => $session->id,
                'status' => $session->status,
                'current_block_id' => $session->current_block_id,
            ],
        ]);
    }

    public function end(Request $request, LiveSession $session): JsonResponse|RedirectResponse
    {
        Gate::authorize('view', $session->module);

        $session->update(['status' => LiveSession::STATUS_ENDED]);

        // Kunci hasil: hitung ulang rekap nilai modul dari seluruh jawaban siswa.
        $graded = $this->grades->recalculateModule($session->module);

        if ($request->expectsJson()) {
            return response()->json([
                'ok' => true,
                'ended_at' => now()->toIso8601String(),
                'graded' => $graded,
                'session' => ['id' => $session->id, 'status' => $session->status],
            ]);
        }

        return redirect()
            ->route('teacher.modules.edit', $session->module)
            ->with('success', "Sesi live diakhiri. {$graded} rekap nilai siswa diperbarui.");
    }
}
