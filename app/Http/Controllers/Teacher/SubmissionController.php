<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Models\StudentResponse;
use App\Models\Submission;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Pengumpulan Tugas Unggah per modul: guru melihat berkas siswa dan
 * menilai per kriteria rubrik. Nilai persen diteruskan ke StudentResponse
 * agar masuk buku nilai lewat jalur yang sudah ada.
 */
class SubmissionController extends Controller
{
    public function index(Request $request, LearningModule $module): Response
    {
        Gate::authorize('view', $module);

        $module->load([
            'teachingAssignment.subject:id,code,name',
            'teachingAssignment.classroom:id,name',
        ]);

        $blocks = $module->blocks()
            ->where('block_type', ModuleBlock::BLOCK_TUGAS_UPLOAD)
            ->orderBy('order_index')
            ->orderBy('created_at')
            ->with(['submissions' => fn ($query) => $query
                ->with('student:id,name,username')
                ->orderBy('updated_at'),
            ])
            ->get()
            ->map(fn (ModuleBlock $block) => [
                'id' => $block->id,
                'title' => (string) ($block->content['title'] ?? 'Tugas Unggah'),
                'instructions' => (string) ($block->content['instructions'] ?? ''),
                'points' => $block->points,
                'rubric' => array_values(array_map(fn ($item) => [
                    'criterion' => (string) ($item['criterion'] ?? ''),
                    'max_score' => (int) ($item['max_score'] ?? 0),
                ], (array) ($block->content['rubric'] ?? []))),
                'submissions' => $block->submissions->map(fn (Submission $submission) => [
                    'id' => $submission->id,
                    'student_name' => $submission->student?->name,
                    'student_username' => $submission->student?->username,
                    'files' => $submission->files ?? [],
                    'note' => $submission->note,
                    'status' => $submission->status,
                    'score' => $submission->score,
                    'rubric_scores' => $submission->rubric_scores,
                    'feedback' => $submission->feedback,
                    'submitted_at' => $submission->updated_at?->toIso8601String(),
                    'graded_at' => $submission->graded_at?->toIso8601String(),
                    'grade_url' => route('teacher.modules.submissions.grade', [$module, $submission]),
                ])->values(),
            ])
            ->values();

        return Inertia::render('Teacher/Submissions/Index', [
            'module' => [
                'id' => $module->id,
                'title' => $module->title,
                'subject' => $module->teachingAssignment?->subject?->name,
                'classroom' => $module->teachingAssignment?->classroom?->name,
                'edit_url' => route('teacher.modules.edit', $module),
            ],
            'blocks' => $blocks,
        ]);
    }

    public function grade(Request $request, LearningModule $module, Submission $submission): RedirectResponse
    {
        Gate::authorize('update', $module);

        abort_unless($submission->module_block_id !== null
            && $submission->block !== null
            && $submission->block->module_id === $module->id, 404);

        $block = $submission->block;
        $rubric = array_values((array) ($block->content['rubric'] ?? []));

        $data = $request->validate([
            'rubric_scores' => ['required', 'array'],
            'feedback' => ['nullable', 'string', 'max:5000'],
        ]);

        $scores = array_values((array) $data['rubric_scores']);

        if (count($scores) !== count($rubric)) {
            throw ValidationException::withMessages([
                'rubric_scores' => 'Jumlah nilai harus sama dengan jumlah kriteria rubrik.',
            ]);
        }

        $total = 0;
        $maxTotal = 0;

        foreach ($rubric as $index => $criterion) {
            $max = (int) ($criterion['max_score'] ?? 0);
            $value = $scores[$index] ?? null;

            if (! is_numeric($value) || (float) $value < 0 || (float) $value > $max) {
                throw ValidationException::withMessages([
                    'rubric_scores' => 'Nilai kriteria "'.($criterion['criterion'] ?? '').'" harus antara 0 dan '.$max.'.',
                ]);
            }

            $total += (float) $value;
            $maxTotal += $max;
        }

        $percent = $maxTotal > 0 ? round($total / $maxTotal * 100, 2) : 0.0;

        $submission->update([
            'rubric_scores' => array_map(fn ($value) => (float) $value, $scores),
            'feedback' => $data['feedback'] ?? null,
            'score' => $percent,
            'status' => Submission::STATUS_GRADED,
            'graded_by' => $request->user()->id,
            'graded_at' => now(),
        ]);

        // Teruskan ke buku nilai: satu StudentResponse per blok per siswa,
        // poin diperoleh = persen × poin blok.
        StudentResponse::query()->updateOrCreate(
            [
                'module_block_id' => $block->id,
                'student_id' => $submission->student_id,
            ],
            [
                'answer_payload' => [
                    'files' => $submission->files ?? [],
                    'note' => $submission->note,
                    'submission_id' => $submission->id,
                ],
                'earned_points' => round($percent / 100 * (float) $block->points, 2),
                'is_graded' => true,
            ],
        );

        return back()->with('success', 'Nilai tersimpan untuk '.$submission->student?->name.'.');
    }
}
