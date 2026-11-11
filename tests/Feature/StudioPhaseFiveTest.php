<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\Department;
use App\Models\LearningModule;
use App\Models\LearningObjective;
use App\Models\ModuleBlock;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use App\Services\AiCurriculumService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StudioPhaseFiveTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $otherTeacher;

    private TeachingAssignment $assignment;

    private TeachingAssignment $secondAssignment;

    private TeachingAssignment $foreignAssignment;

    private LearningModule $module;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'ai.base_url' => 'http://ai.test/v1',
            'ai.api_key' => 'test-key',
            'ai.model' => 'test-model',
            'ai.timeout' => 5,
            'ai.max_tokens' => 2000,
        ]);

        $this->teacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
        $this->otherTeacher = User::factory()->create(['role' => User::ROLE_TEACHER]);

        $department = Department::factory()->create(['code' => 'TSM', 'name' => 'Teknik Sepeda Motor']);
        $classroom = Classroom::factory()->create([
            'department_id' => $department->id,
            'grade_level' => 'XI',
            'name' => 'XI TSM 1',
        ]);
        $secondClassroom = Classroom::factory()->create([
            'department_id' => $department->id,
            'grade_level' => 'XI',
            'name' => 'XI TSM 2',
        ]);
        $subject = Subject::factory()->create([
            'department_id' => $department->id,
            'code' => 'PLPK-TSM',
            'name' => 'Pemeliharaan Kelistrikan Sepeda Motor',
        ]);

        $this->assignment = TeachingAssignment::factory()->create([
            'teacher_id' => $this->teacher->id,
            'subject_id' => $subject->id,
            'classroom_id' => $classroom->id,
        ]);
        $this->secondAssignment = TeachingAssignment::factory()->create([
            'teacher_id' => $this->teacher->id,
            'subject_id' => $subject->id,
            'classroom_id' => $secondClassroom->id,
        ]);
        $this->foreignAssignment = TeachingAssignment::factory()->create([
            'teacher_id' => $this->otherTeacher->id,
            'subject_id' => $subject->id,
            'classroom_id' => $secondClassroom->id,
        ]);

        $objective = LearningObjective::factory()->create([
            'subject_id' => $subject->id,
            'teacher_id' => $this->teacher->id,
            'grade_level' => 'XI',
            'code' => 'TP-1.2',
            'description' => 'Mendiagnosis gangguan komponen sensor sistem injeksi PGM-FI sesuai SOP',
        ]);

        $this->module = LearningModule::factory()->create([
            'teaching_assignment_id' => $this->assignment->id,
            'learning_objective_id' => $objective->id,
            'title' => 'Diagnosa PGM-FI',
            'status' => LearningModule::STATUS_PUBLISHED,
            'allow_practice' => true,
        ]);

        ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 0,
            'block_type' => ModuleBlock::BLOCK_MATERI_TEKS,
            'points' => 0,
            'content' => ['title' => 'Pengantar Sensor', 'body' => 'Isi materi pengantar.'],
        ]);
        ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 1,
            'block_type' => ModuleBlock::BLOCK_SOAL_MCQ,
            'points' => 10,
            'content' => [
                'question' => 'Sensor apa yang membaca suhu cairan pendingin?',
                'options' => [
                    ['text' => 'Sensor ECT', 'correct' => true],
                    ['text' => 'Sensor CKP', 'correct' => false],
                ],
                'explanation' => 'ECT mengukur suhu cairan pendingin.',
            ],
        ]);
        ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 2,
            'block_type' => ModuleBlock::BLOCK_SOAL_ESSAY_AI,
            'points' => 20,
            'content' => ['question' => 'Analisis kasus mesin sulit hidup saat dingin.', 'min_words' => 40],
            'ai_rubric' => 'Wajib menyebut sensor ECT dan pengukuran resistansi.',
        ]);
    }

    private function latestCopy(): LearningModule
    {
        return LearningModule::query()
            ->whereKeyNot($this->module->id)
            ->latest('id')
            ->firstOrFail();
    }

    public function test_teacher_duplicates_module_with_all_blocks_as_draft(): void
    {
        $response = $this->actingAs($this->teacher)
            ->post(route('teacher.modules.duplicate', $this->module), []);

        $copy = $this->latestCopy();

        $response->assertRedirect(route('teacher.modules.edit', $copy));
        $response->assertSessionHas('success');

        $this->assertSame('Diagnosa PGM-FI (Salinan)', $copy->title);
        $this->assertSame(LearningModule::STATUS_DRAFT, $copy->status);
        $this->assertSame($this->assignment->id, $copy->teaching_assignment_id);
        $this->assertTrue((bool) $copy->allow_practice);
        $this->assertSame($this->module->learning_objective_id, $copy->learning_objective_id);

        $originalBlocks = $this->module->blocks()->orderBy('order_index')->get();
        $copyBlocks = $copy->blocks()->orderBy('order_index')->get();

        $this->assertCount(3, $copyBlocks);

        foreach ($originalBlocks as $index => $original) {
            $duplicated = $copyBlocks[$index];
            $this->assertNotSame($original->id, $duplicated->id);
            $this->assertSame($original->order_index, $duplicated->order_index);
            $this->assertSame($original->block_type, $duplicated->block_type);
            $this->assertSame($original->points, $duplicated->points);
            $this->assertSame($original->content, $duplicated->content);
            $this->assertSame($original->ai_rubric, $duplicated->ai_rubric);
        }

        // Modul asli tidak berubah.
        $this->assertSame(LearningModule::STATUS_PUBLISHED, $this->module->fresh()->status);
        $this->assertSame('Diagnosa PGM-FI', $this->module->fresh()->title);
    }

    public function test_duplicate_to_another_own_assignment_with_custom_title(): void
    {
        $response = $this->actingAs($this->teacher)
            ->post(route('teacher.modules.duplicate', $this->module), [
                'title' => 'Diagnosa PGM-FI — Kelas 2',
                'teaching_assignment_id' => $this->secondAssignment->id,
            ]);

        $copy = $this->latestCopy();

        $response->assertRedirect(route('teacher.modules.edit', $copy));
        $this->assertSame('Diagnosa PGM-FI — Kelas 2', $copy->title);
        $this->assertSame($this->secondAssignment->id, $copy->teaching_assignment_id);
        $this->assertSame(LearningModule::STATUS_DRAFT, $copy->status);
        $this->assertCount(3, $copy->blocks()->get());
    }

    public function test_duplicate_to_foreign_assignment_is_rejected(): void
    {
        $this->actingAs($this->teacher)
            ->post(route('teacher.modules.duplicate', $this->module), [
                'teaching_assignment_id' => $this->foreignAssignment->id,
            ])
            ->assertSessionHasErrors('teaching_assignment_id');

        $this->assertSame(1, LearningModule::count());
    }

    public function test_non_owner_teacher_cannot_duplicate_module(): void
    {
        $this->actingAs($this->otherTeacher)
            ->post(route('teacher.modules.duplicate', $this->module), [])
            ->assertForbidden();

        $this->assertSame(1, LearningModule::count());
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
            'usage' => ['prompt_tokens' => 100, 'completion_tokens' => 200, 'total_tokens' => 300],
        ];
    }

    private function newTypesJson(): string
    {
        return json_encode([
            'b' => [
                [
                    't' => 'section_heading',
                    'pts' => 0,
                    'c' => ['h' => 'Bagian 1 — Mengenal Sensor', 'txt' => 'Fungsi dan lokasi sensor utama.'],
                ],
                [
                    't' => 'materi_richtext',
                    'pts' => 0,
                    'c' => [
                        'h' => 'Cara Kerja Sensor ECT',
                        'txt' => "Sensor ECT membaca **suhu cairan pendingin**.\n\n- Resistansi turun saat suhu naik\n- Sinyal dipakai ECM untuk koreksi injeksi",
                    ],
                ],
                [
                    't' => 'soal_truefalse',
                    'pts' => 10,
                    'c' => [
                        'q' => 'Resistansi sensor ECT naik ketika suhu cairan pendingin naik.',
                        'answer' => false,
                        'explanation' => 'ECT bersifat NTC: resistansinya justru turun saat suhu naik.',
                    ],
                ],
                [
                    't' => 'soal_fillblank',
                    'pts' => 10,
                    'c' => [
                        'q' => 'Alat yang dipakai mengukur resistansi sensor ECT adalah ___.',
                        'answers' => ['avometer', 'multimeter', 'multitester'],
                        'explanation' => 'Resistansi diukur dengan avometer/multimeter pada skala ohm.',
                    ],
                ],
                [
                    't' => 'polling',
                    'pts' => 0,
                    'c' => [
                        'q' => 'Seberapa paham kamu tentang fungsi sensor ECT?',
                        'options' => ['Sudah paham', 'Masih ragu', 'Belum paham'],
                    ],
                ],
                [
                    't' => 'materi_video',
                    'pts' => 0,
                    'c' => ['h' => 'Video Praktik', 'txt' => 'Tipe ini tidak boleh dibuat AI.'],
                ],
            ],
        ], JSON_UNESCAPED_UNICODE);
    }

    public function test_ai_generates_new_block_types_and_drops_forbidden_types(): void
    {
        Http::fake([
            '*chat/completions' => Http::response($this->chatResponse($this->newTypesJson()), 200),
        ]);

        $blocks = app(AiCurriculumService::class)->generateModuleBlocks(
            subject: 'Pemeliharaan Kelistrikan Sepeda Motor',
            gradeLevel: 'XI',
            objective: 'Mendiagnosis gangguan komponen sensor sistem injeksi PGM-FI sesuai SOP',
            context: ['count' => 6, 'difficulty' => 'sedang'],
        );

        $types = array_column($blocks, 'block_type');

        $this->assertSame([
            ModuleBlock::BLOCK_SECTION_HEADING,
            ModuleBlock::BLOCK_MATERI_RICHTEXT,
            ModuleBlock::BLOCK_SOAL_TRUEFALSE,
            ModuleBlock::BLOCK_SOAL_FILLBLANK,
            ModuleBlock::BLOCK_POLLING,
        ], $types);
        $this->assertNotContains(ModuleBlock::BLOCK_MATERI_VIDEO, $types);

        $byType = collect($blocks)->keyBy('block_type');

        $this->assertSame('Bagian 1 — Mengenal Sensor', $byType[ModuleBlock::BLOCK_SECTION_HEADING]['content']['title']);
        $this->assertSame(0, $byType[ModuleBlock::BLOCK_SECTION_HEADING]['points']);

        $this->assertSame('Cara Kerja Sensor ECT', $byType[ModuleBlock::BLOCK_MATERI_RICHTEXT]['content']['title']);
        $this->assertStringContainsString('**suhu cairan pendingin**', $byType[ModuleBlock::BLOCK_MATERI_RICHTEXT]['content']['body']);

        $this->assertFalse($byType[ModuleBlock::BLOCK_SOAL_TRUEFALSE]['content']['answer']);
        $this->assertGreaterThanOrEqual(1, $byType[ModuleBlock::BLOCK_SOAL_TRUEFALSE]['points']);

        $this->assertSame(
            ['avometer', 'multimeter', 'multitester'],
            $byType[ModuleBlock::BLOCK_SOAL_FILLBLANK]['content']['answers'],
        );

        $this->assertSame(0, $byType[ModuleBlock::BLOCK_POLLING]['points']);
        $this->assertSame(
            ['Sudah paham', 'Masih ragu', 'Belum paham'],
            $byType[ModuleBlock::BLOCK_POLLING]['content']['options'],
        );

        // Setiap blok hasil generate harus lolos validasi blok Studio,
        // agar bisa disimpan/disunting guru lewat jalur blok yang sama.
        foreach ($blocks as $block) {
            $this->actingAs($this->teacher)
                ->postJson(route('teacher.modules.blocks.store', $this->module), [
                    'block_type' => $block['block_type'],
                    'points' => $block['points'],
                    'content' => $block['content'],
                    'ai_rubric' => $block['ai_rubric'],
                ])
                ->assertCreated();
        }
    }

    public function test_ai_request_can_limit_to_new_block_types(): void
    {
        Http::fake([
            '*chat/completions' => Http::response($this->chatResponse($this->newTypesJson()), 200),
        ]);

        $blocks = app(AiCurriculumService::class)->generateModuleBlocks(
            subject: 'Pemeliharaan Kelistrikan Sepeda Motor',
            gradeLevel: 'XI',
            objective: 'Mendiagnosis gangguan komponen sensor sistem injeksi PGM-FI sesuai SOP',
            context: [
                'count' => 6,
                'difficulty' => 'sedang',
                'block_types' => [ModuleBlock::BLOCK_SOAL_TRUEFALSE, ModuleBlock::BLOCK_POLLING],
            ],
        );

        $this->assertSame(
            [ModuleBlock::BLOCK_SOAL_TRUEFALSE, ModuleBlock::BLOCK_POLLING],
            array_column($blocks, 'block_type'),
        );
    }
}
