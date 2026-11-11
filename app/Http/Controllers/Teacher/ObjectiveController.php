<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreLearningObjectiveRequest;
use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\LearningObjective;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ObjectiveController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $subjectIds = $this->allowedSubjectIds($user);

        $subjectId = $request->integer('subject_id') ?: null;
        $gradeLevel = $request->string('grade_level')->trim()->toString() ?: null;
        $search = $request->string('q')->trim()->toString() ?: null;

        $subjects = Subject::with('department')
            ->when($subjectIds !== null, fn ($q) => $q->whereIn('id', $subjectIds))
            ->orderBy('name')
            ->get();

        $objectives = LearningObjective::with(['subject.department'])
            ->when($subjectIds !== null, fn ($q) => $q->whereIn('subject_id', $subjectIds))
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

        return Inertia::render('Teacher/Objectives', [
            'subjects' => $subjects,
            'objectives' => $objectives,
            'grade_levels' => Classroom::GRADE_LEVELS,
            'filters' => [
                'subject_id' => $subjectId,
                'grade_level' => $gradeLevel,
                'q' => $search,
            ],
            'total' => LearningObjective::when($subjectIds !== null, fn ($q) => $q->whereIn('subject_id', $subjectIds))->count(),
        ]);
    }

    public function store(StoreLearningObjectiveRequest $request): RedirectResponse
    {
        $this->ensureSubjectAllowed($request->user(), (int) $request->validated('subject_id'));

        LearningObjective::create([
            'subject_id' => $request->validated('subject_id'),
            'grade_level' => $request->validated('grade_level'),
            'code' => $request->validated('code'),
            'description' => $request->validated('description'),
            'teacher_id' => null,
        ]);

        return back()->with('success', 'Tujuan pembelajaran ditambahkan.');
    }

    public function update(StoreLearningObjectiveRequest $request, LearningObjective $objective): RedirectResponse
    {
        $this->ensureSubjectAllowed($request->user(), (int) $request->validated('subject_id'));
        $this->ensureSubjectAllowed($request->user(), (int) $objective->subject_id);

        $objective->update($request->validated());

        return back()->with('success', 'Tujuan pembelajaran diperbarui.');
    }

    public function destroy(Request $request, LearningObjective $objective): RedirectResponse
    {
        $this->ensureSubjectAllowed($request->user(), (int) $objective->subject_id);

        if ($objective->modules()->exists()) {
            return back()->with('error', 'TP masih dipakai modul ajar. Lepas dari modul dulu.');
        }

        $objective->delete();

        return back()->with('success', 'Tujuan pembelajaran dihapus.');
    }

    /**
     * Admin may manage every subject; a teacher only the subjects they are
     * plotted to teach in the active academic year.
     *
     * @return list<int>|null null means "no restriction"
     */
    private function allowedSubjectIds(?User $user): ?array
    {
        if ($user === null) {
            return [];
        }

        if ($user->role === User::ROLE_ADMIN) {
            return null;
        }

        return TeachingAssignment::query()
            ->where('teacher_id', $user->id)
            ->where('academic_year_id', AcademicYear::active()?->id ?? 0)
            ->pluck('subject_id')
            ->unique()
            ->values()
            ->all();
    }

    private function ensureSubjectAllowed(?User $user, int $subjectId): void
    {
        $allowed = $this->allowedSubjectIds($user);

        if ($allowed === null) {
            return;
        }

        abort_unless(in_array($subjectId, $allowed, true), 403, 'Mapel ini tidak Anda ampu.');
    }
}
