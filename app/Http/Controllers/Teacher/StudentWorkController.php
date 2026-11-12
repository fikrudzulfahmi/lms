<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Jobs\GradeStudentEssaysJob;
use App\Models\ClassroomStudent;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Models\ModuleGrade;
use App\Models\ModuleProgress;
use App\Models\StudentResponse;
use App\Models\Submission;
use App\Services\AiCurriculumService;
use App\Services\AnswerSummaryService;
use App\Services\GradeCalculationService;
use App\Services\LiveSessionService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

/**
 * Pekerjaan Siswa per modul — satu tempat bagi guru untuk melihat semua
 * pekerjaan siswa pada modul ini: jawaban kelas live (StudentResponse),
 * jawaban Belajar Mandiri (ModuleProgress), dan pengumpulan Tugas Unggah.
 * Sebelumnya ketiganya terpencar (buku nilai, tidak ada halaman, dan
 * halaman Pengumpulan Tugas) sehingga guru sulit menemukan pekerjaan
 * yang menunggu dinilai.
 */
class StudentWorkController extends Controller
{
    private const BLOCK_LABELS = [
        'section_heading' => 'Judul Bagian',
        'materi_richtext' => 'Teks Kaya',
        'materi_video' => 'Video',
        'materi_file' => 'Lampiran Berkas',
        'materi_embed' => 'Tautan / Embed',
        'materi_teks' => 'Teks Materi',
        'materi_accordion' => 'Accordion SOP',
        'materi_flashcard' => 'Flashcard',
        'slide_image' => 'Slide Gambar',
        'soal_mcq' => 'Pilihan Ganda',
        'soal_truefalse' => 'Benar / Salah',
        'soal_fillblank' => 'Isian Singkat',
        'soal_sequencing' => 'Urutan Prosedur',
        'soal_matching' => 'Mencocokkan',
        'soal_essay_ai' => 'Studi Kasus Esai',
        'soal_hotspot' => 'Labeli Gambar / Hotspot',
        'materi_video_interaktif' => 'Video Interaktif',
        'polling' => 'Polling Kilat',
        'praktik_checklist' => 'Checklist Praktik',
        'tugas_upload' => 'Tugas Unggah',
    ];

    public function __construct(
        private readonly AnswerSummaryService $summaries,
        private readonly LiveSessionService $sessions,
        private readonly GradeCalculationService $grades,
    ) {}

