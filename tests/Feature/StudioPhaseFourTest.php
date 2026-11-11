<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\ClassroomStudent;
use App\Models\Department;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Models\StudentResponse;
use App\Models\Submission;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class StudioPhaseFourTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $otherTeacher;

    private User $student;

    private LearningModule $module;

    protected function setUp(): void
    {
        parent::setUp();

        $year = AcademicYear::factory()->create(['is_active' => true, 'semester' => 'ganjil']);

        $this->teacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
        $this->otherTeacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
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
            'title' => 'Praktik Pengukuran',
            'status' => LearningModule::STATUS_PUBLISHED,
        ]);
    }

    private function blocksUrl(): string
    {
        return '/teacher/modules/'.$this->module->id.'/blocks';
    }

    public function test_teacher_can_create_practice_blocks(): void
    {
        $checklist = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), [
            'block_type' => 'praktik_checklist',
            'points' => 0,
            'content' => [
                'title' => 'Checklist Keselamatan',
                'instructions' => 'Centang saat praktik.',
                'steps' => [
                    ['label' => 'Pakai APD', 'require_photo' => false],
                    ['label' => 'Periksa alat', 'require_photo' => true],
                ],
            ],
        ]);

        $checklist->assertCreated();
        $checklist->assertJsonPath('block.block_type', 'praktik_checklist');

        $tugas = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), [
            'block_type' => 'tugas_upload',
            'points' => 100,
            'content' => [
                'title' => 'Video Praktik Jangka Sorong',
                'instructions' => 'Unggah video praktikmu.',
                'max_files' => 2,
                'accept' => 'video',
                'rubric' => [
                    ['criterion' => 'Ketepatan prosedur', 'max_score' => 40],
                    ['criterion' => 'Hasil akhir', 'max_score' => 60],
                ],
            ],
        ]);

        $tugas->assertCreated();
        $tugas->assertJsonPath('block.block_type', 'tugas_upload');
    }

    public function test_practice_block_validation_rejects_bad_content(): void
    {
        $tooFewSteps = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), [
            'block_type' => 'praktik_checklist',
            'points' => 0,
            'content' => [
                'title' => 'Checklist',
                'steps' => [['label' => 'Satu-satunya langkah', 'require_photo' => false]],
            ],
        ]);
        $tooFewSteps->assertUnprocessable();

        $emptyRubric = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), [
            'block_type' => 'tugas_upload',
            'points' => 100,
            'content' => [
                'title' => 'Tugas',
                'max_files' => 3,
                'accept' => 'file',
                'rubric' => [],
            ],
        ]);
        $emptyRubric->assertUnprocessable();

        $tooManyFiles = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), [
            'block_type' => 'tugas_upload',
            'points' => 100,
            'content' => [
                'title' => 'Tugas',
                'max_files' => 9,
                'accept' => 'file',
                'rubric' => [['criterion' => 'Hasil', 'max_score' => 10]],
            ],
        ]);
        $tooManyFiles->assertUnprocessable();
    }

    public function test_student_can_upload_file_and_teacher_cannot(): void
    {
        Storage::fake('public');

        $response = $this->actingAs($this->student)->post(
            route('student.uploads.store'),
            ['file' => UploadedFile::fake()->image('foto-praktik.jpg')],
        );

        $response->assertOk();
        $response->assertJsonStructure(['url', 'name', 'size']);
        $this->assertStringStartsWith(
            '/storage/student-uploads/'.$this->student->id.'/',
            $response->json('url'),
        );

        $path = str_replace('/storage/', '', $response->json('url'));
        Storage::disk('public')->assertExists($path);

        $teacherAttempt = $this->actingAs($this->teacher)->post(
            route('student.uploads.store'),
            ['file' => UploadedFile::fake()->image('guru.jpg')],
            ['Accept' => 'application/json'],
        );
        $this->assertContains($teacherAttempt->status(), [403, 422]);

        $badType = $this->actingAs($this->student)->post(
            route('student.uploads.store'),
            ['file' => UploadedFile::fake()->create('program.exe', 4, 'application/octet-stream')],
            ['Accept' => 'application/json'],
        );
        $badType->assertUnprocessable();
    }

    public function test_checklist_completes_only_when_all_steps_and_required_photos_done(): void
    {
        $checklist = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 0,
            'block_type' => ModuleBlock::BLOCK_PRAKTIK_CHECKLIST,
            'points' => 0,
            'content' => [
                'title' => 'Checklist Praktik',
                'instructions' => '',
                'steps' => [
                    ['label' => 'Pakai APD', 'require_photo' => false],
                    ['label' => 'Periksa alat', 'require_photo' => true],
                    ['label' => 'Bersihkan area', 'require_photo' => false],
                ],
            ],
        ]);

        $answerUrl = route('student.practice.answer', $this->module);

        // Sebagian tercentang → tersimpan tapi belum selesai.
        $partial = $this->actingAs($this->student)->postJson($answerUrl, [
            'block_id' => $checklist->id,
            'answer' => ['checked' => [0, 2], 'photos' => []],
        ]);
        $partial->assertOk();
        $partial->assertJsonPath('percent', 0);
        $partial->assertJsonPath('completed_blocks', []);

        // Semua tercentang tapi foto wajib belum ada → tetap belum selesai.
        $noPhoto = $this->actingAs($this->student)->postJson($answerUrl, [
            'block_id' => $checklist->id,
            'answer' => ['checked' => [0, 1, 2], 'photos' => []],
        ]);
        $noPhoto->assertOk();
        $noPhoto->assertJsonPath('percent', 0);
        $noPhoto->assertJsonPath('completed_blocks', []);

        // Lengkap: semua tercentang + foto wajib → selesai, modul tuntas.
        $photoUrl = '/storage/student-uploads/'.$this->student->id.'/bukti.jpg';
        $full = $this->actingAs($this->student)->postJson($answerUrl, [
            'block_id' => $checklist->id,
            'answer' => ['checked' => [0, 1, 2], 'photos' => ['1' => $photoUrl]],
        ]);
        $full->assertOk();
        $full->assertJsonPath('percent', 100);
        $full->assertJsonPath('completed_blocks', [$checklist->id]);
        $this->assertNotNull($full->json('completed_at'));
    }

    public function test_assignment_flow_submit_grade_and_gradebook_response(): void
    {
        $tugas = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 0,
            'block_type' => ModuleBlock::BLOCK_TUGAS_UPLOAD,
            'points' => 100,
            'content' => [
                'title' => 'Video Praktik',
                'instructions' => 'Unggah videomu.',
                'max_files' => 2,
                'accept' => 'video',
                'rubric' => [
                    ['criterion' => 'Ketepatan prosedur', 'max_score' => 40],
                    ['criterion' => 'Hasil akhir', 'max_score' => 60],
                ],
            ],
        ]);

        $submitUrl = route('student.practice.submission', $this->module);
        $ownFile = [
            'name' => 'praktik.mp4',
            'url' => '/storage/student-uploads/'.$this->student->id.'/praktik.mp4',
            'size' => 2048,
        ];

        // Berkas milik siswa lain ditolak.
        $foreign = $this->actingAs($this->student)->postJson($submitUrl, [
            'block_id' => $tugas->id,
            'files' => [[
                'name' => 'curi.mp4',
                'url' => '/storage/student-uploads/99999/curi.mp4',
                'size' => 10,
            ]],
        ]);
        $foreign->assertUnprocessable();
        $this->assertDatabaseCount('submissions', 0);

        // Kumpulkan dengan berkas sendiri.
        $submitted = $this->actingAs($this->student)->postJson($submitUrl, [
            'block_id' => $tugas->id,
            'files' => [$ownFile],
            'note' => 'Selesai, Bu.',
        ]);
        $submitted->assertOk();
        $submitted->assertJsonPath('submission.status', 'submitted');
        $submitted->assertJsonPath('percent', 100);

        $submission = Submission::query()->firstOrFail();
        $this->assertSame($this->student->id, $submission->student_id);
        $this->assertSame('submitted', $submission->status);

        // Guru pemilik membuka halaman pengumpulan dan melihat submission.
        $index = $this->actingAs($this->teacher)->get(
            route('teacher.modules.submissions.index', $this->module),
        );
        $index->assertOk();
        $index->assertInertia(fn (Assert $page) => $page
            ->component('Teacher/Submissions/Index')
            ->has('blocks', 1)
            ->has('blocks.0.submissions', 1)
            ->where('blocks.0.submissions.0.student_name', 'Andi Pratama')
            ->where('blocks.0.submissions.0.status', 'submitted')
        );

        // Guru bukan pemilik ditolak.
        $this->actingAs($this->otherTeacher)->get(
            route('teacher.modules.submissions.index', $this->module),
        )->assertForbidden();

        // Nilai rubrik: 30/40 + 60/60 = 90 dari 100 → skor 90%.
        $graded = $this->actingAs($this->teacher)->post(
            route('teacher.modules.submissions.grade', [$this->module, $submission]),
            ['rubric_scores' => [30, 60], 'feedback' => 'Bagus, lanjutkan.'],
        );
        $graded->assertRedirect();
        $graded->assertSessionHas('success');

        $submission->refresh();
        $this->assertSame('graded', $submission->status);
        $this->assertEquals(90.0, $submission->score);
        $this->assertEquals([30, 60], $submission->rubric_scores);
        $this->assertSame($this->teacher->id, $submission->graded_by);

        // Nilai masuk buku nilai: StudentResponse earned = 90% × 100 poin.
        $response = StudentResponse::query()
            ->where('module_block_id', $tugas->id)
            ->where('student_id', $this->student->id)
            ->first();

        $this->assertNotNull($response);
        $this->assertTrue($response->is_graded);
        $this->assertEquals(90.0, (float) $response->earned_points);
        $this->assertSame($submission->id, $response->answer_payload['submission_id']);

        // Siswa melihat status dinilai + skor di halaman practice.
        $practice = $this->actingAs($this->student)->get(route('student.practice.show', $this->module));
        $practice->assertOk();
        $practice->assertInertia(fn (Assert $page) => $page
            ->component('Student/Practice/Show')
            ->where('submissions.'.$tugas->id.'.status', 'graded')
            ->where('submissions.'.$tugas->id.'.feedback', 'Bagus, lanjutkan.')
        );
    }

    public function test_grade_rejects_scores_outside_rubric_bounds(): void
    {
        $tugas = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 0,
            'block_type' => ModuleBlock::BLOCK_TUGAS_UPLOAD,
            'points' => 50,
            'content' => [
                'title' => 'Tugas',
                'instructions' => '',
                'max_files' => 3,
                'accept' => 'file',
                'rubric' => [['criterion' => 'Hasil', 'max_score' => 10]],
            ],
        ]);

        $submission = Submission::create([
            'module_block_id' => $tugas->id,
            'student_id' => $this->student->id,
            'files' => [['name' => 'a.pdf', 'url' => '/storage/student-uploads/'.$this->student->id.'/a.pdf', 'size' => 1]],
            'status' => Submission::STATUS_SUBMITTED,
        ]);

        $response = $this->actingAs($this->teacher)->post(
            route('teacher.modules.submissions.grade', [$this->module, $submission]),
            ['rubric_scores' => [99], 'feedback' => ''],
        );

        $response->assertSessionHasErrors('rubric_scores');
        $this->assertSame('submitted', $submission->fresh()->status);
        $this->assertDatabaseCount('student_responses', 0);
    }
}
