<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\Department;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use App\Services\QuestionImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;
use ZipArchive;

class QuestionImportTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private LearningModule $module;

    protected function setUp(): void
    {
        parent::setUp();

        $this->teacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
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
        $assignment = TeachingAssignment::factory()->create([
            'teacher_id' => $this->teacher->id,
            'subject_id' => $subject->id,
            'classroom_id' => $classroom->id,
        ]);
        $this->module = LearningModule::factory()->create([
            'teaching_assignment_id' => $assignment->id,
            'title' => 'Diagnosa PGM-FI',
        ]);
    }

    private function importUrl(): string
    {
        return route('teacher.modules.blocks.import', $this->module);
    }

    private function sampleText(): string
    {
        return <<<'TXT'
        Bank Soal Kelistrikan

        1. Apa fungsi sensor MAP?
        A. Mengukur tekanan manifold
        B. Mengukur suhu oli
        Kunci: A
        Pembahasan: Sensor MAP mengukur tekanan intake.

        2. Ibu kota Jawa Barat adalah ___.
        Kunci: Bandung

        3. Tegangan aki normal adalah 24 volt.
        A. Benar
        B. Salah
        Kunci: B

        4. Jelaskan prosedur memeriksa sekring putus!

        5. Soal tanpa kunci yang valid
        A. Satu
        B. Dua
        TXT;
    }

    private function makeDocx(string $text): UploadedFile
    {
        $paragraphs = '';
        foreach (explode("\n", $text) as $line) {
            $paragraphs .= '<w:p><w:r><w:t xml:space="preserve">'
                .htmlspecialchars($line, ENT_XML1, 'UTF-8')
                .'</w:t></w:r></w:p>';
        }

        $xml = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
            .$paragraphs
            .'</w:body></w:document>';

        $path = tempnam(sys_get_temp_dir(), 'impor-soal-').'.docx';
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $zip->addFromString('word/document.xml', $xml);
        $zip->close();

        return new UploadedFile($path, 'bank-soal.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', null, true);
    }

    private function makeRtf(string $rtf): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'impor-soal-').'.rtf';
        file_put_contents($path, $rtf);

        return new UploadedFile($path, 'bank-soal.rtf', 'application/rtf', null, true);
    }

    public function test_teacher_can_import_questions_from_docx(): void
    {
        $response = $this->actingAs($this->teacher)->post($this->importUrl(), [
            'file' => $this->makeDocx($this->sampleText()),
        ]);

        $response->assertCreated();
        $response->assertJsonPath('imported', 4);
        $response->assertJsonPath('skipped', 1);

        $blocks = $this->module->blocks()->orderBy('order_index')->get();
        $this->assertSame(
            ['soal_mcq', 'soal_fillblank', 'soal_truefalse', 'soal_essay_ai'],
            $blocks->pluck('block_type')->all(),
        );

        $mcq = $blocks[0];
        $this->assertSame('Apa fungsi sensor MAP?', $mcq->content['question']);
        $this->assertTrue($mcq->content['options'][0]['correct']);
        $this->assertFalse($mcq->content['options'][1]['correct']);
        $this->assertSame('Sensor MAP mengukur tekanan intake.', $mcq->content['explanation']);
        $this->assertSame(10, $mcq->points);

        $this->assertSame(['Bandung'], $blocks[1]->content['answers']);
        $this->assertFalse($blocks[2]->content['answer']);
    }

    public function test_teacher_can_import_questions_from_rtf_template_round_trip(): void
    {
        $service = app(QuestionImportService::class);

        $response = $this->actingAs($this->teacher)->post($this->importUrl(), [
            'file' => $this->makeRtf($service->templateRtf()),
        ]);

        $response->assertCreated();
        $response->assertJsonPath('imported', 4);
        $response->assertJsonPath('skipped', 0);
        $this->assertSame(4, $this->module->blocks()->count());
    }

    public function test_import_rejects_legacy_doc_and_unparseable_files(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'impor-soal-').'.doc';
        file_put_contents($path, 'bukan docx');
        $doc = new UploadedFile($path, 'lama.doc', 'application/msword', null, true);

        $this->actingAs($this->teacher)->postJson($this->importUrl(), ['file' => $doc])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('file');

        $this->actingAs($this->teacher)->postJson($this->importUrl(), [
            'file' => $this->makeRtf('{\rtf1\ansi Tidak ada soal di sini.}'),
        ])->assertUnprocessable()->assertJsonValidationErrors('file');

        $this->assertSame(0, $this->module->blocks()->count());
    }

    public function test_other_teacher_cannot_import_into_foreign_module(): void
    {
        $other = User::factory()->create(['role' => User::ROLE_TEACHER]);

        $this->actingAs($other)->post($this->importUrl(), [
            'file' => $this->makeDocx($this->sampleText()),
        ])->assertForbidden();

        $this->assertSame(0, $this->module->blocks()->count());
    }

    public function test_template_download_returns_rtf_file(): void
    {
        $response = $this->actingAs($this->teacher)
            ->get(route('teacher.modules.blocks.import.template', $this->module));

        $response->assertOk();
        $response->assertHeader('content-type', 'application/rtf');
        $this->assertStringContainsString('TEMPLATE IMPOR SOAL', $response->getContent());
    }
}
