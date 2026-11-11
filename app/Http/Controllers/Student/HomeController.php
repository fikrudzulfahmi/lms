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

        $moduleCards = $modules->map(fn (LearningModule $module) => [
            'id' => $module->id,
            'title' => $module->title,
            'subject' => $module->teachingAssignment?->subject?->name,
            'subject_code' => $module->teachingAssignment?->subject?->code,
            'teacher' => $module->teachingAssignment?->teacher?->name,
            'assessment_type' => $module->assessment_type,
            'allow_practice' => (bool) $module->allow_practice,
            'kktp' => (int) ($module->kktp_score ?? 0),
            'blocks_count' => (int) ($module->blocks_count ?? 0),
            'score' => $scoreByModule[$module->id]['score'] ?? null,
            'is_passed' => $scoreByModule[$module->id]['is_passed'] ?? null,
            'has_override' => $scoreByModule[$module->id]['has_override'] ?? false,
        ])->values();

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

        $activeSessions = LiveSession::query()
            ->whereIn('module_id', $modules->pluck('id')->all())
            ->whereIn('status', [LiveSession::STATUS_WAITING, LiveSession::STATUS_ACTIVE])
            ->with('module:id,title')
            ->latest('created_at')
            ->get()
            ->map(fn (LiveSession $session) => [
                'pin_code' => $session->pin_code,
                'status' => $session->status,
                'module' => $session->module?->title,
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
