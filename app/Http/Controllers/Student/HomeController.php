<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\ClassroomStudent;
use App\Models\LearningModule;
use App\Models\LiveSession;
use App\Models\ModuleBlock;
use App\Models\ModuleProgress;
use App\Models\TeachingAssignment;
use App\Services\GradeCalculationService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class HomeController extends Controller
{
    public function __construct(private readonly GradeCalculationService $grades) {}

    /**
     * Beranda siswa: kelas aktif, sesi live yang sedang berjalan, modul
     * terpublikasi beserta status nilainya, dan ringkasan capaian.
     */
    public function index(Request $request): Response
    {
        $student = $request->user();
        $activeYear = AcademicYear::active();

        $placement = ClassroomStudent::query()
            ->with(['classroom:id,name,grade_level', 'academicYear:id,name,semester'])
            ->where('student_id', $student->id)
            ->when($activeYear, fn ($query) => $query->where('academic_year_id', $activeYear->id))
            ->orderByDesc('academic_year_id')
            ->first();

        $yearId = $placement?->academic_year_id ?? $activeYear?->id;
        $report = $this->grades->studentReport($student, $yearId);

        $assignments = $placement === null
            ? collect()
            : TeachingAssignment::query()
                ->where('classroom_id', $placement->classroom_id)
                ->when($yearId, fn ($query) => $query->where('academic_year_id', $yearId))
                ->with(['subject:id,code,name', 'teacher:id,name'])
                ->get();

        $modules = LearningModule::query()
            ->whereIn('teaching_assignment_id', $assignments->pluck('id')->all())
            ->where('status', LearningModule::STATUS_PUBLISHED)
            ->with([
                'teachingAssignment:id,subject_id,teacher_id',
                'teachingAssignment.subject:id,code,name',
                'teachingAssignment.teacher:id,name',
            ])
            ->withCount('blocks')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(24)
            ->get();

        // Skor per modul diambil dari laporan nilai (sudah termasuk override guru).
        $scoreByModule = [];
        foreach ($report['subjects'] ?? [] as $subject) {
            foreach ($subject['assessments'] ?? [] as $assessment) {
                $scoreByModule[$assessment['module_id']] = $assessment;
            }
        }

        // Progres belajar mandiri per modul (untuk chip latihan di kartu).
        $practiceProgress = [];
        if ($modules->isNotEmpty()) {
            $eligibleByModule = ModuleBlock::query()
                ->whereIn('module_id', $modules->pluck('id')->all())
                ->where('block_type', '!=', ModuleBlock::BLOCK_SECTION_HEADING)
                ->get(['id', 'module_id'])
                ->groupBy('module_id')
                ->map(fn ($blocks) => $blocks->pluck('id')->map(fn ($id) => (string) $id)->all());

            $progressRows = ModuleProgress::query()
                ->where('student_id', $student->id)
                ->whereIn('module_id', $modules->pluck('id')->all())
                ->get();

            foreach ($progressRows as $row) {
                $eligible = $eligibleByModule[$row->module_id] ?? [];
                $completed = array_intersect($eligible, array_map('strval', $row->completed_blocks ?? []));
                $total = count($eligible);

                $practiceProgress[$row->module_id] = [
                    'percent' => $total > 0 ? (int) round(count($completed) / $total * 100) : 0,
                    'completed_at' => $row->completed_at?->toIso8601String(),
                ];
            }
        }

        // Status pengerjaan per modul untuk label kartu siswa. "belum
        // dinilai" saja membingungkan: siswa yang belum mulai dan yang
        // sudah selesai tapi menunggu nilai terlihat sama. Bedakan:
        // belum dikerjakan / sedang dikerjakan / menunggu dinilai /
        // menunggu diumumkan / latihan tuntas / sudah ada nilai.
        $responseCounts = $modules->isEmpty()
            ? collect()
            : \App\Models\StudentResponse::query()
                ->join('module_blocks', 'module_blocks.id', '=', 'student_responses.module_block_id')
                ->where('student_responses.student_id', $student->id)
                ->whereIn('module_blocks.module_id', $modules->pluck('id')->all())
                ->groupBy('module_blocks.module_id')
                ->selectRaw('module_blocks.module_id, COUNT(*) as total')
                ->pluck('total', 'module_id');

        // Sesi live yang sedang berjalan per modul — kartu modul yang
        // diklik harus membawa siswa ke tempat ia bisa mulai bekerja:
        // ruang live bila kelas sedang berjalan, Belajar Mandiri bila
        // diizinkan, selain itu halaman masuk kelas live (pakai PIN).
        $activeSessionRows = $modules->isEmpty()
            ? collect()
            : LiveSession::query()
                ->whereIn('module_id', $modules->pluck('id')->all())
                ->whereIn('status', [LiveSession::STATUS_WAITING, LiveSession::STATUS_ACTIVE])
                ->with('module:id,title')
                ->latest('created_at')
                ->get();

        $sessionByModule = $activeSessionRows->keyBy('module_id');

        $moduleCards = $modules->map(function (LearningModule $module) use ($scoreByModule, $practiceProgress, $responseCounts, $sessionByModule) {
            $assessment = $scoreByModule[$module->id] ?? null;
            $practice = $practiceProgress[$module->id] ?? null;

            $workState = match (true) {
                (bool) ($assessment['results_pending'] ?? false) => 'awaiting_release',
                (bool) ($assessment['awaiting_grade'] ?? false) => 'awaiting_grade',
                ($assessment['score'] ?? null) !== null => 'graded',
                ($practice['completed_at'] ?? null) !== null => 'practice_done',
                (($responseCounts[$module->id] ?? 0) > 0) || (($practice['percent'] ?? 0) > 0) => 'in_progress',
                default => 'not_started',
            };

            $session = $sessionByModule[$module->id] ?? null;

            if ($session !== null) {
                $href = route('student.live.room', ['pin' => $session->pin_code]);
                $actionLabel = 'Masuk Kelas Live';
            } elseif ($module->allow_practice) {
                $href = route('student.practice.show', $module);
                $actionLabel = $workState === 'not_started' ? 'Mulai Belajar' : 'Buka Modul';
            } else {
                $href = route('student.live.join');
                $actionLabel = 'Masuk Kelas Live';
            }

            return [
                'id' => $module->id,
                'title' => $module->title,
                'subject' => $module->teachingAssignment?->subject?->name,
                'subject_code' => $module->teachingAssignment?->subject?->code,
                'teacher' => $module->teachingAssignment?->teacher?->name,
                'assessment_type' => $module->assessment_type,
                'allow_practice' => (bool) $module->allow_practice,
                'kktp' => (int) ($module->kktp_score ?? 0),
                'blocks_count' => (int) ($module->blocks_count ?? 0),
                'score' => $assessment['score'] ?? null,
                'is_passed' => $assessment['is_passed'] ?? null,
                'has_override' => $assessment['has_override'] ?? false,
                'work_state' => $workState,
                'href' => $href,
                'action_label' => $actionLabel,
            ];
        })->values();

        $activeSessions = $activeSessionRows
            ->map(fn (LiveSession $session) => [
                'pin_code' => $session->pin_code,
                'status' => $session->status,
                'module' => $session->module?->title,
                'module_id' => $session->module_id,
            ])
            ->values();

        return Inertia::render('Student/Home', [
            'student' => [
                'name' => $student->name,
                'nisn' => $student->nisn,
            ],
            'placement' => $placement === null ? null : [
                'classroom' => $placement->classroom?->name,
                'grade_level' => $placement->classroom?->grade_level,
                'year' => $placement->academicYear?->name,
                'semester' => $placement->academicYear?->semester,
            ],
            'active_year' => $activeYear?->only(['id', 'name', 'semester']),
            'summary' => array_merge($report['summary'] ?? [], [
                'modules' => $moduleCards->count(),
                'modules_graded' => $moduleCards->filter(fn ($module) => $module['score'] !== null)->count(),
                'modules_tuntas' => $moduleCards->filter(fn ($module) => $module['score'] !== null && $module['is_passed'])->count(),
                'modules_belum' => $moduleCards->filter(fn ($module) => $module['score'] !== null && ! $module['is_passed'])->count(),
            ]),
            'modules' => $moduleCards,
            'practice_progress' => $practiceProgress,
            'active_sessions' => $activeSessions,
        ]);
    }
}
