<?php

namespace Tests\Feature;

use App\Exceptions\AiUnavailableException;
use App\Jobs\GenerateModuleBlocksJob;
use App\Jobs\GradeStudentEssaysJob;
use App\Models\Classroom;
use App\Models\Department;
use App\Models\LearningModule;
use App\Models\LearningObjective;
use App\Models\ModuleBlock;
use App\Models\ModuleGrade;
use App\Models\StudentResponse;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use App\Services\AiCurriculumService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class AiCurriculumTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private TeachingAssignment $assignment;

    private LearningModule $module;

    private LearningObjective $objective;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'ai.base_url' => 'http://ai.test/v1',
            'ai.api_key' => 'test-key',
            'ai.model' => 'test-model',
            'ai.timeout' => 5,
            'ai.max_tokens' => 1200,
        ]);

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

        $this->assignment = TeachingAssignment::factory()->create([
            'teacher_id' => $this->teacher->id,
            'subject_id' => $subject->id,
            'classroom_id' => $classroom->id,
        ]);

        $this->objective = LearningObjective::factory()->create([
            'subject_id' => $subject->id,
            'teacher_id' => $this->teacher->id,
            'grade_level' => 'XI',
            'code' => 'TP-1.2',
            'description' => 'Mendiagnosis gangguan komponen sensor sistem injeksi PGM-FI sesuai SOP',
        ]);

        $this->module = LearningModule::factory()->create([
            'teaching_assignment_id' => $this->assignment->id,
            'learning_objective_id' => $this->objective->id,
            'title' => 'Diagnosa PGM-FI',
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
            'usage' => ['prompt_tokens' => 100, 'completion_tokens' => 200, 'total_tokens' => 300],
        ];
    }

    private function blocksJson(): string
    {
        return json_encode([
            'b' => [
                [
                    't' => 'materi_accordion',
                    'pts' => 0,
                    'c' => [
                        'h' => 'Gejala Kerusakan Sensor Utama PGM-FI',
                        'items' => [
                            ['lbl' => 'Sensor CKP', 'txt' => 'Jika terputus, ECM tidak mendeteksi putaran mesin.'],
                            ['lbl' => 'Sensor ECT', 'txt' => 'Periksa resistansi saat mesin dingin dan panas.'],
                        ],
                    ],
                ],
                [
                    't' => 'soal_mcq',
                    'pts' => 10,
                    'c' => [
                        'q' => 'Sensor apa yang membaca suhu cairan pendingin?',
                        'options' => [
                            ['t' => 'Sensor ECT', 'correct' => true],
                            ['t' => 'Sensor CKP', 'correct' => false],
                            ['t' => 'Sensor IAT', 'correct' => false],
                            ['t' => 'Sensor O2', 'correct' => false],
                        ],
                        'explanation' => 'ECT mengukur suhu cairan pendingin untuk koreksi injeksi.',
                    ],
                ],
                [
                    't' => 'soal_essay_ai',
                    'pts' => 20,
                    'rub' => 'Wajib menyebut sensor ECT/EOT dan pengukuran resistansi dengan avometer.',
                    'c' => [
                        'q' => 'Mesin sulit hidup saat dingin namun normal saat panas. Sensor apa yang dicurigai?',
                        'min_words' => 40,
                    ],
                ],
            ],
        ], JSON_UNESCAPED_UNICODE);
    }

    private function fakeGenerate(string $content): void
    {
        Http::fake([
            '*chat/completions' => Http::response($this->chatResponse($content), 200),
        ]);
    }

    private function makeEssayBlock(int $points = 20): ModuleBlock
    {
        return ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 0,
            'block_type' => ModuleBlock::BLOCK_SOAL_ESSAY_AI,
            'points' => $points,
            'content' => [
                'question' => 'Mesin sulit hidup saat dingin. Sensor apa yang dicurigai dan bagaimana mengukurnya?',
                'min_words' => 40,
            ],
            'ai_rubric' => 'Wajib menyebut sensor ECT dan pengukuran resistansi dengan avometer.',
        ]);
    }

    public function test_generate_job_persists_expanded_blocks_and_completion_status(): void
    {
        $this->fakeGenerate($this->blocksJson());

        (new GenerateModuleBlocksJob($this->module->id, [
            'count' => 3,
            'difficulty' => 'sedang',
        ]))->handle(app(AiCurriculumService::class));

        $this->assertDatabaseCount('module_blocks', 3);

        $module = $this->module->fresh();
        $this->assertSame(LearningModule::AI_COMPLETED, $module->ai_status);
        $this->assertNull($module->ai_error);
        $this->assertNotNull($module->ai_generated_at);

        $blocks = $module->blocks()->orderBy('order_index')->get();
        $this->assertSame(ModuleBlock::BLOCK_MATERI_ACCORDION, $blocks[0]->block_type);
        $this->assertSame('Gejala Kerusakan Sensor Utama PGM-FI', $blocks[0]->content['title']);
        $this->assertSame('Sensor CKP', $blocks[0]->content['items'][0]['label']);
        $this->assertSame(10, $blocks[1]->points);
        $this->assertCount(4, $blocks[1]->content['options']);
        $this->assertSame(20, $blocks[2]->points);
        $this->assertStringContainsString('resistansi', $blocks[2]->ai_rubric);
    }

    public function test_invalid_json_is_retried_once_then_succeeds(): void
    {
        Http::fakeSequence()
            ->push($this->chatResponse('Tentu, ini bloknya: bukan json'), 200)
            ->push($this->chatResponse($this->blocksJson()), 200);

        (new GenerateModuleBlocksJob($this->module->id))->handle(app(AiCurriculumService::class));

        Http::assertSentCount(2);
        $this->assertDatabaseCount('module_blocks', 3);
        $this->assertSame(LearningModule::AI_COMPLETED, $this->module->fresh()->ai_status);
    }

    public function test_invalid_json_twice_throws_domain_exception_and_marks_failed(): void
    {
        $this->fakeGenerate('Maaf, saya tidak bisa memberi JSON sekarang.');

        try {
            (new GenerateModuleBlocksJob($this->module->id))->handle(app(AiCurriculumService::class));
            $this->fail('AiUnavailableException harus dilempar saat JSON tetap tidak valid.');
        } catch (AiUnavailableException $exception) {
            $this->assertStringContainsString('JSON', $exception->getMessage());
        }

        $module = $this->module->fresh();
        $this->assertSame(LearningModule::AI_FAILED, $module->ai_status);
        $this->assertNotNull($module->ai_error);
        $this->assertDatabaseCount('module_blocks', 0);
    }

    public function test_generate_endpoint_dispatches_job_and_enforces_ownership(): void
    {
        Queue::fake();

        $url = "/teacher/modules/{$this->module->id}/ai/generate";

        $otherTeacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
        $this->actingAs($otherTeacher)
            ->postJson($url, ['count' => 3, 'difficulty' => 'sedang'])
            ->assertForbidden();

        $student = User::factory()->create(['role' => User::ROLE_STUDENT]);
        $this->actingAs($student)->postJson($url, ['count' => 3])->assertForbidden();

        $this->actingAs($this->teacher)
            ->postJson($url, [
                'learning_objective_id' => $this->objective->id,
                'count' => 3,
                'difficulty' => 'sulit',
                'instruction' => 'Fokus diagnosa sensor.',
            ])
            ->assertStatus(202)
            ->assertJsonPath('ai_status', 'queued');

        Queue::assertPushed(GenerateModuleBlocksJob::class, function (GenerateModuleBlocksJob $job): bool {
            return $job->moduleId === $this->module->id
                && $job->options['count'] === 3
                && $job->options['difficulty'] === 'sulit';
        });

        $this->assertSame(LearningModule::AI_QUEUED, $this->module->fresh()->ai_status);
    }

    public function test_generate_endpoint_rejects_objective_from_other_subject(): void
    {
        Queue::fake();

        $foreignObjective = LearningObjective::factory()->create(['grade_level' => 'XI']);

        $this->actingAs($this->teacher)
            ->postJson("/teacher/modules/{$this->module->id}/ai/generate", [
                'learning_objective_id' => $foreignObjective->id,
                'count' => 3,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('learning_objective_id');

        Queue::assertNothingPushed();
    }

    public function test_generate_endpoint_conflicts_while_ai_is_running(): void
    {
        Queue::fake();
        $this->module->forceFill(['ai_status' => LearningModule::AI_GENERATING])->save();

        $this->actingAs($this->teacher)
            ->postJson("/teacher/modules/{$this->module->id}/ai/generate", ['count' => 3])
            ->assertStatus(409)
            ->assertJsonPath('ai_status', 'generating');

        Queue::assertNothingPushed();
    }

    public function test_grade_job_saves_score_feedback_and_module_grade(): void
    {
        $block = $this->makeEssayBlock(20);
        $student = User::factory()->create(['role' => User::ROLE_STUDENT]);
        $response = StudentResponse::factory()->create([
            'module_block_id' => $block->id,
            'student_id' => $student->id,
            'answer_payload' => ['text' => 'Sensor ECT, diukur resistansinya dengan avometer saat dingin dan panas.'],
            'is_graded' => false,
        ]);

        Http::fake([
            '*chat/completions' => Http::response($this->chatResponse(json_encode([
                'g' => [['sid' => $student->id, 'pts' => 18, 'fb' => 'Tepat menyebut ECT, namun belum menuliskan skala Ohm.']],
            ]))),
        ]);

        (new GradeStudentEssaysJob([$response->id]))->handle(app(AiCurriculumService::class));

        $response->refresh();
        $this->assertSame('18.00', $response->earned_points);
        $this->assertStringContainsString('skala Ohm', $response->ai_feedback);
        $this->assertTrue($response->is_graded);

        $grade = ModuleGrade::where('module_id', $this->module->id)->where('student_id', $student->id)->first();
        $this->assertNotNull($grade);
        $this->assertSame('90.00', $grade->final_score);
        $this->assertSame('20.00', $grade->max_possible_points);
        $this->assertTrue($grade->is_passed);
        $this->assertSame(ModuleGrade::STATUS_GRADED, $grade->status);

        Http::assertSent(function ($request): bool {
            $body = json_encode($request->data(), JSON_UNESCAPED_UNICODE);

            return str_contains($body, 'avometer')
                && str_contains($body, 'Batas maksimum poin: 20')
                && str_contains($body, 'JAWABAN SISWA');
        });
    }

    public function test_grading_is_idempotent_and_skips_already_graded_responses(): void
    {
        $block = $this->makeEssayBlock(20);
        $student = User::factory()->create(['role' => User::ROLE_STUDENT]);
        $response = StudentResponse::factory()->create([
            'module_block_id' => $block->id,
            'student_id' => $student->id,
            'answer_payload' => ['text' => 'Sensor ECT diukur dengan avometer.'],
        ]);

        Http::fake([
            '*chat/completions' => Http::response($this->chatResponse(json_encode([
                'g' => [['sid' => $student->id, 'pts' => 15, 'fb' => 'Cukup lengkap.']],
            ]))),
        ]);

        (new GradeStudentEssaysJob([$response->id]))->handle(app(AiCurriculumService::class));
        (new GradeStudentEssaysJob([$response->id]))->handle(app(AiCurriculumService::class));

        Http::assertSentCount(1);
        $this->assertSame('15.00', $response->fresh()->earned_points);
    }

    public function test_grade_endpoint_dispatches_for_essay_and_rejects_non_essay(): void
    {
        Queue::fake();

        $essay = $this->makeEssayBlock(20);
        $mcq = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 1,
            'block_type' => ModuleBlock::BLOCK_SOAL_MCQ,
            'points' => 10,
            'content' => [
                'question' => 'Pilih sensor suhu.',
                'options' => [
                    ['text' => 'ECT', 'correct' => true],
                    ['text' => 'CKP', 'correct' => false],
                ],
            ],
        ]);
        $student = User::factory()->create(['role' => User::ROLE_STUDENT]);

        $essayResponse = StudentResponse::factory()->create([
            'module_block_id' => $essay->id,
            'student_id' => $student->id,
            'answer_payload' => ['text' => 'Sensor ECT.'],
        ]);
        $mcqResponse = StudentResponse::factory()->create([
            'module_block_id' => $mcq->id,
            'student_id' => $student->id,
            'answer_payload' => ['option' => 0],
        ]);

        $this->actingAs($this->teacher)
            ->postJson("/teacher/responses/{$mcqResponse->id}/ai/grade")
            ->assertStatus(422);

        $this->actingAs($this->teacher)
            ->postJson("/teacher/responses/{$essayResponse->id}/ai/grade")
            ->assertStatus(202)
            ->assertJsonPath('status', 'queued');

        Queue::assertPushed(GradeStudentEssaysJob::class, fn (GradeStudentEssaysJob $job): bool => $job->responseIds === [$essayResponse->id]);

        $otherTeacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
        $this->actingAs($otherTeacher)
            ->postJson("/teacher/responses/{$essayResponse->id}/ai/grade")
            ->assertForbidden();
    }

    public function test_status_endpoint_returns_polling_payload_and_protects_ownership(): void
    {
        ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 0,
            'block_type' => ModuleBlock::BLOCK_MATERI_TEKS,
            'content' => ['title' => 'Pengantar PGM-FI', 'body' => 'Materi awal.'],
        ]);
        $this->module->forceFill([
            'ai_status' => LearningModule::AI_COMPLETED,
            'ai_generated_at' => now(),
        ])->save();

        $this->actingAs($this->teacher)
            ->getJson("/teacher/modules/{$this->module->id}/ai/status")
            ->assertOk()
            ->assertJsonPath('ai_status', 'completed')
            ->assertJsonPath('blocks_count', 1)
            ->assertJsonPath('blocks.0.title', 'Pengantar PGM-FI')
            ->assertJsonStructure(['ai_status', 'ai_error', 'ai_generated_at', 'blocks']);

        $otherTeacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
        $this->actingAs($otherTeacher)
            ->getJson("/teacher/modules/{$this->module->id}/ai/status")
            ->assertForbidden();
    }

    public function test_admin_can_trigger_generation_for_any_module(): void
    {
        Queue::fake();

        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        $this->actingAs($admin)
            ->postJson("/teacher/modules/{$this->module->id}/ai/generate", ['count' => 2])
            ->assertStatus(202);

        Queue::assertPushed(GenerateModuleBlocksJob::class);
    }
}
