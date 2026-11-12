<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Models\QuestionBankItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Bank Soal guru: simpan blok soal dari Studio untuk dipakai ulang di
 * modul lain, kelola di halaman Bank Soal, dan ambil kembali ke modul.
 */
class QuestionBankController extends Controller
{
    private const BLOCK_LABELS = [
        'soal_mcq' => 'Pilihan Ganda',
        'soal_truefalse' => 'Benar / Salah',
        'soal_fillblank' => 'Isian Singkat',
        'soal_sequencing' => 'Urutan Prosedur',
        'soal_matching' => 'Mencocokkan',
        'soal_essay_ai' => 'Studi Kasus Esai',
        'soal_hotspot' => 'Labeli Gambar / Hotspot',
        'polling' => 'Polling Kilat',
        'materi_video_interaktif' => 'Video Interaktif',
    ];

    public function index(Request $request): Response|JsonResponse
    {
        $items = QuestionBankItem::query()
            ->where('teacher_id', $request->user()->id)
            ->latest()
            ->get()
            ->map(fn (QuestionBankItem $item) => $this->serialize($item))
            ->values();

        if ($request->expectsJson()) {
            return response()->json(['items' => $items]);
        }

        return Inertia::render('Teacher/Bank/Index', [
            'items' => $items,
        ]);
    }

    /**
     * Simpan salinan sebuah blok modul ke bank soal guru.
     */
    public function store(Request $request): JsonResponse|RedirectResponse
    {
        $data = $request->validate([
            'block_id' => ['required', 'string'],
            'topic' => ['nullable', 'string', 'max:180'],
        ]);

        $block = ModuleBlock::query()->with('module')->find($data['block_id']);

        if ($block === null || $block->module === null) {
            throw ValidationException::withMessages([
                'block_id' => 'Blok tidak ditemukan.',
            ]);
        }

        Gate::authorize('update', $block->module);

        $item = QuestionBankItem::create([
            'teacher_id' => $request->user()->id,
            'block_type' => $block->block_type,
            'points' => $block->points,
            'content' => $block->content,
            'ai_rubric' => $block->ai_rubric,
            'topic' => $data['topic'] ?? $block->module->title,
        ]);

        if ($request->expectsJson()) {
            return response()->json([
                'item' => $this->serialize($item),
                'saved_at' => now()->toIso8601String(),
            ], 201);
        }

        return back()->with('success', 'Soal disimpan ke Bank Soal.');
    }

    public function destroy(Request $request, QuestionBankItem $item): JsonResponse|RedirectResponse
    {
        abort_unless($item->teacher_id === $request->user()->id, 403);

        $item->delete();

        if ($request->expectsJson()) {
            return response()->json(['deleted' => $item->id]);
        }

        return back()->with('success', 'Soal dihapus dari Bank Soal.');
    }

    /**
     * Tambahkan salinan soal dari bank ke akhir modul (dari Studio).
     */
    public function addToModule(Request $request, LearningModule $module): JsonResponse
    {
        Gate::authorize('update', $module);

        $data = $request->validate([
            'item_id' => ['required', 'string'],
        ]);

        $item = QuestionBankItem::query()
            ->where('teacher_id', $request->user()->id)
            ->find($data['item_id']);

        if ($item === null) {
            throw ValidationException::withMessages([
                'item_id' => 'Soal bank tidak ditemukan atau bukan milik Anda.',
            ]);
        }

        $block = $module->blocks()->create([
            'order_index' => $module->blocks()->max('order_index') === null
                ? 0
                : ((int) $module->blocks()->max('order_index')) + 1,
            'block_type' => $item->block_type,
            'points' => $item->points,
            'content' => $item->content,
            'ai_rubric' => $item->ai_rubric,
        ]);

        return response()->json([
            'block' => [
                'id' => $block->id,
                'order_index' => $block->order_index,
                'block_type' => $block->block_type,
                'points' => $block->points,
                'content' => $block->content,
                'ai_rubric' => $block->ai_rubric,
            ],
            'saved_at' => now()->toIso8601String(),
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(QuestionBankItem $item): array
    {
        return [
            'id' => $item->id,
            'block_type' => $item->block_type,
            'label' => self::BLOCK_LABELS[$item->block_type] ?? $item->block_type,
            'points' => $item->points,
            'topic' => $item->topic,
            'snippet' => $item->snippet(),
            'content' => $item->content,
            'created_at' => $item->created_at?->toIso8601String(),
        ];
    }
}
