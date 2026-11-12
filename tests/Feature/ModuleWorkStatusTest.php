<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\ClassroomStudent;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Models\ModuleGrade;
use App\Models\ModuleProgress;
use App\Models\StudentResponse;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use App\Services\GradeCalculationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Status pengerjaan modul harus membedakan: belum dikerjakan, sedang
 * dikerjakan, menunggu dinilai (esai belum dinilai — bukan nilai 0), dan
 * sudah ada nilai. Laporan Gary 12 Nov: kartu modul siswa yang belum
 * mengerjakan terlihat sama seperti siswa yang sudah selesai.
 */
class ModuleWorkStatusTest extends TestCase
{
    use RefreshDatabase;

    private User $studentA;

    private User $studentB;

    private User $studentC;

    private LearningModule $module;

    private ModuleBlock $mcq;

    private ModuleBlock $essay;

    protected function setUp(): void
    {
        parent::setUp();

        $year = AcademicYear::factory()->create(['is_active' => true]);
        $classroom = Classroom::factory()->create();
        $subject = Subject::factory()->create();
        $teacher = User::factory()->create(['role' => User::ROLE_TEACHER]);

        $this->studentA = User::factory()->create(['role' => User::ROLE_STUDENT, 'name' => 'Andi A']);
        $this->studentB = User::factory()->create(['role' => User::ROLE_STUDENT, 'name' => 'Budi B']);
        $this->studentC = User::factory()->create(['role' => User::ROLE_STUDENT, 'name' => 'Citra C']);

        foreach ([$this->studentA, $this->studentB, $this->studentC] as $student) {
            ClassroomStudent::create([
                'classroom_id' => $classroom->id,
                'student_id' => $student->id,
                'academic_year_id' => $year->id,
            ]);
        }

        $assignment = TeachingAssignment::factory()->create([
            'teacher_id' => $teacher->id,
            'classroom_id' => $classroom->id,
            'subject_id' => $subject->id,
            'academic_year_id' => $year->id,
        ]);

        $this->module = LearningModule::factory()->create([
            'teaching_assignment_id' => $assignment->id,
            'status' => LearningModule::STATUS_PUBLISHED,
            'allow_practice' => true,
        ]);

        $this->mcq = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'block_type' => ModuleBlock::BLOCK_SOAL_MCQ,
            'points' => 10,
            'order_index' => 1,
            'content' => [
                'question' => 'Starter berputar tapi mesin tidak hidup. Dugaan pertama?',
                'options' => [['text' => 'Aki lemah'], ['text' => 'Ban kurang angin']],
                'correct_index' => 0,
            ],
        ]);

        $this->essay = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'block_type' => ModuleBlock::BLOCK_SOAL_ESSAY_AI,
            'points' => 10,
            'order_index' => 2,
            'content' => ['question' => 'Jelaskan cara memeriksa tegangan aki.'],
        ]);
    }

    private function essayResponse(User $student): StudentResponse
    {
        return StudentResponse::query()->create([
            'module_block_id' => $this->essay->id,
            'student_id' => $student->id,
            'answer_payload' => ['text' => 'Ukur dengan multitester, normal 12,6 volt.'],
            'earned_points' => 0,
            'is_correct' => null,
            'is_graded' => false,
            'ai_feedback' => null,
        ]);
    }

    public function test_report_marks_pending_essay_as_awaiting_instead_of_zero_score(): void
    {
        $this->essayResponse($this->studentA);

        $report = app(GradeCalculationService::class)->studentReport($this->studentA);
        $assessment = collect($report['subjects'])
            ->flatMap(fn ($subject) => $subject['assessments'])
            ->firstWhere('module_id', $this->module->id);

        $this->assertNotNull($assessment, 'Modul dengan esai pending harus tetap muncul di laporan.');
        $this->assertNull($assessment['score'], 'Esai pending tidak boleh tampil sebagai nilai 0.');
        $this->assertTrue($assessment['awaiting_grade']);

        $reportB = app(GradeCalculationService::class)->studentReport($this->studentB);
        $assessmentB = collect($reportB['subjects'])
            ->flatMap(fn ($subject) => $subject['assessments'])
            ->firstWhere('module_id', $this->module->id);
        $this->assertNull($assessmentB, 'Siswa yang belum mengerjakan tidak punya asesmen.');
    }

    public function test_recalculate_marks_pending_essay_as_waiting_not_graded(): void
    {
        $this->essayResponse($this->studentA);

        app(GradeCalculationService::class)->recalculateModule($this->module);

        $gradeA = ModuleGrade::query()
            ->where('module_id', $this->module->id)
            ->where('student_id', $this->studentA->id)
            ->first();
        $this->assertSame(ModuleGrade::STATUS_WAITING_AI, $gradeA->status);
        $this->assertNull($gradeA->completed_at);

        $gradeB = ModuleGrade::query()
            ->where('module_id', $this->module->id)
            ->where('student_id', $this->studentB->id)
            ->first();
        $this->assertSame(ModuleGrade::STATUS_IN_PROGRESS, $gradeB->status);
        $this->assertNull($gradeB->completed_at);
    }

    public function test_home_card_work_states_distinguish_students(): void
    {
        $this->essayResponse($this->studentA);

        StudentResponse::query()->create([
            'module_block_id' => $this->mcq->id,
            'student_id' => $this->studentC->id,
            'answer_payload' => ['option_index' => 0],
            'earned_points' => 10,
            'is_correct' => true,
            'is_graded' => true,
            'ai_feedback' => null,
        ]);

        $assertState = function (User $student, string $expected) {
            $this->actingAs($student)->get(route('student.home'))
                ->assertOk()
                ->assertInertia(fn (Assert $page) => $page
                    ->component('Student/Home')
                    ->where('modules.0.id', $this->module->id)
                    ->where('modules.0.work_state', $expected));
        };

        $assertState($this->studentA, 'awaiting_grade');
        $assertState($this->studentB, 'not_started');
        // Citra menjawab MCQ benar (10 dari total 20 poin modul) — sudah ada
        // nilai parsial dan tidak ada yang pending, jadi status graded.
        $assertState($this->studentC, 'graded');
    }

    public function test_home_card_links_to_where_the_student_can_start(): void
    {
        // Modul latihan (allow_practice): kartu menuju halaman Belajar Mandiri.
        $this->actingAs($this->studentB)->get(route('student.home'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Student/Home')
                ->where('modules', function ($modules) {
                    $card = collect($modules)->firstWhere('id', $this->module->id);
                    $this->assertNotNull($card);
                    $this->assertStringEndsWith("/student/modules/{$this->module->id}/practice", $card['href']);
                    $this->assertSame('Mulai Belajar', $card['action_label']);

                    return true;
                }));

        // Modul tanpa latihan tetapi kelas live sedang berjalan: kartu
        // menuju ruang live dengan PIN sesi itu.
        $liveModule = LearningModule::factory()->create([
            'teaching_assignment_id' => $this->module->teaching_assignment_id,
            'status' => LearningModule::STATUS_PUBLISHED,
            'allow_practice' => false,
            'title' => 'Modul Live Saja',
        ]);
        ModuleBlock::factory()->create([
            'module_id' => $liveModule->id,
            'block_type' => ModuleBlock::BLOCK_MATERI_TEKS,
            'order_index' => 1,
            'content' => ['body' => 'Materi pembuka.'],
        ]);
        $session = app(\App\Services\LiveSessionService::class)->start($liveModule);

        $this->actingAs($this->studentB)->get(route('student.home'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Student/Home')
                ->where('modules', function ($modules) use ($liveModule, $session) {
                    $card = collect($modules)->firstWhere('id', $liveModule->id);
                    $this->assertNotNull($card);
                    $this->assertStringEndsWith("/live/{$session->pin_code}", $card['href']);
                    $this->assertSame('Masuk Kelas Live', $card['action_label']);

                    return true;
                }));
    }

    public function test_home_card_shows_in_progress_for_partial_practice(): void
    {
        ModuleProgress::query()->create([
            'student_id' => $this->studentB->id,
            'module_id' => $this->module->id,
            'completed_blocks' => [$this->mcq->id],
            'answers' => [],
            'completed_at' => null,
        ]);

        $this->actingAs($this->studentB)->get(route('student.home'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Student/Home')
                ->where('modules.0.id', $this->module->id)
                ->where('modules.0.work_state', 'in_progress'));
    }
}
