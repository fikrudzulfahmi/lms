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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class TeacherStudioTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private TeachingAssignment $assignment;

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

        $this->assignment = TeachingAssignment::factory()->create([
            'teacher_id' => $this->teacher->id,
            'subject_id' => $subject->id,
            'classroom_id' => $classroom->id,
        ]);

        $this->module = LearningModule::factory()->create([
            'teaching_assignment_id' => $this->assignment->id,
            'title' => 'Diagnosa PGM-FI',
        ]);
    }

    private function makeTeacher(): User
    {
        return User::factory()->create(['role' => User::ROLE_TEACHER]);
    }

    private function blockPayload(array $overrides = []): array
    {
        return array_merge([
            'block_type' => ModuleBlock::BLOCK_MATERI_TEKS,
            'points' => 0,
            'content' => [
                'title' => 'Gejala Kerusakan Sensor',
                'body' => 'Periksa konektor dan resistansi sensor.',
            ],
            'ai_rubric' => null,
        ], $overrides);
    }

    public function test_guest_is_redirected_from_teacher_area(): void
    {
        $this->get('/teacher/modules')->assertRedirect('/login');
        $this->get("/teacher/modules/{$this->module->id}/edit")->assertRedirect('/login');
    }

    public function test_student_is_forbidden_from_teacher_area(): void
    {
        $student = User::factory()->create(['role' => User::ROLE_STUDENT]);

        $this->actingAs($student)->get('/teacher/modules')->assertForbidden();
        $this->actingAs($student)
            ->get("/teacher/modules/{$this->module->id}/edit")
            ->assertForbidden();
        $this->actingAs($student)
            ->postJson("/teacher/modules/{$this->module->id}/blocks", $this->blockPayload())
            ->assertForbidden();
    }

    public function test_teacher_index_only_lists_own_modules(): void
    {
        $otherTeacher = $this->makeTeacher();
        $otherAssignment = TeachingAssignment::factory()->create(['teacher_id' => $otherTeacher->id]);
        LearningModule::factory()->create([
            'teaching_assignment_id' => $otherAssignment->id,
            'title' => 'Modul Guru Lain',
        ]);

        ModuleBlock::factory()->create(['module_id' => $this->module->id]);

        $this->actingAs($this->teacher)
            ->get('/teacher/modules')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Teacher/Modules/Index')
                ->has('modules', 1)
                ->where('modules.0.title', 'Diagnosa PGM-FI')
                ->where('modules.0.blocks_count', 1)
                ->where('stats.total', 1)
                ->has('assignments', 1)
                ->has('assessment_types', 3));
    }

    public function test_other_teacher_cannot_open_or_edit_module(): void
    {
        $otherTeacher = $this->makeTeacher();

        $this->actingAs($otherTeacher)
            ->get("/teacher/modules/{$this->module->id}/edit")
            ->assertForbidden();

        $this->actingAs($otherTeacher)
            ->patchJson("/teacher/modules/{$this->module->id}", ['title' => 'Bajakan'])
            ->assertForbidden();

        $this->actingAs($otherTeacher)
            ->postJson("/teacher/modules/{$this->module->id}/blocks", $this->blockPayload())
            ->assertForbidden();
    }

    public function test_admin_can_open_any_module_studio(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        $this->actingAs($admin)
            ->get("/teacher/modules/{$this->module->id}/edit")
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Teacher/Modules/Edit')
                ->where('module.id', $this->module->id)
                ->has('blocks', 0)
                ->has('block_types', 8)
                ->has('urls.blocks'));
    }

    public function test_teacher_can_create_module_on_own_assignment_only(): void
    {
        $this->actingAs($this->teacher)
            ->post('/teacher/modules', [
                'teaching_assignment_id' => $this->assignment->id,
                'title' => 'Modul Baru',
                'assessment_type' => LearningModule::ASSESSMENT_FORMATIF,
                'kktp_score' => 78,
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('learning_modules', [
            'teaching_assignment_id' => $this->assignment->id,
            'title' => 'Modul Baru',
            'kktp_score' => 78,
        ]);

        $otherAssignment = TeachingAssignment::factory()->create(['teacher_id' => $this->makeTeacher()->id]);

        $this->actingAs($this->teacher)
            ->post('/teacher/modules', [
                'teaching_assignment_id' => $otherAssignment->id,
                'title' => 'Modul Ilegal',
                'assessment_type' => LearningModule::ASSESSMENT_FORMATIF,
            ])
            ->assertSessionHasErrors('teaching_assignment_id');

        $this->assertDatabaseMissing('learning_modules', ['title' => 'Modul Ilegal']);
    }

    public function test_module_create_rejects_objective_from_other_subject(): void
    {
        $otherObjective = LearningObjective::factory()->create();

        $this->actingAs($this->teacher)
            ->post('/teacher/modules', [
                'teaching_assignment_id' => $this->assignment->id,
                'learning_objective_id' => $otherObjective->id,
                'title' => 'Modul TP Salah',
                'assessment_type' => LearningModule::ASSESSMENT_FORMATIF,
            ])
            ->assertSessionHasErrors('learning_objective_id');
    }

    public function test_studio_edit_returns_blocks_in_order(): void
    {
        $second = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 1,
            'block_type' => ModuleBlock::BLOCK_SOAL_MCQ,
            'points' => 10,
            'content' => [
                'question' => 'Sensor apa yang diperiksa?',
                'options' => [
                    ['text' => 'CKP', 'correct' => true],
                    ['text' => 'IAT', 'correct' => false],
                ],
            ],
        ]);
        $first = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 0,
        ]);

        $this->actingAs($this->teacher)
            ->get("/teacher/modules/{$this->module->id}/edit")
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Teacher/Modules/Edit')
                ->has('blocks', 2)
                ->where('blocks.0.id', $first->id)
                ->where('blocks.1.id', $second->id)
                ->where('blocks.1.block_type', 'soal_mcq')
                ->where('blocks.1.points', 10));
    }

    public function test_teacher_can_create_and_autosave_block(): void
    {
        $response = $this->actingAs($this->teacher)
            ->postJson("/teacher/modules/{$this->module->id}/blocks", $this->blockPayload())
            ->assertCreated()
            ->assertJsonPath('block.block_type', 'materi_teks')
            ->assertJsonPath('block.order_index', 0)
            ->assertJsonStructure(['block' => ['id', 'content'], 'saved_at']);

        $blockId = $response->json('block.id');

        $this->assertDatabaseHas('module_blocks', [
            'id' => $blockId,
            'module_id' => $this->module->id,
            'block_type' => 'materi_teks',
        ]);

        $this->actingAs($this->teacher)
            ->patchJson("/teacher/modules/{$this->module->id}/blocks/{$blockId}", $this->blockPayload([
                'content' => [
                    'title' => 'Judul Diperbarui',
                    'body' => 'Isi materi hasil autosave.',
                ],
            ]))
            ->assertOk()
            ->assertJsonPath('block.content.title', 'Judul Diperbarui')
            ->assertJsonStructure(['block', 'saved_at']);

        $this->assertDatabaseHas('module_blocks', [
            'id' => $blockId,
            'points' => 0,
        ]);
        $this->assertSame(
            'Judul Diperbarui',
            ModuleBlock::find($blockId)->content['title'],
        );
    }

    public function test_block_type_specific_validation_rejects_bad_payloads(): void
    {
        $this->actingAs($this->teacher)
            ->postJson("/teacher/modules/{$this->module->id}/blocks", [
                'block_type' => 'soal_mcq',
                'points' => 10,
                'content' => [
                    'question' => 'Pilih satu',
                    'options' => [
                        ['text' => 'A', 'correct' => false],
                        ['text' => 'B', 'correct' => false],
                    ],
                ],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('content.options');

        $this->actingAs($this->teacher)
            ->postJson("/teacher/modules/{$this->module->id}/blocks", [
                'block_type' => 'soal_essay_ai',
                'points' => 0,
                'content' => ['min_words' => 20],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['content.question', 'points']);

        $this->actingAs($this->teacher)
            ->postJson("/teacher/modules/{$this->module->id}/blocks", [
                'block_type' => 'slide_image',
                'points' => 0,
                'content' => ['url' => 'javascript:alert(1)'],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('content.url');

        $this->assertDatabaseCount('module_blocks', 0);
    }

    public function test_teacher_can_reorder_blocks(): void
    {
        $a = ModuleBlock::factory()->create(['module_id' => $this->module->id, 'order_index' => 0]);
        $b = ModuleBlock::factory()->create(['module_id' => $this->module->id, 'order_index' => 1]);
        $c = ModuleBlock::factory()->create(['module_id' => $this->module->id, 'order_index' => 2]);

        $this->actingAs($this->teacher)
            ->patchJson("/teacher/modules/{$this->module->id}/blocks/reorder", [
                'ids' => [$c->id, $a->id, $b->id],
            ])
            ->assertOk()
            ->assertJsonPath('ids', [$c->id, $a->id, $b->id]);

        $this->assertSame(0, $c->fresh()->order_index);
        $this->assertSame(1, $a->fresh()->order_index);
        $this->assertSame(2, $b->fresh()->order_index);
    }

    public function test_reorder_rejects_foreign_or_missing_ids(): void
    {
        $own = ModuleBlock::factory()->create(['module_id' => $this->module->id, 'order_index' => 0]);

        $otherModule = LearningModule::factory()->create([
            'teaching_assignment_id' => $this->assignment->id,
        ]);
        $foreign = ModuleBlock::factory()->create([
            'module_id' => $otherModule->id,
            'order_index' => 0,
        ]);

        $this->actingAs($this->teacher)
            ->patchJson("/teacher/modules/{$this->module->id}/blocks/reorder", [
                'ids' => [$own->id, $foreign->id],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ids');

        $this->actingAs($this->teacher)
            ->patchJson("/teacher/modules/{$this->module->id}/blocks/reorder", [
                'ids' => ['00000000-0000-4000-8000-000000000000'],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ids');
    }

    public function test_delete_block_reindexes_remaining_blocks(): void
    {
        $a = ModuleBlock::factory()->create(['module_id' => $this->module->id, 'order_index' => 0]);
        $b = ModuleBlock::factory()->create(['module_id' => $this->module->id, 'order_index' => 1]);
        $c = ModuleBlock::factory()->create(['module_id' => $this->module->id, 'order_index' => 2]);

        $this->actingAs($this->teacher)
            ->deleteJson("/teacher/modules/{$this->module->id}/blocks/{$b->id}")
            ->assertOk()
            ->assertJsonPath('deleted', $b->id);

        $this->assertDatabaseMissing('module_blocks', ['id' => $b->id]);
        $this->assertSame(0, $a->fresh()->order_index);
        $this->assertSame(1, $c->fresh()->order_index);
    }

    public function test_block_from_other_module_returns_not_found(): void
    {
        $otherModule = LearningModule::factory()->create([
            'teaching_assignment_id' => $this->assignment->id,
        ]);
        $foreign = ModuleBlock::factory()->create(['module_id' => $otherModule->id]);

        $this->actingAs($this->teacher)
            ->patchJson("/teacher/modules/{$this->module->id}/blocks/{$foreign->id}", $this->blockPayload())
            ->assertNotFound();
    }

    public function test_module_meta_autosave_updates_title_and_status(): void
    {
        $this->actingAs($this->teacher)
            ->patchJson("/teacher/modules/{$this->module->id}", [
                'title' => 'Judul Final',
                'status' => LearningModule::STATUS_PUBLISHED,
            ])
            ->assertOk()
            ->assertJsonPath('module.title', 'Judul Final')
            ->assertJsonPath('module.status', 'published');

        $this->assertDatabaseHas('learning_modules', [
            'id' => $this->module->id,
            'title' => 'Judul Final',
            'status' => 'published',
        ]);
    }
}