    public function index(Request $request, LearningModule $module): Response
    {
        Gate::authorize('view', $module);

        $module->load([
            'teachingAssignment.subject:id,code,name',
            'teachingAssignment.classroom:id,name',
            'teachingAssignment.teacher:id,name',
        ]);

        $blocks = $module->blocks()
            ->orderBy('order_index')
            ->orderBy('created_at')
            ->get();

        $blockIds = $blocks->pluck('id')->all();
        $eligibleCount = $blocks
            ->where('block_type', '!=', ModuleBlock::BLOCK_SECTION_HEADING)
            ->count();

        $assignment = $module->teachingAssignment;

        $students = ClassroomStudent::query()
            ->where('classroom_id', $assignment?->classroom_id)
            ->where('academic_year_id', $assignment?->academic_year_id)
            ->with('student:id,name,username')
            ->get()
            ->map(fn (ClassroomStudent $placement) => $placement->student)
            ->filter()
            ->sortBy('name')
            ->values();

        $studentIds = $students->pluck('id')->all();

        $gradeRows = ModuleGrade::query()
            ->where('module_id', $module->id)
            ->whereIn('student_id', $studentIds)
            ->get()
            ->keyBy('student_id');

        $responses = StudentResponse::query()
            ->whereIn('module_block_id', $blockIds)
            ->whereIn('student_id', $studentIds)
            ->get()
            ->groupBy('student_id');

        $progressRows = ModuleProgress::query()
            ->where('module_id', $module->id)
            ->whereIn('student_id', $studentIds)
            ->get()
            ->keyBy('student_id');

        $submissions = Submission::query()
            ->whereIn('module_block_id', $blockIds)
            ->whereIn('student_id', $studentIds)
            ->get()
            ->keyBy(fn (Submission $submission) => $submission->student_id.':'.$submission->module_block_id);

        $blocksById = $blocks->keyBy('id');

        $studentPayload = $students->map(function ($student) use (
            $blocks, $gradeRows, $responses, $progressRows, $submissions, $eligibleCount, $blocksById,
        ) {
            $grade = $gradeRows->get($student->id);
            $progress = $progressRows->get($student->id);
            $studentResponses = collect($responses->get($student->id, []))->keyBy('module_block_id');
            $practiceAnswers = (array) ($progress?->answers ?? []);
            $completedBlocks = array_map('strval', $progress?->completed_blocks ?? []);

            $rows = $blocks
                ->where('block_type', '!=', ModuleBlock::BLOCK_SECTION_HEADING)
                ->map(function (ModuleBlock $block) use (
                    $student, $studentResponses, $practiceAnswers, $submissions, $completedBlocks,
                ) {
                    $response = $studentResponses->get($block->id);
                    $practice = $practiceAnswers[$block->id] ?? null;
                    $submission = $submissions->get($student->id.':'.$block->id);

                    return [
                        'block_id' => $block->id,
                        'label' => self::BLOCK_LABELS[$block->block_type] ?? $block->block_type,
                        'block_type' => $block->block_type,
                        'points' => $block->points,
                        'live' => $response === null ? null : [
                            'response_id' => $response->id,
                            'summary' => $this->summaries->summarize($block, (array) ($response->answer_payload ?? [])),
                            'earned_points' => $response->earned_points !== null ? (float) $response->earned_points : null,
                            'is_graded' => (bool) $response->is_graded,
                            'correct' => $response->answer_payload
                                ? $this->sessions->gradeAnswer($block, (array) $response->answer_payload)['correct']
                                : null,
                            'feedback' => $response->ai_feedback,
                            'can_grade' => $block->block_type === ModuleBlock::BLOCK_SOAL_ESSAY_AI && ! $response->is_graded,
                        ],
                        'practice' => $practice === null ? null : [
                            'summary' => $this->summaries->summarize($block, (array) ($practice['payload'] ?? [])),
                            'correct' => $practice['correct'] ?? null,
                            'earned_points' => isset($practice['earned_points']) ? (float) $practice['earned_points'] : null,
                        ],
                        'practice_done' => in_array($block->id, $completedBlocks, true),
                        'submission' => $submission === null ? null : [
                            'status' => $submission->status,
                            'score' => $submission->score !== null ? (float) $submission->score : null,
                        ],
                    ];
                })
                ->values();

            return [
                'id' => $student->id,
                'name' => $student->name,
                'username' => $student->username,
                'grade' => $grade === null ? null : [
                    'status' => $grade->status,
                    // Skor hanya ditampilkan bila benar-benar sudah dinilai;
                    // baris nilai siswa yang belum mengerjakan menyimpan 0
                    // dan tidak boleh terbaca sebagai nilai asli.
                    'final_score' => $grade->status === ModuleGrade::STATUS_GRADED && $grade->final_score !== null
                        ? (float) $grade->final_score
                        : null,
                ],
                'practice' => $progress === null ? null : [
                    'percent' => $eligibleCount > 0
                        ? (int) round(count(array_intersect($completedBlocks, $blocksById->keys()->all())) / $eligibleCount * 100)
                        : 0,
                    'completed_at' => $progress->completed_at?->toIso8601String(),
                ],
                'rows' => $rows,
            ];
        })->values();

        return Inertia::render('Teacher/Work/Index', [
            'module' => [
                'id' => $module->id,
                'title' => $module->title,
                'subject' => $assignment?->subject?->name,
                'classroom' => $assignment?->classroom?->name,
                'edit_url' => route('teacher.modules.edit', $module),
                'submissions_url' => route('teacher.modules.submissions.index', $module),
            ],
            'students' => $studentPayload,
            'grade_ai_url' => route('teacher.responses.grade-ai', ['response' => '__ID__']),
            'grade_manual_url' => route('teacher.responses.grade-manual', ['response' => '__ID__']),
        ]);
    }

    /**
     * Nilai esai secara manual: guru mengisi poin (0 s.d. poin blok).
     */
    public function gradeManual(Request $request, StudentResponse $response): RedirectResponse
    {
        $module = $this->moduleForResponse($response);

        $data = $request->validate([
            'score' => ['required', 'numeric', 'min:0'],
            'feedback' => ['nullable', 'string', 'max:5000'],
        ]);

        $max = (float) ($response->block?->points ?? 0);

        if ((float) $data['score'] > $max) {
            throw ValidationException::withMessages([
                'score' => "Nilai maksimal untuk blok ini {$max} poin.",
            ]);
        }

        $response->update([
            'earned_points' => (float) $data['score'],
            'ai_feedback' => ($data['feedback'] ?? null) ?: 'Dinilai manual oleh guru.',
            'is_graded' => true,
        ]);

        $this->grades->recalculateModule($module);

        return back()->with('success', 'Nilai esai tersimpan.');
    }

    /**
     * Nilai esai dengan AI sekarang juga (sinkron, tanpa antrean) agar guru
     * tidak bergantung pada queue worker yang berjalan di server.
     */
    public function gradeAi(Request $request, StudentResponse $response, AiCurriculumService $ai): RedirectResponse
    {
        $module = $this->moduleForResponse($response);

        if ($response->block?->block_type !== ModuleBlock::BLOCK_SOAL_ESSAY_AI || $response->is_graded) {
            return back()->with('error', 'Jawaban ini tidak menunggu penilaian AI.');
        }

        try {
            (new GradeStudentEssaysJob([$response->id]))->handle($ai);
        } catch (Throwable) {
            return back()->with('error', 'Penilaian AI gagal dijalankan. Coba lagi atau nilai manual.');
        }

        $response->refresh();

        if (! $response->is_graded) {
            return back()->with('error', 'AI belum berhasil menilai jawaban ini (periksa koneksi layanan AI). Silakan nilai manual.');
        }

        return back()->with('success', 'Jawaban esai berhasil dinilai AI.');
    }

    private function moduleForResponse(StudentResponse $response): LearningModule
    {
        $response->loadMissing('block.module');
        $module = $response->block?->module;

        abort_if($module === null, 404);
        Gate::authorize('update', $module);

        return $module;
    }
}
