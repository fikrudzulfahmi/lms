<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\Department;
use App\Models\LearningModule;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SlideImportTest extends TestCase
{
    use RefreshDatabase;

    /** PNG 1x1 valid. */
    private const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    private User $teacher;

    private LearningModule $module;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');

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

    private function dataUrl(string $base64 = self::PNG_1X1, string $mime = 'image/png'): string
    {
        return 'data:'.$mime.';base64,'.$base64;
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(int $pages = 2, array $overrides = []): array
    {
        return array_merge([
            'source_name' => 'materi-pgmfi.pdf',
            'images' => array_fill(0, $pages, $this->dataUrl()),
        ], $overrides);
    }

    private function url(): string
    {
        return "/teacher/modules/{$this->module->id}/slides";
    }

    public function test_guest_student_and_other_teacher_cannot_upload_slides(): void
    {
        $this->postJson($this->url(), $this->payload())->assertUnauthorized();

        $student = User::factory()->create(['role' => User::ROLE_STUDENT]);
        $this->actingAs($student)->postJson($this->url(), $this->payload())->assertForbidden();

        $otherTeacher = User::factory()->create(['role' => User::ROLE_TEACHER]);
        $this->actingAs($otherTeacher)->postJson($this->url(), $this->payload())->assertForbidden();

        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_admin_can_upload_slides_to_any_module(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        $this->actingAs($admin)
            ->postJson($this->url(), $this->payload(1))
            ->assertCreated()
            ->assertJsonPath('count', 1);
    }

    public function test_upload_stores_webp_files_and_returns_public_urls(): void
    {
        $response = $this->actingAs($this->teacher)
            ->postJson($this->url(), $this->payload(3))
            ->assertCreated()
            ->assertJsonPath('count', 3)
            ->assertJsonPath('slides.0.page', 1)
            ->assertJsonPath('slides.2.page', 3)
            ->assertJsonStructure(['slides' => [['path', 'url', 'page', 'name']], 'count', 'source_name']);

        $slides = $response->json('slides');
        $prefix = "modules/{$this->module->id}/";

        $this->assertSame($prefix.'slide-01.webp', $slides[0]['path']);
        $this->assertSame($prefix.'slide-02.webp', $slides[1]['path']);
        $this->assertSame($prefix.'slide-03.webp', $slides[2]['path']);
        $this->assertSame('/storage/'.$prefix.'slide-01.webp', $slides[0]['url']);

        foreach ($slides as $slide) {
            Storage::disk('public')->assertExists($slide['path']);

            $info = getimagesizefromstring(Storage::disk('public')->get($slide['path']));
            $this->assertSame('image/webp', $info['mime'] ?? null, 'Semua slide harus dikonversi ke WebP.');
        }

        $this->assertStringContainsString('halaman 2', $slides[1]['name']);
    }

    public function test_second_upload_continues_numbering(): void
    {
        $this->actingAs($this->teacher)->postJson($this->url(), $this->payload(2))->assertCreated();

        $response = $this->actingAs($this->teacher)
            ->postJson($this->url(), $this->payload(1))
            ->assertCreated()
            ->assertJsonPath('slides.0.path', "modules/{$this->module->id}/slide-03.webp");

        Storage::disk('public')->assertExists($response->json('slides.0.path'));
    }

    public function test_upload_rejects_non_image_and_corrupt_payloads(): void
    {
        $this->actingAs($this->teacher)
            ->postJson($this->url(), ['images' => ['data:text/plain;base64,'.base64_encode('halo')]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('images.0');

        $this->actingAs($this->teacher)
            ->postJson($this->url(), ['images' => [$this->dataUrl(base64_encode('bukan gambar'))]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('images.0');

        $this->actingAs($this->teacher)
            ->postJson($this->url(), ['images' => ['https://example.com/slide.png']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('images.0');

        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_upload_rejects_image_larger_than_four_megabytes(): void
    {
        $oversized = $this->dataUrl(self::PNG_1X1.str_repeat('A', 5_600_000));

        $this->actingAs($this->teacher)
            ->postJson($this->url(), ['images' => [$oversized]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('images.0');

        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_upload_rejects_more_than_sixty_pages(): void
    {
        $this->actingAs($this->teacher)
            ->postJson($this->url(), $this->payload(61))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('images');
    }

    public function test_upload_requires_at_least_one_image(): void
    {
        $this->actingAs($this->teacher)
            ->postJson($this->url(), ['images' => []])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('images');
    }

    public function test_delete_removes_only_files_of_this_module(): void
    {
        $slides = $this->actingAs($this->teacher)
            ->postJson($this->url(), $this->payload(2))
            ->assertCreated()
            ->json('slides');

        $otherModuleSlides = $this->actingAs($this->teacher)
            ->postJson($this->url(), $this->payload(2))
            ->assertCreated()
            ->json('slides');

        Storage::disk('public')->put('modules/foreign-module/slide-01.webp', 'x');

        $this->actingAs($this->teacher)
            ->deleteJson($this->url(), [
                'paths' => [$slides[0]['path'], 'modules/foreign-module/slide-01.webp', '../.env'],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('paths.1');

        $this->actingAs($this->teacher)
            ->deleteJson($this->url(), ['paths' => [$slides[0]['path']]])
            ->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('deleted.0', $slides[0]['path']);

        Storage::disk('public')->assertMissing($slides[0]['path']);
        Storage::disk('public')->assertExists($slides[1]['path']);
        Storage::disk('public')->assertExists($otherModuleSlides[0]['path']);
        Storage::disk('public')->assertExists('modules/foreign-module/slide-01.webp');
    }

    public function test_slide_image_block_accepts_storage_path_or_gallery_array(): void
    {
        $this->actingAs($this->teacher)
            ->postJson("/teacher/modules/{$this->module->id}/blocks", [
                'block_type' => 'slide_image',
                'points' => 0,
                'content' => ['url' => "/storage/modules/{$this->module->id}/slide-01.webp", 'caption' => 'Halaman 1'],
            ])
            ->assertCreated();

        $this->actingAs($this->teacher)
            ->postJson("/teacher/modules/{$this->module->id}/blocks", [
                'block_type' => 'slide_image',
                'points' => 0,
                'content' => ['images' => [
                    "/storage/modules/{$this->module->id}/slide-01.webp",
                    "/storage/modules/{$this->module->id}/slide-02.webp",
                ]],
            ])
            ->assertCreated()
            ->assertJsonCount(2, 'block.content.images');

        $this->actingAs($this->teacher)
            ->postJson("/teacher/modules/{$this->module->id}/blocks", [
                'block_type' => 'slide_image',
                'points' => 0,
                'content' => ['caption' => 'tanpa gambar'],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('content.url');
    }
}
