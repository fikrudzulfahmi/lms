<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\ClassroomStudent;
use App\Models\Department;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Models\ModuleGrade;
use App\Models\StudentResponse;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class StudentWorkTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $student;

    private LearningModule $module;

    private ModuleBlock $mcq;

    private ModuleBlock $essay;

    private StudentResponse $essayResponse;

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

        $this->mcq = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 0,
            'block_type' => ModuleBlock::BLOCK_SOAL_MCQ,
            'points' => 10,
            'content' => [
                'question' => 'Apa fungsi sensor MAP?',
                'options' => [
                    ['text' => 'Mengukur tekanan manifold', 'correct' => true],
                    ['text' => 'Mengukur suhu oli', 'correct' => false],
                ],
            ],
        ]);

        $this->essay = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 1,
            'block_type' => ModuleBlock::BLOCK_SOAL_ESSAY_AI,
            'points' => 20,
            'content' => ['question' => 'Analisis kasus mogok saat panas.', 'min_words' => 30],
        ]);

        StudentResponse::create([
            'module_block_id' => $this->mcq->id,
            'student_id' => $this->student->id,
            'answer_payload' => ['option_index' => 0],
            'earned_points' => 10,
            'is_graded' => true,
        ]);

        $this->essayResponse = StudentResponse::create([
            'module_block_id' => $this->essay->id,
            'student_id' => $this->student->id,
            'answer_payload' => ['text' => 'Sensor ECT rusak sehingga ECU membaca suhu selalu dingin dan campuran terlalu kaya.'],
            'earned_points' => 0,
            'is_graded' => false,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function chatResponse(string $content): array
    {
        return [
            'id' => 'chatcmpl-test',
            'object' => 'chat.completion',
            'choices' => [
                ['index' => 0, 'message' => ['role' => 'assistant', 'content' => $content], 'finish_reason' => 'stop'],
            ],
        ];
    }

    public function test_teacher_sees_all_student_work_on_work_page(): void
    {
        $response = $this->actingAs($this->teacher)->get(route('teacher.modules.work', $this->module));

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Teacher/Work/Index')
            ->has('students', 1)
            ->where('students.0.name', 'Andi Pratama')
            ->has('students.0.rows', 2)
            ->where('students.0.rows.0.live.summary', 'Opsi A: Mengukur tekanan manifold')
            ->where('students.0.rows.0.live.correct', true)
            ->where('students.0.rows.1.live.can_grade', true)
            ->where('students.0.rows.1.live.is_graded', false)
        );
    }

    public function test_teacher_can_grade_essay_manually_and_gradebook_updates(): void
    {
        $response = $this->actingAs($this->teacher)->post(
            route('teacher.responses.grade-manual', $this->essayResponse),
            ['score' => 15, 'feedback' => 'Analisis tepat.'],
        );

        $response->assertRedirect();
        $response->assertSessionHas('success');

        $this->essayResponse->refresh();
        $this->assertTrue($this->essayResponse->is_graded);
        $this->assertSame('15.00', (string) $this->essayResponse->earned_points);
        $this->assertSame('Analisis tepat.', $this->essayResponse->ai_feedback);

        $grade = ModuleGrade::query()
            ->where('module_id', $this->module->id)
            ->where('student_id', $this->student->id)
            ->first();
        $this->assertNotNull($grade);
        $this->assertSame(ModuleGrade::STATUS_GRADED, $grade->status);
    }

    public function test_manual_grade_rejects_score_above_block_points(): void
    {
        $this->actingAs($this->teacher)->post(
            route('teacher.responses.grade-manual', $this->essayResponse),
            ['score' => 25],
        )->assertSessionHasErrors('score');

        $this->assertFalse($this->essayResponse->fresh()->is_graded);
    }

    public function test_teacher_can_grade_essay_with_ai_synchronously(): void
    {
        Http::fake([
            '*chat/completions' => Http::response($this->chatResponse(json_encode([
                'g' => [['sid' => $this->student->id, 'pts' => 18, 'fb' => 'Tepat dan lengkap.']],
            ]))),
        ]);

        $response = $this->actingAs($this->teacher)->post(
            route('teacher.responses.grade-ai', $this->essayResponse),
        );

        $response->assertRedirect();
        $response->assertSessionHas('success');

        $this->essayResponse->refresh();
        $this->assertTrue($this->essayResponse->is_graded);
        $this->assertSame('18.00', (string) $this->essayResponse->earned_points);
    }

    public function test_ai_grade_failure_reports_error_and_keeps_pending(): void
    {
        Http::fake([
            '*chat/completions' => Http::response('gateway error', 502),
        ]);

        $response = $this->actingAs($this->teacher)->post(
            route('teacher.responses.grade-ai', $this->essayResponse),
        );

        $response->assertRedirect();
        $response->assertSessionHas('error');
        $this->assertFalse($this->essayResponse->fresh()->is_graded);
    }

    public function test_other_teacher_cannot_open_work_page_or_grade(): void
    {
        $other = User::factory()->create(['role' => User::ROLE_TEACHER]);

        $this->actingAs($other)->get(route('teacher.modules.work', $this->module))->assertForbidden();

        $this->actingAs($other)->post(
            route('teacher.responses.grade-manual', $this->essayResponse),
            ['score' => 10],
        )->assertForbidden();

        $this->assertFalse($this->essayResponse->fresh()->is_graded);
    }
}
