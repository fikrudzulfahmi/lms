<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\ClassroomStudent;
use App\Models\Department;
use App\Models\LearningModule;
use App\Models\LiveSession;
use App\Models\ModuleBlock;
use App\Models\ModuleProgress;
use App\Models\StudentResponse;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Regresi isolasi antar siswa: pekerjaan siswa A tidak boleh membuat
 * siswa B terlihat sudah selesai/mengerjakan di permukaan mana pun.
 */
class CrossStudentIsolationTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $studentA;

    private User $studentB;

    private LearningModule $module;

    private ModuleBlock $material;

    private ModuleBlock $mcq;

    private ModuleBlock $assignment;

    protected function setUp(): void
    {
        parent::setUp();

        $year = AcademicYear::factory()->create(['is_active' => true, 'semester' => 'ganjil']);
        $this->teacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
        $this->studentA = User::factory()->create(['role' => User::ROLE_STUDENT, 'name' => 'Andi A']);
        $this->studentB = User::factory()->create(['role' => User::ROLE_STUDENT, 'name' => 'Budi B']);

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

        foreach ([$this->studentA, $this->studentB] as $student) {
            ClassroomStudent::create([
                'academic_year_id' => $year->id,
                'classroom_id' => $classroom->id,
                'student_id' => $student->id,
            ]);
        }

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

        $this->material = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 0,
            'block_type' => ModuleBlock::BLOCK_MATERI_TEKS,
            'points' => 0,
            'content' => ['title' => 'Pengantar', 'body' => 'Baca dulu.'],
        ]);

        $this->mcq = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 1,
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

        $this->assignment = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 2,
            'block_type' => ModuleBlock::BLOCK_TUGAS_UPLOAD,
            'points' => 10,
            'content' => [
                'title' => 'Foto praktik',
                'instructions' => 'Unggah foto.',
                'max_files' => 1,
                'accept' => 'image',
                'rubric' => [['criterion' => 'Kerapian', 'max_score' => 100]],
            ],
        ]);
    }

    private function studentACompletesPractice(): void
    {
        $this->actingAs($this->studentA)->postJson(
            route('student.practice.progress', $this->module),
            ['block_id' => $this->material->id],
        )->assertOk();

        $this->actingAs($this->studentA)->postJson(
            route('student.practice.answer', $this->module),
            ['block_id' => $this->mcq->id, 'answer' => ['option_index' => 0]],
        )->assertOk();
    }

    public function test_practice_progress_does_not_leak_to_other_student(): void
    {
        $this->studentACompletesPractice();

        // Siswa B membuka latihan yang sama: progres harus 0, tanpa jawaban A.
        $response = $this->actingAs($this->studentB)->get(route('student.practice.show', $this->module));
        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Student/Practice/Show')
            ->where('progress.percent', 0)
            ->where('progress.completed_blocks', [])
            ->where('progress.answers', [])
            ->where('progress.completed_at', null)
        );

        // Beranda B juga tidak boleh menampilkan chip tuntas milik A.
        $home = $this->actingAs($this->studentB)->get(route('student.home'));
        $home->assertOk();
        $home->assertInertia(function (Assert $page) {
            $progress = $page->toArray()['props']['practice_progress'] ?? [];
            $this->assertArrayNotHasKey($this->module->id, $progress);
        });

        // Dan B memang tidak punya baris progres di basis data.
        $this->assertSame(0, ModuleProgress::query()->where('student_id', $this->studentB->id)->count());
        $this->assertSame(1, ModuleProgress::query()->where('student_id', $this->studentA->id)->count());
    }

    public function test_sequential_lock_state_is_per_student(): void
    {
        $this->module->update(['sequential_lock' => true]);
        $this->studentACompletesPractice();

        // Bagi B, MCQ masih terkunci karena B belum menyelesaikan materi.
        $response = $this->actingAs($this->studentB)->get(route('student.practice.show', $this->module));
        $response->assertInertia(fn (Assert $page) => $page
            ->where('blocks.1.locked', true)
            ->where('blocks.1.content', [])
        );

        $this->actingAs($this->studentB)->postJson(
            route('student.practice.answer', $this->module),
            ['block_id' => $this->mcq->id, 'answer' => ['option_index' => 0]],
        )->assertUnprocessable();
    }

    public function test_live_room_responses_do_not_leak_to_other_student(): void
    {
        $session = app(\App\Services\LiveSessionService::class)->start($this->module);
        $session->update([
            'status' => LiveSession::STATUS_ACTIVE,
            'pin_code' => '123456',
            'current_block_id' => $this->mcq->id,
        ]);

        $this->actingAs($this->studentA)->postJson(
            route('student.live.respond', ['pin' => '123456']),
            ['block_id' => $this->mcq->id, 'answer' => ['option_index' => 0]],
        )->assertOk();

        $room = $this->actingAs($this->studentB)->get(route('student.live.room', ['pin' => '123456']));
        $room->assertOk();
        $room->assertInertia(fn (Assert $page) => $page
            ->component('Student/Live/Room')
            ->where('my_responses', [])
        );

        $this->assertSame(
            1,
            StudentResponse::query()->where('student_id', $this->studentA->id)->count(),
        );
        $this->assertSame(
            0,
            StudentResponse::query()->where('student_id', $this->studentB->id)->count(),
        );
    }

    public function test_submission_does_not_leak_to_other_student(): void
    {
        $this->actingAs($this->studentA)->postJson(
            route('student.practice.submission', $this->module),
            [
                'block_id' => $this->assignment->id,
                'files' => [['name' => 'foto.jpg', 'url' => '/storage/student-uploads/'.$this->studentA->id.'/foto.jpg', 'size' => 1234]],
                'note' => 'Punya A',
            ],
        )->assertOk();

        $response = $this->actingAs($this->studentB)->get(route('student.practice.show', $this->module));
        $response->assertInertia(fn (Assert $page) => $page
            ->where('submissions', [])
        );
    }

    public function test_exam_finish_does_not_leak_to_other_student(): void
    {
        $this->module->update(['exam_mode' => true]);

        $this->actingAs($this->studentA)->postJson(
            route('student.practice.answer', $this->module),
            ['block_id' => $this->mcq->id, 'answer' => ['option_index' => 0]],
        )->assertOk();
        $this->actingAs($this->studentA)->postJson(route('student.practice.finish', $this->module))->assertOk();

        $this->assertSame(
            0,
            StudentResponse::query()->where('student_id', $this->studentB->id)->count(),
        );

        $report = app(\App\Services\GradeCalculationService::class)->studentReport($this->studentB);
        $assessment = collect($report['subjects'])
            ->flatMap(fn ($subject) => $subject['assessments'])
            ->firstWhere('module_id', $this->module->id);
        $this->assertTrue($assessment === null || ($assessment['score'] ?? null) === null);
    }

    public function test_grades_and_gradebook_do_not_leak_to_other_student(): void
    {
        // A menjawab live sampai dapat nilai; B tidak boleh ikut punya nilai.
        $session = app(\App\Services\LiveSessionService::class)->start($this->module);
        $session->update([
            'status' => LiveSession::STATUS_ACTIVE,
            'pin_code' => '654321',
            'current_block_id' => $this->mcq->id,
        ]);

        $this->actingAs($this->studentA)->postJson(
            route('student.live.respond', ['pin' => '654321']),
            ['block_id' => $this->mcq->id, 'answer' => ['option_index' => 0]],
        )->assertOk();

        $this->actingAs($this->teacher)->postJson(route('teacher.live.end', $session))->assertOk();

        // Halaman Nilai B: tidak ada asesmen bernilai untuk modul ini.
        $reportB = app(\App\Services\GradeCalculationService::class)->studentReport($this->studentB);
        $assessmentB = collect($reportB['subjects'])
            ->flatMap(fn ($subject) => $subject['assessments'])
            ->firstWhere('module_id', $this->module->id);
        $this->assertNull($assessmentB);

        // Detail buku nilai untuk B: tidak ada jawaban A yang tercampur.
        $assignment = $this->module->teachingAssignment;
        $detail = $this->actingAs($this->teacher)->getJson(route('teacher.gradebook.student', [
            'classroom' => $assignment->classroom_id,
            'subject' => $assignment->subject_id,
            'student' => $this->studentB->id,
            'year' => $assignment->academic_year_id,
        ]));
        $detail->assertOk();
        $moduleDetail = collect($detail->json('modules') ?? $detail->json())
            ->firstWhere('id', $this->module->id);
        if ($moduleDetail !== null) {
            foreach ($moduleDetail['blocks'] ?? [] as $block) {
                $this->assertNull($block['response_id'] ?? null);
            }
        }
    }

    public function test_teacher_work_page_rows_are_per_student(): void
    {
        $this->studentACompletesPractice();

        $response = $this->actingAs($this->teacher)->get(route('teacher.modules.work', $this->module));
        $response->assertOk();
        $response->assertInertia(function (Assert $page) {
            $page->component('Teacher/Work/Index')->has('students', 2);

            $students = collect($page->toArray()['props']['students']);
            $budi = $students->firstWhere('name', 'Budi B');
            $andi = $students->firstWhere('name', 'Andi A');

            $this->assertNotNull($budi);
            $this->assertNull($budi['rows'][1]['practice']);
            $this->assertNotNull($andi['rows'][1]['practice']);
        });
    }
}
