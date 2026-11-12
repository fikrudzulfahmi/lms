<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\Department;
use App\Models\LearningModule;
use App\Models\ModuleBlock;
use App\Models\QuestionBankItem;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class QuestionBankTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private LearningModule $module;

    private ModuleBlock $mcq;

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
                'explanation' => 'Sensor MAP membaca tekanan intake.',
            ],
        ]);
    }

    public function test_teacher_can_save_block_to_bank_and_reuse_in_module(): void
    {
        $store = $this->actingAs($this->teacher)->postJson(route('teacher.bank.store'), [
            'block_id' => $this->mcq->id,
        ]);
        $store->assertCreated();

        $item = QuestionBankItem::query()->firstOrFail();
        $this->assertSame($this->teacher->id, $item->teacher_id);
        $this->assertSame('soal_mcq', $item->block_type);
        $this->assertSame('Diagnosa PGM-FI', $item->topic);
        $this->assertSame('Apa fungsi sensor MAP?', $item->content['question']);

        // Ambil kembali ke modul: menjadi blok baru di akhir, blok asal utuh.
        $add = $this->actingAs($this->teacher)->postJson(
            route('teacher.modules.blocks.from-bank', $this->module),
            ['item_id' => $item->id],
        );
        $add->assertCreated();
        $add->assertJsonPath('block.block_type', 'soal_mcq');
        $this->assertSame(2, $this->module->blocks()->count());
        $this->assertSame(1, (int) $this->module->blocks()->max('order_index'));
    }

    public function test_bank_index_lists_only_own_items(): void
    {
        QuestionBankItem::create([
            'teacher_id' => $this->teacher->id,
            'block_type' => 'soal_mcq',
            'points' => 10,
            'content' => ['question' => 'Soal milikku?', 'options' => []],
            'topic' => 'Kelistrikan',
        ]);
        $other = User::factory()->create(['role' => User::ROLE_TEACHER]);
        QuestionBankItem::create([
            'teacher_id' => $other->id,
            'block_type' => 'soal_mcq',
            'points' => 10,
            'content' => ['question' => 'Soal guru lain?', 'options' => []],
        ]);

        $response = $this->actingAs($this->teacher)->get(route('teacher.bank.index'));
        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Teacher/Bank/Index')
            ->has('items', 1)
            ->where('items.0.snippet', 'Soal milikku?')
        );
    }

    public function test_teacher_cannot_use_or_delete_foreign_bank_item(): void
    {
        $other = User::factory()->create(['role' => User::ROLE_TEACHER]);
        $foreign = QuestionBankItem::create([
            'teacher_id' => $other->id,
            'block_type' => 'soal_mcq',
            'points' => 10,
            'content' => ['question' => 'Soal guru lain?', 'options' => []],
        ]);

        $this->actingAs($this->teacher)->postJson(
            route('teacher.modules.blocks.from-bank', $this->module),
            ['item_id' => $foreign->id],
        )->assertUnprocessable();

        $this->actingAs($this->teacher)->delete(route('teacher.bank.destroy', $foreign))
            ->assertForbidden();

        $this->assertDatabaseHas('question_bank_items', ['id' => $foreign->id]);
        $this->assertSame(1, $this->module->blocks()->count());
    }

    public function test_teacher_can_delete_own_bank_item(): void
    {
        $item = QuestionBankItem::create([
            'teacher_id' => $this->teacher->id,
            'block_type' => 'soal_truefalse',
            'points' => 10,
            'content' => ['question' => 'Aki 12 volt?', 'answer' => true],
        ]);

        $this->actingAs($this->teacher)->delete(route('teacher.bank.destroy', $item))
            ->assertRedirect();

        $this->assertDatabaseMissing('question_bank_items', ['id' => $item->id]);
    }
}
