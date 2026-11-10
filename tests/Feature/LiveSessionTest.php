<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\Department;
use App\Models\LearningModule;
use App\Models\LiveSession;
use App\Models\ModuleBlock;
use App\Models\StudentResponse;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use App\Services\LiveSessionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class LiveSessionTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $otherTeacher;

    private User $student;

    private LearningModule $module;

    private ModuleBlock $material;

    private ModuleBlock $mcq;

    private ModuleBlock $essay;

    protected function setUp(): void
    {
        parent::setUp();

        config(['live.internal_secret' => 'test-internal-secret']);

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

        $assignment = TeachingAssignment::factory()->create([
            'teacher_id' => $this->teacher->id,
            'subject_id' => $subject->id,
            'classroom_id' => $classroom->id,
        ]);

        $this->module = LearningModule::factory()->create([
            'teaching_assignment_id' => $assignment->id,
            'title' => 'Diagnosa PGM-FI',
        ]);

        $this->material = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 1,
            'block_type' => ModuleBlock::BLOCK_MATERI_TEKS,
            'points' => 0,
            'content' => ['title' => 'Pengenalan', 'body' => 'Sensor dan aktuator.'],
        ]);

        $this->mcq = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 2,
            'block_type' => ModuleBlock::BLOCK_SOAL_MCQ,
            'points' => 10,
            'content' => [
                'question' => 'Apa fungsi sensor MAP?',
                'options' => [
                    ['text' => 'Mengukur tekanan manifold', 'correct' => true],
                    ['text' => 'Mengukur suhu oli', 'correct' => false],
                ],
                'explanation' => 'Sensor MAP mengukur tekanan udara intake.',
            ],
            'ai_rubric' => null,
        ]);

        $this->essay = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'order_index' => 3,
            'block_type' => ModuleBlock::BLOCK_SOAL_ESSAY_AI,
            'points' => 20,
            'content' => ['question' => 'Jelaskan gejala sensor MAP rusak.'],
            'ai_rubric' => 'Kunci rahasia: gejalanya mesin tersendat.',
        ]);
    }

    private function startLiveSession(?User $actor = null): LiveSession
    {
        $this->actingAs($actor ?? $this->teacher)
            ->post(route('teacher.live.start', $this->module))
            ->assertRedirect();

        return LiveSession::query()
            ->where('module_id', $this->module->id)
            ->where('status', LiveSession::STATUS_ACTIVE)
            ->firstOrFail();
    }

    public function test_teacher_starts_session_with_unique_pin_and_first_block(): void
    {
        $session = $this->startLiveSession();

        $this->assertMatchesRegularExpression('/^\d{6}$/', $session->pin_code);
        $this->assertSame(LiveSession::STATUS_ACTIVE, $session->status);
        $this->assertSame($this->material->id, $session->current_block_id);
        $this->assertSame($this->module->id, $session->module_id);

        $second = $this->startLiveSession();

        $this->assertNotSame($session->pin_code, $second->pin_code);
        $this->assertSame(LiveSession::STATUS_ENDED, $session->fresh()->status);
        $this->assertSame(1, LiveSession::query()
            ->where('module_id', $this->module->id)
            ->where(fn ($query) => $query->where('status', LiveSession::STATUS_ACTIVE))
            ->count());
    }

    public function test_other_teacher_cannot_start_session_for_foreign_module(): void
    {
        $this->actingAs($this->otherTeacher)
            ->post(route('teacher.live.start', $this->module))
            ->assertForbidden();

        $this->assertDatabaseCount('live_sessions', 0);
    }

    public function test_student_cannot_start_or_view_teacher_stage(): void
    {
        $session = $this->startLiveSession();

        $this->actingAs($this->student)
            ->post(route('teacher.live.start', $this->module))
            ->assertForbidden();

        $this->actingAs($this->student)
            ->get(route('teacher.live.show', $session))
            ->assertForbidden();
    }

    public function test_other_teacher_cannot_open_stage(): void
    {
        $session = $this->startLiveSession();

        $this->actingAs($this->otherTeacher)
            ->get(route('teacher.live.show', $session))
            ->assertForbidden();
    }

    public function test_teacher_stage_renders_stage_component_with_control_token(): void
    {
        $session = $this->startLiveSession();

        $this->actingAs($this->teacher)
            ->get(route('teacher.live.show', $session))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Teacher/Live/Stage')
                ->where('session.pin_code', $session->pin_code)
                ->where('session.status', LiveSession::STATUS_ACTIVE)
                ->has('blocks', 3)
                ->where('blocks.0.content.title', 'Pengenalan')
                ->where('control_token', app(LiveSessionService::class)->controlToken($session))
                ->where('ws_url', config('live.public_ws_url'))
            );
    }

    public function test_student_joins_active_session_with_valid_pin(): void
    {
        $session = $this->startLiveSession();

        $this->actingAs($this->student)
            ->get(route('student.live.room', ['pin' => $session->pin_code]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Student/Live/Room')
                ->where('session.pin_code', $session->pin_code)
                ->has('blocks', 3)
                ->where('blocks.1.content.question', 'Apa fungsi sensor MAP?')
            );
    }

    public function test_student_payload_hides_answer_keys_and_ai_rubric(): void
    {
        $session = $this->startLiveSession();

        $this->actingAs($this->student)
            ->get(route('student.live.room', ['pin' => $session->pin_code]))
            ->assertInertia(function (Assert $page) {
                $blocks = $page->toArray()['props']['blocks'];
                $mcq = collect($blocks)->firstWhere('id', $this->mcq->id);

                $this->assertArrayNotHasKey('explanation', $mcq['content']);
                foreach ($mcq['content']['options'] as $option) {
                    $this->assertArrayNotHasKey('correct', $option);
                }

                $essay = collect($blocks)->firstWhere('id', $this->essay->id);
                $this->assertArrayNotHasKey('ai_rubric', $essay);
            });
    }

    public function test_join_rejects_unknown_pin(): void
    {
        $this->actingAs($this->student)
            ->get(route('student.live.room', ['pin' => '999999']))
            ->assertRedirect(route('student.live.join'))
            ->assertSessionHas('error');
    }

    public function test_join_rejects_ended_session(): void
    {
        $session = $this->startLiveSession();
        $session->update(['status' => LiveSession::STATUS_ENDED]);

        $this->actingAs($this->student)
            ->get(route('student.live.room', ['pin' => $session->pin_code]))
            ->assertRedirect(route('student.live.join'))
            ->assertSessionHas('error');
    }

    public function test_guest_and_teacher_cannot_join_student_room(): void
    {
        $session = $this->startLiveSession();

        auth()->logout();
        $this->get(route('student.live.room', ['pin' => $session->pin_code]))
            ->assertRedirect('/login');

        $this->actingAs($this->teacher)
            ->get(route('student.live.room', ['pin' => $session->pin_code]))
            ->assertForbidden();
    }

    public function test_student_answer_is_stored_and_graded(): void
    {
        $session = $this->startLiveSession();

        $response = $this->actingAs($this->student)
            ->postJson(route('student.live.respond', ['pin' => $session->pin_code]), [
                'block_id' => $this->mcq->id,
                'answer' => ['option_index' => 0],
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('correct', true);

        $this->assertEquals(10.0, $response->json('earned_points'));

        $this->assertDatabaseHas('student_responses', [
            'module_block_id' => $this->mcq->id,
            'student_id' => $this->student->id,
            'is_graded' => true,
        ]);

        $stored = StudentResponse::query()->firstOrFail();
        $this->assertSame(['option_index' => 0], $stored->answer_payload);
    }

    public function test_wrong_mcq_answer_scores_zero(): void
    {
        $session = $this->startLiveSession();

        $this->actingAs($this->student)
            ->postJson(route('student.live.respond', ['pin' => $session->pin_code]), [
                'block_id' => $this->mcq->id,
                'answer' => ['option_index' => 1],
            ])
            ->assertOk()
            ->assertJsonPath('correct', false)
            ->assertJsonPath('earned_points', 0);
    }

    public function test_essay_answer_is_stored_ungraded_for_ai(): void
    {
        $session = $this->startLiveSession();

        $this->actingAs($this->student)
            ->postJson(route('student.live.respond', ['pin' => $session->pin_code]), [
                'block_id' => $this->essay->id,
                'answer' => ['text' => 'Mesin tersendat saat akselerasi.'],
            ])
            ->assertOk()
            ->assertJsonPath('is_graded', false);

        $stored = StudentResponse::query()->firstOrFail();
        $this->assertFalse($stored->is_graded);
    }

    public function test_answer_from_foreign_block_is_rejected(): void
    {
        $session = $this->startLiveSession();

        $foreign = ModuleBlock::factory()->create(['module_id' => LearningModule::factory()->create()->id]);

        $this->actingAs($this->student)
            ->postJson(route('student.live.respond', ['pin' => $session->pin_code]), [
                'block_id' => $foreign->id,
                'answer' => ['option_index' => 0],
            ])
            ->assertStatus(422);

        $this->assertDatabaseCount('student_responses', 0);
    }

    public function test_answer_after_session_end_is_rejected(): void
    {
        $session = $this->startLiveSession();
        $this->actingAs($this->teacher)->postJson(route('teacher.live.end', $session))->assertOk();

        $this->actingAs($this->student)
            ->postJson(route('student.live.respond', ['pin' => $session->pin_code]), [
                'block_id' => $this->mcq->id,
                'answer' => ['option_index' => 0],
            ])
            ->assertStatus(422);

        $this->assertDatabaseCount('student_responses', 0);
    }

    public function test_teacher_updates_current_block_and_ends_session(): void
    {
        $session = $this->startLiveSession();

        $this->actingAs($this->teacher)
            ->patchJson(route('teacher.live.update', $session), [
                'current_block_id' => $this->mcq->id,
                'status' => LiveSession::STATUS_ACTIVE,
            ])
            ->assertOk()
            ->assertJsonPath('session.current_block_id', $this->mcq->id);

        $this->assertSame($this->mcq->id, $session->fresh()->current_block_id);

        $foreign = ModuleBlock::factory()->create(['module_id' => LearningModule::factory()->create()->id]);
        $this->actingAs($this->teacher)
            ->patchJson(route('teacher.live.update', $session), ['current_block_id' => $foreign->id])
            ->assertStatus(422);

        $this->actingAs($this->teacher)
            ->postJson(route('teacher.live.end', $session))
            ->assertOk()
            ->assertJsonPath('session.status', LiveSession::STATUS_ENDED);
    }

    public function test_internal_validation_rejects_wrong_secret(): void
    {
        $session = $this->startLiveSession();

        $this->postJson(route('internal.live.validate'), ['pin' => $session->pin_code, 'role' => 'student'])
            ->assertStatus(401);

        $this->postJson(route('internal.live.validate'), ['pin' => $session->pin_code, 'role' => 'student'], [
            'X-Internal-Secret' => 'wrong-secret',
        ])->assertStatus(401);
    }

    public function test_internal_validation_returns_sanitized_module_for_student(): void
    {
        $session = $this->startLiveSession();

        $response = $this->postJson(route('internal.live.validate'), [
            'pin' => $session->pin_code,
            'role' => 'student',
        ], ['X-Internal-Secret' => 'test-internal-secret'])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('session.id', $session->id)
            ->assertJsonPath('session.status', LiveSession::STATUS_ACTIVE)
            ->assertJsonPath('session.module.id', $this->module->id);

        $blocks = $response->json('session.module.blocks');
        $this->assertCount(3, $blocks);

        $mcq = collect($blocks)->firstWhere('id', $this->mcq->id);
        foreach ($mcq['content']['options'] as $option) {
            $this->assertArrayNotHasKey('correct', $option);
        }
        $this->assertArrayNotHasKey('explanation', $mcq['content']);

        $essay = collect($blocks)->firstWhere('id', $this->essay->id);
        $this->assertArrayNotHasKey('ai_rubric', $essay);
    }

    public function test_internal_validation_requires_valid_teacher_control_token(): void
    {
        $session = $this->startLiveSession();
        $token = app(LiveSessionService::class)->controlToken($session);

        $this->postJson(route('internal.live.validate'), [
            'pin' => $session->pin_code,
            'role' => 'teacher',
            'control_token' => 'bogus',
        ], ['X-Internal-Secret' => 'test-internal-secret'])->assertStatus(403);

        $this->postJson(route('internal.live.validate'), [
            'pin' => $session->pin_code,
            'role' => 'teacher',
            'control_token' => $token,
        ], ['X-Internal-Secret' => 'test-internal-secret'])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('session.id', $session->id)
            ->assertJsonMissingPath('session.module');
    }

    public function test_internal_validation_returns_gone_for_ended_session(): void
    {
        $session = $this->startLiveSession();
        $session->update(['status' => LiveSession::STATUS_ENDED]);

        $this->postJson(route('internal.live.validate'), [
            'pin' => $session->pin_code,
            'role' => 'student',
        ], ['X-Internal-Secret' => 'test-internal-secret'])
            ->assertStatus(410)
            ->assertJsonPath('ok', false);
    }
}
