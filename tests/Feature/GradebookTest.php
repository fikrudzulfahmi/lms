<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\ClassroomStudent;
use App\Models\Department;
use App\Models\LearningModule;
use App\Models\LearningObjective;
use App\Models\ModuleBlock;
use App\Models\ModuleGrade;
use App\Models\StudentResponse;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use App\Services\GradeCalculationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class GradebookTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $otherTeacher;

    private User $admin;

    private User $studentA;

    private User $studentB;

    private AcademicYear $year;

    private Classroom $classroom;

    private Subject $subject;

    private TeachingAssignment $assignment;

    private LearningModule $moduleFormatif;

    private LearningModule $moduleSumatifLingkup;

    private LearningModule $moduleSumatifAkhir;

    protected function setUp(): void
    {
        parent::setUp();

        $this->teacher = User::factory()->create(['role' => User::ROLE_TEACHER, 'name' => 'Budi Santoso']);
        $this->otherTeacher = User::factory()->create(['role' => User::ROLE_TEACHER, 'name' => 'Guru Lain']);
        $this->admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        $this->year = AcademicYear::create(['name' => '2026/2027', 'semester' => 'ganjil', 'is_active' => true]);
        $department = Department::factory()->create(['code' => 'TSM', 'name' => 'Teknik Sepeda Motor']);
        $this->classroom = Classroom::create([
            'department_id' => $department->id,
            'grade_level' => 'XI',
            'name' => 'XI TSM 1',
        ]);
        $this->subject = Subject::create([
            'department_id' => $department->id,
            'code' => 'PLPK-TSM',
            'name' => 'Pemeliharaan Kelistrikan Sepeda Motor',
            'category' => Subject::CATEGORY_KEJURUAN,
        ]);

        $this->assignment = TeachingAssignment::create([
            'academic_year_id' => $this->year->id,
            'teacher_id' => $this->teacher->id,
            'subject_id' => $this->subject->id,
            'classroom_id' => $this->classroom->id,
        ]);

        $this->studentA = User::factory()->create([
            'role' => User::ROLE_STUDENT,
            'name' => 'Ahmad Fauzi',
            'nisn' => '1112223334',
            'username' => 'NISN1112223334',
        ]);
        $this->studentB = User::factory()->create([
            'role' => User::ROLE_STUDENT,
            'name' => 'Bella Putri',
            'nisn' => '9998887776',
            'username' => 'NISN9998887776',
        ]);

        foreach ([$this->studentA, $this->studentB] as $student) {
            ClassroomStudent::create([
                'academic_year_id' => $this->year->id,
                'classroom_id' => $this->classroom->id,
                'student_id' => $student->id,
            ]);
        }

        $objective1 = LearningObjective::create([
            'subject_id' => $this->subject->id,
            'teacher_id' => $this->teacher->id,
            'grade_level' => 'XI',
            'code' => 'TP-1.1',
            'description' => 'Mendiagnosis gangguan komponen sensor sistem injeksi PGM-FI sesuai SOP.',
        ]);
        $objective2 = LearningObjective::create([
            'subject_id' => $this->subject->id,
            'teacher_id' => $this->teacher->id,
            'grade_level' => 'XI',
            'code' => 'TP-1.2',
            'description' => 'Memahami prosedur perawatan berkala sistem kelistrikan.',
        ]);
        $objective3 = LearningObjective::create([
            'subject_id' => $this->subject->id,
            'teacher_id' => $this->teacher->id,
            'grade_level' => 'XI',
            'code' => 'TP-1.3',
            'description' => 'Melakukan pengukuran tegangan dan tahanan komponen kelistrikan.',
        ]);

        $this->moduleFormatif = LearningModule::create([
            'teaching_assignment_id' => $this->assignment->id,
            'learning_objective_id' => $objective1->id,
            'title' => 'Kuis Diagnosa Sensor',
            'assessment_type' => LearningModule::ASSESSMENT_FORMATIF,
            'kktp_score' => 75,
            'status' => LearningModule::STATUS_PUBLISHED,
        ]);
        $this->moduleSumatifLingkup = LearningModule::create([
            'teaching_assignment_id' => $this->assignment->id,
            'learning_objective_id' => $objective2->id,
            'title' => 'Sumatif Perawatan Berkala',
            'assessment_type' => LearningModule::ASSESSMENT_SUMATIF_LINGKUP,
            'kktp_score' => 80,
            'status' => LearningModule::STATUS_PUBLISHED,
        ]);
        $this->moduleSumatifAkhir = LearningModule::create([
            'teaching_assignment_id' => $this->assignment->id,
            'learning_objective_id' => $objective3->id,
            'title' => 'Sumatif Akhir Semester',
            'assessment_type' => LearningModule::ASSESSMENT_SUMATIF_AKHIR,
            'kktp_score' => 75,
            'status' => LearningModule::STATUS_PUBLISHED,
        ]);

        $blocksFormatif = [
            $this->makeBlock($this->moduleFormatif, 1, ModuleBlock::BLOCK_SOAL_MCQ, 10),
            $this->makeBlock($this->moduleFormatif, 2, ModuleBlock::BLOCK_SOAL_MCQ, 10),
        ];
        $blocksSumatifLingkup = [
            $this->makeBlock($this->moduleSumatifLingkup, 1, ModuleBlock::BLOCK_SOAL_ESSAY_AI, 20),
        ];
        $blocksSumatifAkhir = [
            $this->makeBlock($this->moduleSumatifAkhir, 1, ModuleBlock::BLOCK_SOAL_MCQ, 10),
        ];

        // Deterministik: M1 100/75, M2 50/90, M3 80/60 (siswa A / siswa B).
        $this->answer($blocksFormatif[0], $this->studentA, 10);
        $this->answer($blocksFormatif[1], $this->studentA, 10);
        $this->answer($blocksSumatifLingkup[0], $this->studentA, 10);
        $this->answer($blocksSumatifAkhir[0], $this->studentA, 8);

        $this->answer($blocksFormatif[0], $this->studentB, 8);
        $this->answer($blocksFormatif[1], $this->studentB, 7);
        $this->answer($blocksSumatifLingkup[0], $this->studentB, 18);
        $this->answer($blocksSumatifAkhir[0], $this->studentB, 6);
    }

    private function makeBlock(LearningModule $module, int $order, string $type, int $points): ModuleBlock
    {
        return ModuleBlock::create([
            'module_id' => $module->id,
            'order_index' => $order,
            'block_type' => $type,
            'points' => $points,
            'content' => ['question' => 'Soal '.$order],
        ]);
    }

    private function answer(ModuleBlock $block, User $student, float $earned): void
    {
        StudentResponse::create([
            'module_block_id' => $block->id,
            'student_id' => $student->id,
            'earned_points' => $earned,
            'is_graded' => true,
            'answer_payload' => ['choice' => 'A'],
        ]);
    }

    private function service(): GradeCalculationService
    {
        return app(GradeCalculationService::class);
    }

    public function test_weighted_final_score_and_kktp_status_are_correct(): void
    {
        $matrix = $this->service()->gradebook($this->assignment);

        $this->assertSame(['TP-1.1', 'TP-1.2', 'TP-1.3'], array_column($matrix['columns'], 'code'));

        $byName = collect($matrix['students'])->keyBy('name');

        // A: 100*.30 + 50*.30 + 80*.40 = 77.00 (tuntas, KKTP 75)
        $this->assertEquals(77.0, $byName['Ahmad Fauzi']['final_score']);
        $this->assertSame(GradeCalculationService::STATUS_TUNTAS, $byName['Ahmad Fauzi']['status']);

        // B: 75*.30 + 90*.30 + 60*.40 = 73.50 (belum tuntas)
        $this->assertEquals(73.5, $byName['Bella Putri']['final_score']);
        $this->assertSame(GradeCalculationService::STATUS_BELUM, $byName['Bella Putri']['status']);

        $this->assertEquals(100.0, $byName['Ahmad Fauzi']['cells']['tp-'.$this->moduleFormatif->learning_objective_id]['score']);
        $this->assertEquals(50.0, $byName['Ahmad Fauzi']['cells']['tp-'.$this->moduleSumatifLingkup->learning_objective_id]['score']);

        $this->assertSame(2, $matrix['summary']['students']);
        $this->assertSame(1, $matrix['summary']['tuntas']);
        $this->assertSame(1, $matrix['summary']['belum']);
        $this->assertEquals(75.25, $matrix['summary']['average']);
    }

    public function test_module_recalculation_is_idempotent_and_applies_module_kktp(): void
    {
        $count = $this->service()->recalculateAssignment($this->assignment);
        $this->assertSame(6, $count);

        $this->service()->recalculateAssignment($this->assignment);
        $this->assertSame(6, ModuleGrade::query()->count());

        $lingkupA = ModuleGrade::query()
            ->where('module_id', $this->moduleSumatifLingkup->id)
            ->where('student_id', $this->studentA->id)
            ->first();

        $this->assertEquals(50.0, (float) $lingkupA->final_score);
        $this->assertFalse($lingkupA->is_passed);

        $akhirA = ModuleGrade::query()
            ->where('module_id', $this->moduleSumatifAkhir->id)
            ->where('student_id', $this->studentA->id)
            ->first();

        $this->assertEquals(80.0, (float) $akhirA->final_score);
        $this->assertTrue($akhirA->is_passed);
    }

    public function test_kktp_threshold_is_configurable(): void
    {
        config(['lms.kktp.default' => 60]);

        $matrix = $this->service()->gradebook($this->assignment);
        $byName = collect($matrix['students'])->keyBy('name');

        $this->assertSame(GradeCalculationService::STATUS_TUNTAS, $byName['Bella Putri']['status']);
        $this->assertSame(60.0, (float) $matrix['summary']['kktp']);
    }

    public function test_teacher_gradebook_index_renders_matrix_props(): void
    {
        $this->actingAs($this->teacher)
            ->get('/teacher/gradebook')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Teacher/Gradebook/Index')
                ->where('has_assignments', true)
                ->where('filters.classroom', $this->classroom->id)
                ->where('filters.subject', $this->subject->id)
                ->has('matrix.columns', 3)
                ->has('matrix.students', 2)
                ->where('matrix.students.0.name', 'Ahmad Fauzi')
                ->where('matrix.students.0.final_score', fn ($value) => (float) $value === 77.0)
                ->where('matrix.students.1.status', 'belum')
                ->has('options.classrooms', 1)
                ->has('options.subjects', 1)
                ->has('options.years', 1));
    }

    public function test_teacher_detail_page_and_student_drawer_payload(): void
    {
        $this->actingAs($this->teacher)
            ->get("/teacher/gradebook/{$this->classroom->id}/{$this->subject->id}")
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Teacher/Gradebook/Show')
                ->has('matrix.students', 2)
                ->where('matrix.assignment.classroom', 'XI TSM 1')
                ->where('matrix.assignment.subject_code', 'PLPK-TSM'));

        $response = $this->actingAs($this->teacher)
            ->getJson("/teacher/gradebook/{$this->classroom->id}/{$this->subject->id}/students/{$this->studentA->id}");

        $response->assertOk()
            ->assertJsonPath('student.name', 'Ahmad Fauzi')
            ->assertJsonPath('final_score', 77)
            ->assertJsonCount(3, 'modules')
            ->assertJsonPath('modules.0.blocks.0.answer.choice', 'A');

        $this->assertStringContainsString('Menguasai', $response->json('description'));
        $this->assertStringContainsString('Perlu pendampingan', $response->json('description'));
    }

    public function test_override_changes_effective_score_and_records_audit_trail(): void
    {
        $this->service()->recalculateAssignment($this->assignment);

        $before = $this->service()->gradebook($this->assignment);
        $this->assertEquals(77.0, collect($before['students'])->firstWhere('name', 'Ahmad Fauzi')['final_score']);

        $this->actingAs($this->teacher)
            ->patch("/teacher/gradebook/modules/{$this->moduleSumatifLingkup->id}/students/{$this->studentA->id}/override", [
                'score' => 95,
                'reason' => 'Koreksi jawaban esai nomor 3 sesuai rubrik.',
            ])
            ->assertRedirect();

        $grade = ModuleGrade::query()
            ->where('module_id', $this->moduleSumatifLingkup->id)
            ->where('student_id', $this->studentA->id)
            ->firstOrFail();

        $this->assertEquals(95.0, (float) $grade->override_score);
        $this->assertSame('Koreksi jawaban esai nomor 3 sesuai rubrik.', $grade->override_reason);
        $this->assertSame($this->teacher->id, $grade->overridden_by);
        $this->assertNotNull($grade->overridden_at);
        // Nilai sistem tetap tersimpan sebagai pembanding.
        $this->assertEquals(50.0, (float) $grade->final_score);

        $after = $this->service()->gradebook($this->assignment);
        // 100*.30 + 95*.30 + 80*.40 = 90.50
        $this->assertEquals(90.5, collect($after['students'])->firstWhere('name', 'Ahmad Fauzi')['final_score']);

        $this->actingAs($this->teacher)
            ->get("/teacher/gradebook/{$this->classroom->id}/{$this->subject->id}")
            ->assertInertia(fn (Assert $page) => $page
                ->where('matrix.students.0.final_score', fn ($value) => (float) $value === 90.5)
                ->where('matrix.students.0.status', 'tuntas'));
    }

    public function test_override_requires_reason_and_valid_score(): void
    {
        $url = "/teacher/gradebook/modules/{$this->moduleFormatif->id}/students/{$this->studentA->id}/override";

        $this->actingAs($this->teacher)
            ->patch($url, ['score' => 90, 'reason' => ''])
            ->assertSessionHasErrors('reason');

        $this->actingAs($this->teacher)
            ->patch($url, ['score' => 150, 'reason' => 'Alasan cukup panjang.'])
            ->assertSessionHasErrors('score');

        $this->assertSame(0, ModuleGrade::query()->whereNotNull('override_score')->count());
    }

    public function test_other_teacher_cannot_view_or_override_grades(): void
    {
        $this->actingAs($this->otherTeacher)
            ->get("/teacher/gradebook/{$this->classroom->id}/{$this->subject->id}")
            ->assertForbidden();

        $this->actingAs($this->otherTeacher)
            ->patch("/teacher/gradebook/modules/{$this->moduleFormatif->id}/students/{$this->studentA->id}/override", [
                'score' => 100,
                'reason' => 'Percobaan override tanpa hak.',
            ])
            ->assertForbidden();

        $this->actingAs($this->otherTeacher)
            ->get('/teacher/gradebook')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('has_assignments', false));

        $this->assertSame(0, ModuleGrade::query()->whereNotNull('override_score')->count());
    }

    public function test_student_cannot_access_teacher_gradebook(): void
    {
        $this->actingAs($this->studentA)->get('/teacher/gradebook')->assertForbidden();
        $this->actingAs($this->studentA)->get('/teacher/gradebook/'.$this->classroom->id.'/'.$this->subject->id)->assertForbidden();
    }

    public function test_admin_can_view_all_gradebook_pages(): void
    {
        $this->actingAs($this->admin)
            ->get("/teacher/gradebook/{$this->classroom->id}/{$this->subject->id}")
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Teacher/Gradebook/Show'));

        $this->actingAs($this->admin)
            ->get("/teacher/gradebook/{$this->classroom->id}/{$this->subject->id}/export")
            ->assertOk();
    }

    public function test_csv_export_has_bom_headers_and_student_rows(): void
    {
        $response = $this->actingAs($this->teacher)
            ->get("/teacher/gradebook/{$this->classroom->id}/{$this->subject->id}/export");

        $response->assertOk();
        $this->assertStringContainsString('text/csv', (string) $response->headers->get('content-type'));
        $this->assertStringContainsString('attachment', (string) $response->headers->get('content-disposition'));
        $this->assertStringContainsString('xi-tsm-1', (string) $response->headers->get('content-disposition'));
        $this->assertStringContainsString('plpk-tsm', (string) $response->headers->get('content-disposition'));
        $this->assertStringContainsString('2026-2027', (string) $response->headers->get('content-disposition'));

        $csv = $response->streamedContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);

        $lines = explode("\n", trim(substr($csv, 3)));

        $this->assertSame(
            ['No', 'NISN', 'Nama', 'TP-1.1', 'TP-1.2', 'TP-1.3', 'Nilai Akhir', 'Status KKTP', 'Deskripsi Capaian'],
            str_getcsv($lines[0]),
        );

        $rowA = str_getcsv($lines[1]);
        $this->assertSame(['1', '1112223334', 'Ahmad Fauzi', '100.00', '50.00', '80.00', '77.00', 'Tuntas'], array_slice($rowA, 0, 8));
        $this->assertStringContainsString('Menguasai', $rowA[8]);

        $rowB = str_getcsv($lines[2]);
        $this->assertSame(['2', '9998887776', 'Bella Putri', '75.00', '90.00', '60.00', '73.50', 'Belum Tuntas'], array_slice($rowB, 0, 8));
    }

    public function test_student_grades_page_is_scoped_to_logged_in_student(): void
    {
        $this->actingAs($this->studentA)
            ->get('/student/grades')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Student/Grades/Index')
                ->where('report.student.name', 'Ahmad Fauzi')
                ->has('report.subjects', 1)
                ->where('report.subjects.0.subject_code', 'PLPK-TSM')
                ->where('report.subjects.0.final_score', fn ($value) => (float) $value === 77.0)
                ->where('report.subjects.0.status', 'tuntas')
                ->has('report.subjects.0.objectives', 3)
                ->has('report.subjects.0.assessments', 3));

        $this->actingAs($this->studentB)
            ->get('/student/grades')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('report.student.nisn', '9998887776')
                ->where('report.subjects.0.final_score', fn ($value) => (float) $value === 73.5));

        $this->actingAs($this->teacher)->get('/student/grades')->assertForbidden();
    }
}
