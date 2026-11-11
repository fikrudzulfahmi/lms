<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\ClassroomStudent;
use App\Models\Department;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Models\ModuleProgress;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use App\Services\LiveSessionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class StudentPracticeTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $student;

    private LearningModule $module;

    private ModuleBlock $heading;

    private ModuleBlock $material;

    private ModuleBlock $mcq;

    protected function setUp(): void
    {
        parent::setUp();

        $year = AcademicYear::factory()->create(['is_active' => true, 'semester' => 'ganjil']);

        $this->teacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
        $this->student = User::factory()->create(['role' => User::ROLE_STUDENT, 'name' => 'Andi Pratama']);

        $department = Department::factory()->create(['code' => 'TSM', 'name' => 'Teknik Sepeda Motor']);
        $classroom = Classroom::factory()->create([
            'department_id' => $department->id,
            'grade_level' => 'XI',
            'name' => 'XI TSM 1',
        ]);
        $subject = Subject::factory()->create([
            'department_id' => $department->id,
            'code' => 'PLPK-TSM',
            'name' => 'Pemeliharaan Kelistrikan Sepeda Motor',
        ]);

        ClassroomStudent::create([
            'academic_year_id' => $year->id,
            'classroom_id' => $classroom->id,
            'student_id' => $this->student->id,
        ]);

        $assignment = TeachingAssignment::factory()->create([
            'teacher_id' => $this->teacher->id,
            'subject_id' => $subject->id,
            'classroom_id' => $classroom->id,
            'academic_year_id' => $year->id,
        ]);

        $this->module = LearningModule::factory()->create([
            'teaching_assignment_id' => $assignment->id,
            'title' => 'Diagnosa PGM-FI',
            'status' => LearningModule::STATUS_PUBLISHED,
        ]);

        $this->heading = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 0,
            'block_type' => ModuleBlock::BLOCK_SECTION_HEADING,
            'points' => 0,
            'content' => ['title' => 'Pengenalan', 'body' => ''],
        ]);

        $this->material = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 1,
            'block_type' => ModuleBlock::BLOCK_MATERI_TEKS,
            'points' => 0,
            'content' => ['title' => 'Sensor', 'body' => 'Sensor dan aktuator.'],
        ]);

        $this->mcq = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 2,
            'block_type' => ModuleBlock::BLOCK_SOAL_MCQ,
            'points' => 10,
            'content' => [
                'question' => 'Apa fungsi sensor MAP?',
                'options' => [
                    ['text' => 'Mengukur tekanan manifold', 'correct' => true],
                    ['text' => 'Mengukur suhu oli', 'correct' => false],
                ],
                'explanation' => 'Sensor MAP mengukur tekanan udara intake.',
            ],
        ]);
    }

    private function practiceUrl(?LearningModule $module = null): string
    {
        return route('student.practice.show', $module ?? $this->module);
    }

    public function test_student_can_open_practice_for_published_module_in_scope(): void
    {
        $response = $this->actingAs($this->student)->get($this->practiceUrl());

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Student/Practice/Show')
            ->where('module.title', 'Diagnosa PGM-FI')
            ->has('blocks', 3)
            ->where('progress.percent', 0)
            ->where('progress.completed_at', null)
            // Kunci jawaban ikut terkirim untuk mode latihan, rubrik tidak ada.
            ->where('blocks.2.content.options.0.correct', true)
            ->missing('blocks.2.ai_rubric')
        );
    }

    public function test_draft_module_and_out_of_scope_module_return_404(): void
    {
        $draft = LearningModule::factory()->create([
            'teaching_assignment_id' => $this->module->teaching_assignment_id,
            'status' => LearningModule::STATUS_DRAFT,
        ]);

        $this->actingAs($this->student)->get($this->practiceUrl($draft))->assertNotFound();

        // Modul terbit di kelas lain (di luar cakupan siswa).
        $otherClassroom = Classroom::factory()->create(['name' => 'XI TSM 2']);
        $otherAssignment = TeachingAssignment::factory()->create([
            'teacher_id' => $this->teacher->id,
            'classroom_id' => $otherClassroom->id,
        ]);
        $foreign = LearningModule::factory()->create([
            'teaching_assignment_id' => $otherAssignment->id,
            'status' => LearningModule::STATUS_PUBLISHED,
        ]);

        $this->actingAs($this->student)->get($this->practiceUrl($foreign))->assertNotFound();
    }

    public function test_mark_progress_counts_percent_without_section_headings(): void
    {
        // Judul bagian ditolak sebagai penambah progres dan tidak dihitung
        // di penyebut: yang dihitung hanya materi + MCQ (2 blok).
        $headingAttempt = $this->actingAs($this->student)->postJson(
            route('student.practice.progress', $this->module),
            ['block_id' => $this->heading->id],
        );
        $headingAttempt->assertUnprocessable();

        $response = $this->actingAs($this->student)->postJson(
            route('student.practice.progress', $this->module),
            ['block_id' => $this->material->id],
        );

        $response->assertOk();
        $response->assertJsonPath('percent', 50);
        $response->assertJsonPath('completed_at', null);
        $response->assertJsonPath('completed_blocks', [$this->material->id]);

        // Idempoten: menandai ulang tidak mengubah apa pun.
        $again = $this->actingAs($this->student)->postJson(
            route('student.practice.progress', $this->module),
            ['block_id' => $this->material->id],
        );
        $again->assertJsonPath('percent', 50);
    }

    public function test_answer_mcq_grades_marks_complete_and_finishes_module(): void
    {
        $wrong = $this->actingAs($this->student)->postJson(
            route('student.practice.answer', $this->module),
            ['block_id' => $this->mcq->id, 'answer' => ['option_index' => 1]],
        );

        $wrong->assertOk();
        $wrong->assertJsonPath('correct', false);
        $wrong->assertJsonPath('earned_points', 0);
        $wrong->assertJsonPath('percent', 50);

        // Selesaikan materi, lalu jawab MCQ dengan benar (coba lagi).
        $this->actingAs($this->student)->postJson(
            route('student.practice.progress', $this->module),
            ['block_id' => $this->material->id],
        )->assertOk();

        $right = $this->actingAs($this->student)->postJson(
            route('student.practice.answer', $this->module),
            ['block_id' => $this->mcq->id, 'answer' => ['option_index' => 0]],
        );

        $right->assertOk();
        $right->assertJsonPath('correct', true);
        $right->assertJsonPath('earned_points', 10);
        $right->assertJsonPath('percent', 100);
        $this->assertNotNull($right->json('completed_at'));

        $progress = ModuleProgress::query()
            ->where('student_id', $this->student->id)
            ->where('module_id', $this->module->id)
            ->first();

        $this->assertNotNull($progress);
        $this->assertNotNull($progress->completed_at);

        $stored = $progress->answers[$this->mcq->id];
        $this->assertSame(['option_index' => 0], $stored['payload']);
        $this->assertTrue($stored['correct']);
        $this->assertEquals(10.0, $stored['earned_points']);
        $this->assertTrue($stored['is_graded']);
        $this->assertNotEmpty($stored['answered_at']);
    }

    public function test_allow_practice_false_returns_404(): void
    {
        $this->module->update(['allow_practice' => false]);

        $this->actingAs($this->student)->get($this->practiceUrl())->assertNotFound();

        $this->actingAs($this->student)->postJson(
            route('student.practice.progress', $this->module),
            ['block_id' => $this->material->id],
        )->assertNotFound();
    }

    public function test_teacher_admin_and_guest_cannot_use_practice_routes(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        $this->actingAs($this->teacher)->get($this->practiceUrl())->assertForbidden();
        $this->actingAs($admin)->get($this->practiceUrl())->assertForbidden();
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get($this->practiceUrl())->assertRedirect(route('login'));
    }

    public function test_polling_block_can_be_created_and_is_ungraded(): void
    {
        $response = $this->actingAs($this->teacher)->postJson(
            '/teacher/modules/'.$this->module->id.'/blocks',
            [
                'block_type' => 'polling',
                'points' => 0,
                'content' => [
                    'question' => 'Bagian mana yang paling sulit?',
                    'options' => ['Sensor', 'Aktuator', 'ECU'],
                ],
            ],
        );

        $response->assertCreated();
        $response->assertJsonPath('block.block_type', 'polling');

        $block = ModuleBlock::query()->where('block_type', 'polling')->firstOrFail();
        $grade = app(LiveSessionService::class)->gradeAnswer($block, ['option_index' => 1]);

        $this->assertFalse($grade['is_graded']);
        $this->assertNull($grade['correct']);
        $this->assertSame(0.0, $grade['earned_points']);
    }
}
