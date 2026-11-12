<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\Department;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use App\Services\LiveSessionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StudioPhaseOneBlocksTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $otherTeacher;

    private LearningModule $module;

    protected function setUp(): void
    {
        parent::setUp();

        $this->teacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
        $this->otherTeacher = User::factory()->create(['role' => User::ROLE_TEACHER]);

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

    private function blocksUrl(?LearningModule $module = null): string
    {
        return '/teacher/modules/'.($module ?? $this->module)->id.'/blocks';
    }

    public function test_teacher_can_create_each_phase_one_block_type(): void
    {
        $payloads = [
            ModuleBlock::BLOCK_SECTION_HEADING => [
                'block_type' => 'section_heading',
                'points' => 0,
                'content' => ['title' => 'Pengenalan PGM-FI', 'body' => 'Bagian pembuka.'],
            ],
            ModuleBlock::BLOCK_MATERI_RICHTEXT => [
                'block_type' => 'materi_richtext',
                'points' => 0,
                'content' => ['title' => 'Dasar Teori', 'body' => "**Sensor** membaca *suhu*.\n\n- ECT\n- EOT"],
            ],
            ModuleBlock::BLOCK_MATERI_VIDEO => [
                'block_type' => 'materi_video',
                'points' => 0,
                'content' => [
                    'title' => 'Video Praktik',
                    'source' => 'youtube',
                    'url' => 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
                    'caption' => 'Perhatikan langkahnya.',
                ],
            ],
            ModuleBlock::BLOCK_MATERI_FILE => [
                'block_type' => 'materi_file',
                'points' => 0,
                'content' => [
                    'title' => 'Berkas Pendukung',
                    'files' => [
                        ['name' => 'LKPD.pdf', 'url' => '/storage/modules/x/lkpd.pdf', 'size' => 2048],
                    ],
                ],
            ],
            ModuleBlock::BLOCK_MATERI_EMBED => [
                'block_type' => 'materi_embed',
                'points' => 0,
                'content' => [
                    'title' => 'Referensi',
                    'url' => 'https://id.wikipedia.org',
                    'embed' => false,
                    'caption' => 'Bacaan tambahan.',
                ],
            ],
            ModuleBlock::BLOCK_SOAL_TRUEFALSE => [
                'block_type' => 'soal_truefalse',
                'points' => 10,
                'content' => [
                    'question' => 'Sensor ECT mengukur suhu cairan pendingin.',
                    'answer' => true,
                    'explanation' => 'Betul.',
                ],
            ],
            ModuleBlock::BLOCK_SOAL_FILLBLANK => [
                'block_type' => 'soal_fillblank',
                'points' => 10,
                'content' => [
                    'question' => 'Alat ukur tekanan bahan bakar disebut ___.',
                    'answers' => ['fuel pressure gauge', 'pengukur tekanan bahan bakar'],
                    'explanation' => '',
                ],
            ],
        ];

        foreach ($payloads as $type => $payload) {
            $response = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), $payload);

            $response->assertCreated();
            $response->assertJsonPath('block.block_type', $type);
        }

        $this->assertSame(7, $this->module->blocks()->count());

        $this->assertDatabaseHas('module_blocks', [
            'module_id' => $this->module->id,
            'block_type' => 'section_heading',
        ]);
        $this->assertDatabaseHas('module_blocks', [
            'module_id' => $this->module->id,
            'block_type' => 'soal_fillblank',
        ]);
    }

    public function test_richtext_and_teks_accept_formatting_and_inline_images(): void
    {
        // Toolbar format + sisip gambar di Studio menulis markdown ringan
        // ke body; server harus menerimanya apa adanya untuk kedua blok teks.
        $body = "## Komponen Starter\n\nStarter terdiri dari **motor starter** dan *solenoid*.\n\n"
            ."![Diagram sistem starter](https://lms.example/storage/modules/x/starter.png)\n\n"
            ."> Perhatian: lepaskan terminal negatif aki sebelum membongkar.\n\n"
            ."1. Periksa aki\n2. Periksa relay";

        foreach (['materi_richtext', 'materi_teks'] as $type) {
            $response = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), [
                'block_type' => $type,
                'points' => 0,
                'content' => ['title' => 'Sistem Starter', 'body' => $body],
            ]);

            $response->assertCreated();
            $this->assertSame($body, $response->json('block.content.body'));
        }

        // Unggah gambar untuk disisipkan: endpoint aset menerima berkas gambar.
        $upload = $this->actingAs($this->teacher)->postJson(
            '/teacher/modules/'.$this->module->id.'/blocks/upload',
            ['file' => \Illuminate\Http\UploadedFile::fake()->image('diagram-starter.png', 640, 480)],
        );
        $upload->assertOk()->assertJsonStructure(['url', 'name', 'size']);
        $this->assertStringEndsWith('.png', $upload->json('url'));
    }

    public function test_validation_rejects_incomplete_phase_one_blocks(): void
    {
        $cases = [
            'fillblank tanpa answers' => [
                'block_type' => 'soal_fillblank',
                'points' => 10,
                'content' => ['question' => 'Ibu kota Indonesia adalah ___.', 'answers' => []],
            ],
            'truefalse tanpa answer' => [
                'block_type' => 'soal_truefalse',
                'points' => 10,
                'content' => ['question' => 'Langit berwarna biru.'],
            ],
            'video tanpa url' => [
                'block_type' => 'materi_video',
                'points' => 0,
                'content' => ['source' => 'youtube', 'url' => ''],
            ],
            'video sumber tidak dikenal' => [
                'block_type' => 'materi_video',
                'points' => 0,
                'content' => ['source' => 'vimeo', 'url' => 'https://example.com/v.mp4'],
            ],
            'file tanpa files' => [
                'block_type' => 'materi_file',
                'points' => 0,
                'content' => ['title' => 'Kosong', 'files' => []],
            ],
            'section heading tanpa judul' => [
                'block_type' => 'section_heading',
                'points' => 0,
                'content' => ['title' => ''],
            ],
            'embed url bukan http' => [
                'block_type' => 'materi_embed',
                'points' => 0,
                'content' => ['url' => 'javascript:alert(1)'],
            ],
        ];

        foreach ($cases as $payload) {
            $response = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), $payload);
            $response->assertUnprocessable();
        }

        $this->assertSame(0, $this->module->blocks()->count());
    }

    public function test_live_grading_truefalse_and_fillblank(): void
    {
        $service = app(LiveSessionService::class);

        $trueFalse = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'block_type' => ModuleBlock::BLOCK_SOAL_TRUEFALSE,
            'points' => 10,
            'content' => ['question' => 'Sensor ECT mengukur suhu.', 'answer' => true, 'explanation' => ''],
        ]);

        $correct = $service->gradeAnswer($trueFalse, ['value' => true]);
        $this->assertTrue($correct['correct']);
        $this->assertTrue($correct['is_graded']);
        $this->assertSame(10.0, $correct['earned_points']);

        $wrong = $service->gradeAnswer($trueFalse, ['value' => false]);
        $this->assertFalse($wrong['correct']);
        $this->assertSame(0.0, $wrong['earned_points']);

        $missing = $service->gradeAnswer($trueFalse, []);
        $this->assertFalse($missing['correct']);

        $fillBlank = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'block_type' => ModuleBlock::BLOCK_SOAL_FILLBLANK,
            'points' => 8,
            'content' => [
                'question' => 'Alat ukur tekanan bahan bakar disebut ___.',
                'answers' => ['fuel pressure gauge'],
                'explanation' => '',
            ],
        ]);

        // Beda kapital + spasi berlebih tetap dinilai benar.
        $loose = $service->gradeAnswer($fillBlank, ['text' => '  Fuel   Pressure GAUGE ']);
        $this->assertTrue($loose['correct']);
        $this->assertSame(8.0, $loose['earned_points']);

        $other = $service->gradeAnswer($fillBlank, ['text' => 'multimeter']);
        $this->assertFalse($other['correct']);
        $this->assertSame(0.0, $other['earned_points']);

        $empty = $service->gradeAnswer($fillBlank, ['text' => '   ']);
        $this->assertFalse($empty['correct']);
    }

    public function test_teacher_can_upload_block_asset_and_other_teacher_cannot(): void
    {
        Storage::fake('public');

        $response = $this->actingAs($this->teacher)->post(
            '/teacher/modules/'.$this->module->id.'/blocks/upload',
            ['file' => UploadedFile::fake()->create('catatan.txt', 12, 'text/plain')],
        );

        $response->assertOk();
        $response->assertJsonStructure(['url', 'name', 'size']);
        $response->assertJsonPath('name', 'catatan.txt');
        $this->assertStringStartsWith('/storage/modules/'.$this->module->id.'/assets/', $response->json('url'));

        $path = str_replace('/storage/', '', $response->json('url'));
        Storage::disk('public')->assertExists($path);

        $forbidden = $this->actingAs($this->otherTeacher)->post(
            '/teacher/modules/'.$this->module->id.'/blocks/upload',
            ['file' => UploadedFile::fake()->create('jahat.txt', 4, 'text/plain')],
        );
        $this->assertContains($forbidden->status(), [403, 404]);

        $badType = $this->actingAs($this->teacher)->post(
            '/teacher/modules/'.$this->module->id.'/blocks/upload',
            ['file' => UploadedFile::fake()->create('program.exe', 4, 'application/octet-stream')],
            ['Accept' => 'application/json'],
        );
        $badType->assertUnprocessable();
    }
}
