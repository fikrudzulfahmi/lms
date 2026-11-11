<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Subject;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class SubjectController extends Controller
{
    public function index(Request $request): Response
    {
        $search = $request->string('q')->trim()->toString() ?: null;
        $departmentId = $request->integer('department_id') ?: null;

        $subjects = Subject::with('department')
            ->withCount(['learningObjectives', 'teachingAssignments'])
            ->when($departmentId, fn ($q, $id) => $q->where('department_id', $id))
            ->when($search, fn ($q, $term) => $q->where(
                fn ($inner) => $inner
                    ->where('code', 'like', "%{$term}%")
                    ->orWhere('name', 'like', "%{$term}%"),
            ))
            ->orderBy('department_id')
            ->orderBy('name')
            ->get()
            ->map(fn (Subject $s) => [
                'id' => $s->id,
                'code' => $s->code,
                'name' => $s->name,
                'category' => $s->category,
                'department_id' => $s->department_id,
                'department_code' => $s->department?->code,
                'objectives_count' => $s->learning_objectives_count,
                'assignments_count' => $s->teaching_assignments_count,
            ]);

        return Inertia::render('Admin/Subjects', [
            'subjects' => $subjects,
            'departments' => Department::orderBy('code')->get(['id', 'code', 'name']),
            'categories' => Subject::CATEGORY_TYPES,
            'filters' => [
                'q' => $search,
                'department_id' => $departmentId,
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        Subject::create($data);

        return back()->with('success', 'Mata pelajaran ditambahkan.');
    }

    public function update(Request $request, Subject $subject): RedirectResponse
    {
        $subject->update($this->validated($request, $subject));

        return back()->with('success', 'Mata pelajaran diperbarui.');
    }

    public function destroy(Subject $subject): RedirectResponse
    {
        if ($subject->teachingAssignments()->exists()) {
            return back()->with('error', 'Mapel masih dipakai ploting mengajar. Hapus plotingnya dulu.');
        }

        if ($subject->learningObjectives()->exists()) {
            return back()->with('error', 'Mapel masih punya TP di bank. Hapus TP-nya dulu.');
        }

        $subject->delete();

        return back()->with('success', 'Mata pelajaran dihapus.');
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Subject $subject = null): array
    {
        $data = $request->validate([
            'code' => [
                'required',
                'string',
                'max:20',
                Rule::unique('subjects', 'code')->ignore($subject?->id),
            ],
            'name' => ['required', 'string', 'max:120'],
            'department_id' => ['nullable', 'integer', Rule::exists('departments', 'id')],
            'category' => ['required', Rule::in(Subject::CATEGORY_TYPES)],
        ], [
            'code.unique' => 'Kode mapel sudah dipakai.',
        ]);

        $data['code'] = strtoupper(trim((string) $data['code']));
        $data['name'] = trim((string) $data['name']);

        return $data;
    }
}
