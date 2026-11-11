<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\ClassroomStudent;
use App\Models\Department;
use App\Models\User;
use App\Services\ClassroomStudentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class IndukSyncTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<int, array{nisn:string, nama:string, kelas:string}> */
    protected array $indukStudents = [];

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.induk.base' => 'https://induk.test',
            'services.induk.key' => 'secret-key',
            'services.induk.timeout' => 5,
        ]);

        $authorised = fn (Request $request) => $request->hasHeader('X-API-KEY', 'secret-key');

        Http::fake([
            'induk.test/apiSiswa/kelas' => fn (Request $request) => $authorised($request)
                ? Http::response([
                    'status' => 'success',
                    'jumlah' => 1,
                    'data' => [
                        [
                            'id' => 1,
                            'kelas' => '10 DPIB 1',
                            'tingkat' => '10',
                            'jumlah_siswa' => count($this->indukStudents),
                        ],
                    ],
                ])
                : Http::response(['status' => 'error', 'message' => 'Kunci API tidak valid'], 401),
            'induk.test/apiSiswa/siswa*' => fn (Request $request) => $authorised($request)
                ? Http::response([
                    'status' => 'success',
                    'meta' => [
                        'total' => count($this->indukStudents),
                        'jumlah' => count($this->indukStudents),
                        'page' => 1,
                        'per_page' => 500,
                        'total_halaman' => 1,
                    ],
                    'data' => $this->indukStudents,
                ])
                : Http::response(['status' => 'error', 'message' => 'Kunci API tidak valid'], 401),
        ]);
    }

    protected function admin(): User
    {
        return User::factory()->create(['role' => User::ROLE_ADMIN, 'is_active' => true]);
    }

    protected function activeYear(): AcademicYear
    {
        return AcademicYear::factory()->create([
            'name' => '2026/2027',
            'semester' => 'ganjil',
            'is_active' => true,
        ]);
    }

    protected function classroom(string $name = '10 DPIB 1'): Classroom
    {
        $department = Department::firstWhere('name', 'Desain Pemodelan')
            ?? Department::factory()->create(['code' => 'DPIB', 'name' => 'Desain Pemodelan']);

        return Classroom::factory()->create([
            'department_id' => $department->id,
            'grade_level' => 'X',
            'name' => $name,
        ]);
    }

    /**
     * @param  array<int, array{nisn:string, nama:string, kelas:string}>|null  $students
     */
    protected function fakeInduk(?array $students = null): void
    {
        $this->indukStudents = $students ?? [
            ['nisn' => '0112434272', 'nama' => 'ADIKA AVRAM FAHRI', 'kelas' => '10 DPIB 1'],
            ['nisn' => '0113932515', 'nama' => 'ADINDA LUTFIATUL KHASANAH', 'kelas' => '10 DPIB 1'],
        ];
    }

    public function test_sync_creates_students_and_places_them_in_active_year(): void
    {
        $year = $this->activeYear();
        $classroom = $this->classroom();
        $this->fakeInduk();

        $result = app(ClassroomStudentService::class)->importFromInduk('10 DPIB 1', $classroom->id);

        $this->assertSame(2, $result['fetched']);
        $this->assertSame(2, $result['imported']);
        $this->assertSame(2, $result['placed']);

        $student = User::where('nisn', '0112434272')->firstOrFail();
        $this->assertSame('ADIKA AVRAM FAHRI', $student->name);
        $this->assertSame('0112434272', $student->username);
        $this->assertSame(User::ROLE_STUDENT, $student->role);

        $this->assertDatabaseHas('classroom_student', [
            'academic_year_id' => $year->id,
            'classroom_id' => $classroom->id,
            'student_id' => $student->id,
        ]);

        Http::assertSent(fn (Request $request) => $request->hasHeader('X-API-KEY', 'secret-key')
            && str_contains($request->url(), 'kelas=10%20DPIB%201'));
    }

    public function test_second_sync_updates_instead_of_duplicating(): void
    {
        $this->activeYear();
        $classroom = $this->classroom();
        $this->fakeInduk();

        $service = app(ClassroomStudentService::class);
        $service->importFromInduk('10 DPIB 1', $classroom->id);

        $this->fakeInduk([
            ['nisn' => '0112434272', 'nama' => 'ADIKA A. FAHRI', 'kelas' => '10 DPIB 1'],
        ]);

        $result = $service->importFromInduk('10 DPIB 1', $classroom->id);

        $this->assertSame(0, $result['imported']);
        $this->assertSame(1, $result['updated']);
        $this->assertSame(2, User::where('role', User::ROLE_STUDENT)->count());
        $this->assertSame('ADIKA A. FAHRI', User::where('nisn', '0112434272')->value('name'));
    }

    public function test_sync_all_matched_only_touches_matching_classroom_names(): void
    {
        $this->activeYear();
        $matched = $this->classroom('10 DPIB 1');
        $this->classroom('10 TKJ 1');
        $this->fakeInduk();

        $result = app(ClassroomStudentService::class)->importAllMatchedFromInduk();

        $this->assertSame(1, $result['classes']);
        $this->assertSame(2, $result['imported']);
        $this->assertSame(2, ClassroomStudent::where('classroom_id', $matched->id)->count());
    }

    public function test_classroom_name_normalisation_matches_roman_and_numeric_grades(): void
    {
        $this->assertSame('11 TSM 1', ClassroomStudentService::normaliseName('XI TSM 1'));
        $this->assertSame('10 DPIB 1', ClassroomStudentService::normaliseName(' 10  dpib   1 '));
        $this->assertSame('12 TKJ 2', ClassroomStudentService::normaliseName('XII TKJ 2'));
        $this->assertSame('11 TSM 1', ClassroomStudentService::normaliseName('11 TSM 1'));
    }

    public function test_bad_api_key_surfaces_readable_error(): void
    {
        $this->activeYear();
        $classroom = $this->classroom();
        $this->fakeInduk();
        config(['services.induk.key' => 'wrong-key']);

        $this->expectExceptionMessage('API data induk menolak permintaan (HTTP 401). Kunci API tidak valid');

        app(ClassroomStudentService::class)->importFromInduk('10 DPIB 1', $classroom->id);
    }

    public function test_admin_can_sync_from_the_classrooms_page(): void
    {
        $this->activeYear();
        $classroom = $this->classroom();
        $this->fakeInduk();

        $this->actingAs($this->admin())
            ->post('/admin/classrooms/induk/sync', [
                'kelas' => '10 DPIB 1',
                'classroom_id' => $classroom->id,
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertSame(2, User::where('role', User::ROLE_STUDENT)->count());
    }

    public function test_classroom_list_endpoint_returns_induk_classes(): void
    {
        $this->fakeInduk();

        $this->actingAs($this->admin())
            ->getJson('/admin/classrooms/induk/classes')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('classes.0.kelas', '10 DPIB 1')
            ->assertJsonPath('classes.0.jumlah_siswa', 2);
    }

    public function test_missing_configuration_returns_json_error(): void
    {
        config(['services.induk.key' => null]);

        $this->actingAs($this->admin())
            ->getJson('/admin/classrooms/induk/classes')
            ->assertStatus(502)
            ->assertJsonPath('ok', false);
    }
}
