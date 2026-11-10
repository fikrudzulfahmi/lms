<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreAcademicYearRequest;
use App\Http\Requests\StoreClassroomRequest;
use App\Http\Requests\StoreDepartmentRequest;
use App\Http\Requests\StoreLearningObjectiveRequest;
use App\Http\Requests\StoreTeachingAssignmentRequest;
use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\ClassroomStudent;
use App\Models\Department;
use App\Models\LearningObjective;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use App\Services\ClassroomStudentService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class AdminController
{
    /*
    |--------------------------------------------------------------------------
    | Dashboard
    |--------------------------------------------------------------------------
    */

    public function dashboard(Request $request): Response
    {
        $activeYear = AcademicYear::active();

        $yearId = $request->integer('academic_year_id') ?: $activeYear?->id;
        $departmentId = $request->integer('department_id') ?: null;
        $gradeLevel = $request->string('grade_level')->trim()->toString() ?: null;

        if ($gradeLevel !== null && ! in_array($gradeLevel, Classroom::GRADE_LEVELS, true)) {
            $gradeLevel = null;
        }

        $classrooms = Classroom::query()
            ->when($departmentId, fn ($q, $id) => $q->where('department_id', $id))
            ->when($gradeLevel, fn ($q, $grade) => $q->where('grade_level', $grade))
            ->with('department:id,code,name')
            ->withCount('students')
            ->orderBy('name')
            ->get();

        $classroomIds = $classrooms->pluck('id');

        $assignments = TeachingAssignment::query()
            ->when($yearId, fn ($q, $id) => $q->where('academic_year_id', $id))
            ->when(
                $departmentId !== null || $gradeLevel !== null,
                fn ($q) => $q->whereIn('classroom_id', $classroomIds),
            );

        $studentQuery = ClassroomStudent::query()
            ->when($yearId, fn ($q, $id) => $q->where('academic_year_id', $id))
            ->whereIn('classroom_id', $classroomIds);

        $objectiveQuery = LearningObjective::query()
            ->when($departmentId, fn ($q, $id) => $q->whereHas('subject', fn ($s) => $s->where('department_id', $id)))
            ->when($gradeLevel, fn ($q, $grade) => $q->where('grade_level', $grade));

        $stats = [
            'classrooms' => $classrooms->count(),
            'students' => (clone $studentQuery)->distinct()->count('student_id'),
            'teachers' => (clone $assignments)->distinct()->count('teacher_id'),
            'subjects' => Subject::query()
                ->when($departmentId, fn ($q, $id) => $q->where('department_id', $id))
                ->count(),
            'objectives' => $objectiveQuery->count(),
            'teaching_assignments' => (clone $assignments)->count(),
        ];

        $studentsByDepartment = ClassroomStudent::query()
            ->when($yearId, fn ($q, $id) => $q->where('academic_year_id', $id))
            ->join('classrooms', 'classrooms.id', '=', 'classroom_student.classroom_id')
            ->selectRaw('classrooms.department_id, COUNT(DISTINCT classroom_student.student_id) as total')
            ->groupBy('classrooms.department_id')
            ->pluck('total', 'classrooms.department_id');

        $departments = Department::query()
            ->withCount('classrooms')
            ->orderBy('code')
            ->get()
            ->map(fn (Department $d) => [
                'id' => $d->id,
                'code' => $d->code,
                'name' => $d->name,
                'classrooms_count' => $d->classrooms_count,
                'students_count' => (int) ($studentsByDepartment[$d->id] ?? 0),
            ]);

        $topTeachers = (clone $assignments)
            ->join('users', 'users.id', '=', 'teaching_assignments.teacher_id')
            ->selectRaw('users.id as teacher_id, users.name as teacher_name, COUNT(DISTINCT teaching_assignments.classroom_id) as classroom_count, COUNT(*) as assignment_count')
            ->groupBy('users.id', 'users.name')
            ->orderByDesc('classroom_count')
            ->limit(5)
            ->get();

        $recent = (clone $assignments)
            ->with(['teacher:id,name', 'subject:id,code,name', 'classroom:id,name'])
            ->latest('id')
            ->limit(8)
            ->get()
            ->map(fn (TeachingAssignment $a) => [
                'id' => $a->id,
                'teacher' => $a->teacher?->name,
                'subject' => $a->subject?->name,
                'subject_code' => $a->subject?->code,
                'classroom' => $a->classroom?->name,
            ]);

        return Inertia::render('Admin/Dashboard', [
            'stats' => $stats,
            'active_year' => $activeYear === null ? null : [
                'id' => $activeYear->id,
                'name' => $activeYear->name,
                'semester' => $activeYear->semester,
                'label' => $activeYear->name.' '.$activeYear->semester,
            ],
            'filters' => [
                'academic_year_id' => $yearId,
                'department_id' => $departmentId,
                'grade_level' => $gradeLevel,
            ],
            'options' => [
                'years' => AcademicYear::query()
                    ->orderByDesc('name')
                    ->orderByDesc('semester')
                    ->get(['id', 'name', 'semester', 'is_active'])
                    ->map(fn (AcademicYear $y) => [
                        'id' => $y->id,
                        'label' => $y->name.' '.$y->semester,
                        'is_active' => $y->is_active,
                    ]),
                'departments' => $departments,
                'grade_levels' => Classroom::GRADE_LEVELS,
            ],
            'by_department' => $departments,
            'top_teachers' => $topTeachers,
            'recent_assignments' => $recent,
            'classrooms' => $classrooms->map(fn (Classroom $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'grade_level' => $c->grade_level,
                'department' => $c->department?->code,
                'students_count' => $c->students_count,
            ]),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Tahun Pelajaran
    |--------------------------------------------------------------------------
    */

    public function academicYears(): Response
    {
        $years = AcademicYear::query()
            ->withCount(['teachingAssignments', 'classroomStudents'])
            ->orderByDesc('name')
            ->orderByDesc('semester')
            ->get()
            ->map(fn (AcademicYear $y) => [
                'id' => $y->id,
                'name' => $y->name,
                'semester' => $y->semester,
                'is_active' => $y->is_active,
                'teaching_assignment_count' => $y->teaching_assignments_count,
                'student_count' => $y->classroom_students_count,
            ]);

        return Inertia::render('Admin/AcademicYears', [
            'years' => $years,
            'semesters' => ['ganjil', 'genap'],
        ]);
    }

    public function storeAcademicYear(StoreAcademicYearRequest $request): RedirectResponse
    {
        AcademicYear::create([
            'name' => $request->validated('name'),
            'semester' => $request->validated('semester'),
            'is_active' => false,
        ]);

        return back()->with('success', 'Tahun pelajaran ditambahkan.');
    }

    public function activateAcademicYear(AcademicYear $year): RedirectResponse
    {
        $year->activate();

        return back()->with('success', "Tahun pelajaran {$year->name} {$year->semester} diaktifkan.");
    }

    public function destroyAcademicYear(AcademicYear $year): RedirectResponse
    {
        if ($year->is_active) {
            return back()->with('error', 'Tahun pelajaran aktif tidak bisa dihapus. Aktifkan TP lain dulu.');
        }

        if ($year->teachingAssignments()->exists() || $year->classroomStudents()->exists()) {
            return back()->with('error', 'TP masih punya ploting atau siswa. Bersihkan dulu.');
        }

        $year->delete();

        return back()->with('success', 'Tahun pelajaran dihapus.');
    }

    /*
    |--------------------------------------------------------------------------
    | Jurusan
    |--------------------------------------------------------------------------
    */

    public function storeDepartment(StoreDepartmentRequest $request): RedirectResponse
    {
        Department::create($request->validated());

        return back()->with('success', 'Jurusan ditambahkan.');
    }

    public function updateDepartment(StoreDepartmentRequest $request, Department $department): RedirectResponse
    {
        $department->update($request->validated());

        return back()->with('success', 'Jurusan diperbarui.');
    }

    public function destroyDepartment(Department $department): RedirectResponse
    {
        if ($department->classrooms()->exists() || $department->subjects()->exists()) {
            return back()->with('error', 'Jurusan masih punya kelas atau mapel. Pindahkan/hapus dulu.');
        }

        $department->delete();

        return back()->with('success', 'Jurusan dihapus.');
    }

    /*
    |--------------------------------------------------------------------------
    | Kelas & Siswa
    |--------------------------------------------------------------------------
    */

    public function classrooms(Request $request): Response
    {
        $activeYear = AcademicYear::active();

        $departmentId = $request->integer('department_id') ?: null;
        $gradeLevel = $request->string('grade_level')->trim()->toString() ?: null;

        $departments = Department::withCount('classrooms')->orderBy('code')->get();

        $classrooms = Classroom::with(['department', 'students.student'])
            ->withCount('students')
            ->when($departmentId, fn ($q, $id) => $q->where('department_id', $id))
            ->when(
                $gradeLevel !== null && in_array($gradeLevel, Classroom::GRADE_LEVELS, true),
                fn ($q) => $q->where('grade_level', $gradeLevel),
            )
            ->orderBy('department_id')
            ->orderBy('grade_level')
            ->orderBy('name')
            ->get();

        $unplacedStudents = collect();

        if ($activeYear !== null) {
            $placedIds = ClassroomStudent::where('academic_year_id', $activeYear->id)
                ->pluck('student_id');

            $unplacedStudents = User::where('role', User::ROLE_STUDENT)
                ->whereNotIn('id', $placedIds)
                ->orderBy('name')
                ->get()
                ->map(fn (User $u) => [
                    'id' => $u->id,
                    'name' => $u->name,
                    'username' => $u->username,
                    'nisn' => $u->nisn,
                ]);
        }

        return Inertia::render('Admin/Classrooms', [
            'departments' => $departments,
            'classrooms' => $classrooms,
            'unplaced_students' => $unplacedStudents,
            'grade_levels' => Classroom::GRADE_LEVELS,
            'filters' => [
                'department_id' => $departmentId,
                'grade_level' => $gradeLevel,
            ],
            'active_year' => $activeYear === null ? null : [
                'id' => $activeYear->id,
                'label' => $activeYear->name.' '.$activeYear->semester,
            ],
            'csv' => [
                'headers' => ['name', 'username', 'email', 'nisn'],
                'template' => "name,username,email,nisn\nRizky Pratama,NISN0001234501,rizky@student.sch.id,0001234501\n",
            ],
        ]);
    }

    public function storeClassroom(StoreClassroomRequest $request): RedirectResponse
    {
        Classroom::create($request->validated());

        return back()->with('success', 'Kelas dibuat.');
    }

    public function updateClassroom(StoreClassroomRequest $request, Classroom $classroom): RedirectResponse
    {
        $classroom->update($request->validated());

        return back()->with('success', 'Kelas diperbarui.');
    }

    public function destroyClassroom(Classroom $classroom): RedirectResponse
    {
        if ($classroom->teachingAssignments()->exists()) {
            return back()->with('error', 'Kelas masih punya ploting mengajar. Hapus ploting dulu.');
        }

        $classroom->students()->delete();
        $classroom->delete();

        return back()->with('success', 'Kelas dihapus.');
    }

    public function placeStudent(Request $request, Classroom $classroom, ClassroomStudentService $service): RedirectResponse
    {
        $data = $request->validate([
            'student_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $service->place($classroom->id, (int) $data['student_id']);

        return back()->with('success', 'Siswa ditempatkan ke '.$classroom->name.'.');
    }

    public function unplaceStudent(Classroom $classroom, int $studentId, ClassroomStudentService $service): RedirectResponse
    {
        $service->unplace($classroom->id, $studentId);

        return back()->with('success', 'Siswa dikeluarkan dari '.$classroom->name.'.');
    }

    public function importStudents(Request $request, ClassroomStudentService $service): RedirectResponse
    {
        $data = $request->validate([
            'csv' => ['required', 'file', 'mimes:csv,txt', 'max:5120'],
            'classroom_id' => ['nullable', 'integer', 'exists:classrooms,id'],
        ]);

        $result = $service->importCsv(
            $request->file('csv'),
            isset($data['classroom_id']) ? (int) $data['classroom_id'] : null,
        );

        $message = sprintf(
            'Import CSV: %d baru, %d diperbarui, %d dilewati, %d ditempatkan.',
            $result['imported'],
            $result['updated'],
            $result['skipped'],
            $result['placed'],
        );

        if (count($result['errors']) > 0) {
            $message .= ' '.implode(' ', array_slice($result['errors'], 0, 3));
            if (count($result['errors']) > 3) {
                $message .= ' (+'.(count($result['errors']) - 3).' lainnya)';
            }
        }

        return back()->with('success', $message);
    }

    /*
    |--------------------------------------------------------------------------
    | Ploting Mengajar
    |--------------------------------------------------------------------------
    */

    public function ploting(Request $request): Response
    {
        $year = AcademicYear::active();
        $departmentId = $request->integer('department_id') ?: null;

        $subjects = Subject::with('department')
            ->when($departmentId, fn ($q, $id) => $q->where('department_id', $id))
            ->orderBy('name')
            ->get();

        if ($year === null) {
            return Inertia::render('Admin/Ploting', [
                'year' => null,
                'teachers' => [],
                'subjects' => $subjects,
                'classrooms' => [],
                'matrix' => [],
                'teacher_load' => [],
                'departments' => Department::orderBy('code')->get(['id', 'code', 'name']),
                'filters' => ['department_id' => $departmentId],
                'summary' => ['assignments' => 0, 'teachers' => 0, 'subjects' => 0],
            ]);
        }

        $teachers = User::where('role', User::ROLE_TEACHER)
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'username']);

        $classrooms = Classroom::with(['department'])
            ->withCount('students')
            ->when($departmentId, fn ($q, $id) => $q->where('department_id', $id))
            ->orderBy('department_id')
            ->orderBy('grade_level')
            ->orderBy('name')
            ->get();

        // Matrix: teacher_id => subject_id => [{id, classroom_id}]
        $assignments = TeachingAssignment::where('academic_year_id', $year->id)
            ->select('id', 'teacher_id', 'subject_id', 'classroom_id')
            ->get();

        $matrix = [];

        foreach ($assignments as $a) {
            $matrix[(string) $a->teacher_id][(string) $a->subject_id][] = [
                'id' => $a->id,
                'classroom_id' => (int) $a->classroom_id,
            ];
        }

        $teacherLoad = $assignments
            ->groupBy('teacher_id')
            ->map(fn ($g) => $g->count())
            ->toArray();

        return Inertia::render('Admin/Ploting', [
            'year' => ['id' => $year->id, 'label' => $year->name.' '.$year->semester],
            'teachers' => $teachers,
            'subjects' => $subjects,
            'classrooms' => $classrooms,
            'matrix' => $matrix,
            'teacher_load' => $teacherLoad,
            'departments' => Department::orderBy('code')->get(['id', 'code', 'name']),
            'filters' => ['department_id' => $departmentId],
            'summary' => [
                'assignments' => $assignments->count(),
                'teachers' => $assignments->pluck('teacher_id')->unique()->count(),
                'subjects' => $assignments->pluck('subject_id')->unique()->count(),
            ],
        ]);
    }

    public function storePloting(StoreTeachingAssignmentRequest $request): RedirectResponse
    {
        $data = $request->validated();

        $year = AcademicYear::find($data['academic_year_id']);

        if ($year === null) {
            return back()->with('error', 'Pilih tahun pelajaran aktif dulu.');
        }

        DB::transaction(function () use ($year, $data) {
            foreach (array_unique($data['classroom_ids']) as $classroomId) {
                // Idempotent upsert: (teacher, subject, classroom, year)
                TeachingAssignment::updateOrInsert(
                    [
                        'academic_year_id' => $year->id,
                        'teacher_id' => $data['teacher_id'],
                        'subject_id' => $data['subject_id'],
                        'classroom_id' => (int) $classroomId,
                    ],
                    ['created_at' => now(), 'updated_at' => now()],
                );
            }
        });

        return back()->with('success', 'Ploting mengajar disimpan ('.count($data['classroom_ids']).' kelas).');
    }

    public function destroyPloting(TeachingAssignment $assignment): RedirectResponse
    {
        $assignment->delete();

        return back()->with('success', 'Ploting dihapus.');
    }

    /*
    |--------------------------------------------------------------------------
    | Bank TP (Tujuan Pembelajaran)
    |--------------------------------------------------------------------------
    */

    public function objectives(Request $request): Response
    {
        $subjectId = $request->integer('subject_id') ?: null;
        $gradeLevel = $request->string('grade_level')->trim()->toString() ?: null;
        $search = $request->string('q')->trim()->toString() ?: null;

        $subjects = Subject::with('department')->orderBy('name')->get();

        $objectives = LearningObjective::with(['subject.department'])
            ->when($subjectId, fn ($q, $id) => $q->where('subject_id', $id))
            ->when($gradeLevel, fn ($q, $grade) => $q->where('grade_level', $grade))
            ->when($search, fn ($q, $term) => $q->where(
                fn ($inner) => $inner
                    ->where('code', 'like', "%{$term}%")
                    ->orWhere('description', 'like', "%{$term}%"),
            ))
            ->orderBy('subject_id')
            ->orderBy('grade_level')
            ->orderBy('code')
            ->get()
            ->map(fn (LearningObjective $o) => [
                'id' => $o->id,
                'subject_id' => $o->subject_id,
                'subject_code' => $o->subject?->code,
                'subject_name' => $o->subject?->name,
                'department' => $o->subject?->department?->code,
                'grade_level' => $o->grade_level,
                'code' => $o->code,
                'description' => $o->description,
            ]);

        return Inertia::render('Admin/Objectives', [
            'subjects' => $subjects,
            'objectives' => $objectives,
            'grade_levels' => Classroom::GRADE_LEVELS,
            'filters' => [
                'subject_id' => $subjectId,
                'grade_level' => $gradeLevel,
                'q' => $search,
            ],
            'total' => LearningObjective::count(),
        ]);
    }

    public function storeObjective(StoreLearningObjectiveRequest $request): RedirectResponse
    {
        $data = $request->validated();

        LearningObjective::create([
            'subject_id' => $data['subject_id'],
            'grade_level' => $data['grade_level'],
            'code' => $data['code'],
            'description' => $data['description'],
            'teacher_id' => null,
        ]);

        return back()->with('success', 'Tujuan pembelajaran ditambahkan.');
    }

    public function updateObjective(StoreLearningObjectiveRequest $request, LearningObjective $objective): RedirectResponse
    {
        $objective->update($request->validated());

        return back()->with('success', 'Tujuan pembelajaran diperbarui.');
    }

    public function destroyObjective(LearningObjective $objective): RedirectResponse
    {
        if ($objective->modules()->exists()) {
            return back()->with('error', 'TP masih dipakai modul ajar. Lepas dari modul dulu.');
        }

        $objective->delete();

        return back()->with('success', 'Tujuan pembelajaran dihapus.');
    }
}
