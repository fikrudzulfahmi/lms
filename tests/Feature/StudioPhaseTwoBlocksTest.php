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
use Tests\TestCase;

class StudioPhaseTwoBlocksTest extends TestCase
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

    private function blocksUrl(): string
    {
        return '/teacher/modules/'.$this->module->id.'/blocks';
    }

    private function hotspotContent(): array
    {
        return [
            'question' => 'Labeli bagian-bagian mesin berikut.',
            'image_url' => '/storage/modules/x/mesin.png',
            'spots' => [
                ['x' => 25.5, 'y' => 40, 'label' => 'Busi'],
                ['x' => 70, 'y' => 62.5, 'label' => 'Throttle body'],
                ['x' => 50, 'y' => 15, 'label' => 'Filter udara'],
            ],
            'explanation' => '',
        ];
    }

    private function interactiveVideoContent(): array
    {
        return [
            'title' => 'Video praktik pengukuran',
            'url' => '/storage/modules/x/praktik.mp4',
            'checkpoints' => [
                [
                    'at' => 30,
                    'question' => 'Alat apa yang dipakai?',
                    'options' => [['text' => 'Multimeter'], ['text' => 'Kunci pas']],
                    'correct_index' => 0,
                ],
                [
                    'at' => 95,
                    'question' => 'Nilai standar resistansi sensor?',
                    'options' => [['text' => '10 ohm'], ['text' => '200-2500 ohm'], ['text' => '0 ohm']],
                    'correct_index' => 1,
                ],
            ],
        ];
    }

    public function test_teacher_can_create_hotspot_and_interactive_video_blocks(): void
    {
        $hotspot = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), [
            'block_type' => 'soal_hotspot',
            'points' => 10,
            'content' => $this->hotspotContent(),
        ]);

        $hotspot->assertCreated();
        $hotspot->assertJsonPath('block.block_type', 'soal_hotspot');

        $video = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), [
            'block_type' => 'materi_video_interaktif',
            'points' => 10,
            'content' => $this->interactiveVideoContent(),
        ]);

        $video->assertCreated();
        $video->assertJsonPath('block.block_type', 'materi_video_interaktif');

        $this->assertSame(2, $this->module->blocks()->count());
    }

    public function test_teacher_can_create_interactive_video_block_with_studio_default_content(): void
    {
        // Kontrak dengan defaultContent() di Edit.jsx: payload bawaan yang
        // dikirim Studio saat guru mengeklik "Video Interaktif" harus lolos
        // validasi (url contoh terisi — url kosong pernah ditolak backend
        // dengan "The content.url field is required.").
        $response = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), [
            'block_type' => 'materi_video_interaktif',
            'points' => 10,
            'content' => [
                'title' => '',
                'url' => 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                'checkpoints' => [
                    [
                        'at' => 30,
                        'question' => 'Tulis pertanyaan checkpoint...',
                        'options' => [['text' => 'Opsi A'], ['text' => 'Opsi B']],
                        'correct_index' => 0,
                    ],
                ],
            ],
        ]);

        $response->assertCreated();
        $response->assertJsonPath('block.block_type', 'materi_video_interaktif');
    }

    public function test_validation_rejects_invalid_phase_two_blocks(): void
    {
        $tooFewSpots = $this->hotspotContent();
        $tooFewSpots['spots'] = [$tooFewSpots['spots'][0]];

        $response = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), [
            'block_type' => 'soal_hotspot',
            'points' => 10,
            'content' => $tooFewSpots,
        ]);
        $response->assertUnprocessable();

        $duplicateLabels = $this->hotspotContent();
        $duplicateLabels['spots'][1]['label'] = 'Busi';

        $response = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), [
            'block_type' => 'soal_hotspot',
            'points' => 10,
            'content' => $duplicateLabels,
        ]);
        $response->assertUnprocessable();

        $badCheckpoint = $this->interactiveVideoContent();
        $badCheckpoint['checkpoints'][0]['correct_index'] = 5;

        $response = $this->actingAs($this->teacher)->postJson($this->blocksUrl(), [
            'block_type' => 'materi_video_interaktif',
            'points' => 10,
            'content' => $badCheckpoint,
        ]);
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors('content.checkpoints.0.correct_index');

        $this->assertSame(0, $this->module->blocks()->count());
    }

    public function test_hotspot_grading_requires_all_labels_correct(): void
    {
        $service = app(LiveSessionService::class);

        $block = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'block_type' => ModuleBlock::BLOCK_SOAL_HOTSPOT,
            'points' => 12,
            'content' => $this->hotspotContent(),
        ]);

        $allCorrect = $service->gradeAnswer($block, [
            'assignments' => ['0' => 'Busi', '1' => 'Throttle body', '2' => 'Filter udara'],
        ]);
        $this->assertTrue($allCorrect['correct']);
        $this->assertTrue($allCorrect['is_graded']);
        $this->assertSame(12.0, $allCorrect['earned_points']);

        $oneWrong = $service->gradeAnswer($block, [
            'assignments' => ['0' => 'Busi', '1' => 'Filter udara', '2' => 'Filter udara'],
        ]);
        $this->assertFalse($oneWrong['correct']);
        $this->assertSame(0.0, $oneWrong['earned_points']);

        $incomplete = $service->gradeAnswer($block, [
            'assignments' => ['0' => 'Busi'],
        ]);
        $this->assertFalse($incomplete['correct']);
    }

    public function test_interactive_video_grading_uses_ratio(): void
    {
        $service = app(LiveSessionService::class);

        $block = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'block_type' => ModuleBlock::BLOCK_MATERI_VIDEO_INTERAKTIF,
            'points' => 10,
            'content' => $this->interactiveVideoContent(),
        ]);

        // 1 dari 2 checkpoint benar -> setengah poin.
        $half = $service->gradeAnswer($block, ['answers' => ['0' => 0, '1' => 0]]);
        $this->assertTrue($half['is_graded']);
        $this->assertFalse($half['correct']);
        $this->assertSame(5.0, $half['earned_points']);

        $full = $service->gradeAnswer($block, ['answers' => ['0' => 0, '1' => 1]]);
        $this->assertTrue($full['correct']);
        $this->assertSame(10.0, $full['earned_points']);

        $none = $service->gradeAnswer($block, ['answers' => ['0' => 1, '1' => 2]]);
        $this->assertFalse($none['correct']);
        $this->assertSame(0.0, $none['earned_points']);

        // Blok tanpa checkpoint tidak dinilai.
        $empty = ModuleBlock::factory()->create([
            'module_id' => $this->module->id,
            'block_type' => ModuleBlock::BLOCK_MATERI_VIDEO_INTERAKTIF,
            'points' => 10,
            'content' => ['title' => '', 'url' => '/storage/modules/x/v.mp4', 'checkpoints' => []],
        ]);

        $ungraded = $service->gradeAnswer($empty, ['answers' => []]);
        $this->assertFalse($ungraded['is_graded']);
        $this->assertNull($ungraded['correct']);
    }
}
