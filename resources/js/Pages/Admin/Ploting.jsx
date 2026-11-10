import { useMemo, useState } from 'react';
import { router } from '@inertiajs/react';
import AdminLayout from '@/Layouts/AdminLayout';
import {
    Badge,
    Button,
    Card,
    CardHeader,
    EmptyState,
    Field,
    PageHeader,
    Toolbar,
    selectClass,
} from '@/Components/ui';

export default function Ploting({
    year = null,
    teachers = [],
    subjects = [],
    classrooms = [],
    matrix = {},
    teacher_load = {},
    departments = [],
    filters = {},
    summary = { assignments: 0, teachers: 0, subjects: 0 },
}) {
    const [form, setForm] = useState({
        teacher_id: '',
        subject_id: '',
        classroom_ids: [],
    });
    const [saving, setSaving] = useState(false);
    const [onlyAssigned, setOnlyAssigned] = useState(false);

    const classroomMap = useMemo(() => {
        const map = {};
        classrooms.forEach((c) => {
            map[c.id] = c;
        });
        return map;
    }, [classrooms]);

    const visibleSubjects = useMemo(() => {
        if (!onlyAssigned) return subjects;
        return subjects.filter((s) =>
            teachers.some((t) => (matrix[t.id]?.[s.id] ?? []).length > 0),
        );
    }, [onlyAssigned, matrix, subjects, teachers]);

    const activeCount = useMemo(
        () =>
            Object.values(matrix).reduce(
                (sum, bySubject) =>
                    sum +
                    Object.values(bySubject).reduce((inner, list) => inner + list.length, 0),
                0,
            ),
        [matrix],
    );

    function toggleClassroom(classroomId) {
        setForm((f) => ({
            ...f,
            classroom_ids: f.classroom_ids.includes(classroomId)
                ? f.classroom_ids.filter((id) => id !== classroomId)
                : [...f.classroom_ids, classroomId],
        }));
    }

    function save() {
        if (!year || !form.teacher_id || !form.subject_id || form.classroom_ids.length === 0) {
            return;
        }

        setSaving(true);
        router.post(
            '/admin/ploting',
            {
                teacher_id: form.teacher_id,
                subject_id: form.subject_id,
                classroom_ids: form.classroom_ids,
                academic_year_id: year.id,
            },
            {
                preserveScroll: true,
                onFinish: () => setSaving(false),
            },
        );
    }

    function removeAssignment(id) {
        router.delete(`/admin/ploting/${id}`, { preserveScroll: true });
    }

    function openCell(teacherId, subjectId) {
        const existing = matrix[teacherId]?.[subjectId] ?? [];
        setForm({
            teacher_id: String(teacherId),
            subject_id: String(subjectId),
            classroom_ids: existing.map((e) => e.classroom_id),
        });
    }

    function applyDepartment(value) {
        router.get(
            '/admin/ploting',
            value ? { department_id: value } : {},
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    if (!year) {
        return (
            <AdminLayout>
                <PageHeader title="Ploting Mengajar" />
                <Card>
                    <EmptyState
                        title="Belum ada tahun pelajaran aktif"
                        description="Aktifkan TP di menu Tahun Pelajaran untuk membuka matriks ploting."
                        action={
                            <Button onClick={() => router.visit('/admin/academic-years')}>
                                Ke Tahun Pelajaran
                            </Button>
                        }
                    />
                </Card>
            </AdminLayout>
        );
    }

    const alreadySelected = form.subject_id
        ? (matrix[form.teacher_id]?.[form.subject_id] ?? []).map((e) => e.classroom_id)
        : [];

    return (
        <AdminLayout>
            <PageHeader
                title="Ploting Mengajar"
                subtitle={`Matriks guru × mapel × kelas pada ${year.label}. Klik sel untuk mengisi, klik chip kelas untuk melepas.`}
                actions={
                    <>
                        <Badge tone="emerald">{activeCount} ploting</Badge>
                        <Badge>{summary.teachers} guru</Badge>
                        <Badge>{summary.subjects} mapel</Badge>
                    </>
                }
            />

            <Toolbar>
                <div className="min-w-[12rem]">
                    <div className="mb-1.5 text-xs font-medium text-zinc-600">Filter Jurusan</div>
                    <select
                        className={selectClass}
                        value={filters.department_id ?? ''}
                        onChange={(e) => applyDepartment(e.target.value)}
                    >
                        <option value="">Semua jurusan</option>
                        {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.code} — {d.name}
                            </option>
                        ))}
                    </select>
                </div>
                <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-zinc-600">
                    <input
                        type="checkbox"
                        className="h-4 w-4 accent-emerald-600"
                        checked={onlyAssigned}
                        onChange={(e) => setOnlyAssigned(e.target.checked)}
                    />
                    Hanya mapel yang sudah diplot
                </label>
            </Toolbar>

            <Card>
                <CardHeader
                    title="Form Ploting"
                    subtitle="Pilih guru + mapel, centang kelas (bisa banyak sekaligus), lalu simpan."
                />
                <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Guru">
                        <select
                            className={selectClass}
                            value={form.teacher_id}
                            onChange={(e) =>
                                setForm({
                                    teacher_id: e.target.value,
                                    subject_id: '',
                                    classroom_ids: [],
                                })
                            }
                        >
                            <option value="">Pilih guru</option>
                            {teachers.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name} ({t.username})
                                </option>
                            ))}
                        </select>
                        {form.teacher_id && teacher_load[form.teacher_id] !== undefined && (
                            <p className="mt-1 text-xs text-zinc-500">
                                Beban saat ini: {teacher_load[form.teacher_id]} kelas
                            </p>
                        )}
                    </Field>

                    <Field label="Mata Pelajaran">
                        <select
                            className={selectClass}
                            value={form.subject_id}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    subject_id: e.target.value,
                                    classroom_ids:
                                        matrix[f.teacher_id]?.[e.target.value]?.map(
                                            (x) => x.classroom_id,
                                        ) ?? [],
                                }))
                            }
                        >
                            <option value="">Pilih mapel</option>
                            {subjects.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.code} — {s.name}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <div>
                        <div className="mb-1.5 text-xs font-medium text-zinc-600">
                            Kelas ({form.classroom_ids.length} dipilih)
                        </div>
                        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-zinc-200 p-2">
                            {classrooms.map((c) => {
                                const checked = form.classroom_ids.includes(c.id);
                                return (
                                    <label
                                        key={c.id}
                                        className={
                                            'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ' +
                                            (checked
                                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50')
                                        }
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleClassroom(c.id)}
                                            className="h-3.5 w-3.5 accent-emerald-600"
                                        />
                                        {c.name}
                                    </label>
                                );
                            })}
                            {classrooms.length === 0 && (
                                <span className="text-sm text-zinc-400">Belum ada kelas.</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                        onClick={save}
                        disabled={
                            saving ||
                            !form.teacher_id ||
                            !form.subject_id ||
                            form.classroom_ids.length === 0
                        }
                    >
                        {saving ? 'Menyimpan…' : 'Simpan Ploting'}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setForm({ teacher_id: '', subject_id: '', classroom_ids: [] })}
                    >
                        Reset
                    </Button>
                    {form.teacher_id && form.subject_id && alreadySelected.length > 0 && (
                        <span className="text-xs text-zinc-500">
                            {alreadySelected.length} kelas sudah terplot untuk kombinasi ini.
                        </span>
                    )}
                </div>
            </Card>

            <Card className="mt-4">
                <CardHeader
                    title="Matriks Guru × Mapel"
                    subtitle={`${teachers.length} guru aktif · ${visibleSubjects.length} mapel ditampilkan.`}
                />
                {teachers.length === 0 ? (
                    <EmptyState
                        title="Belum ada guru aktif"
                        description="Tambahkan akun guru untuk menyusun ploting."
                    />
                ) : visibleSubjects.length === 0 ? (
                    <EmptyState title="Belum ada mata pelajaran" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10 min-w-[12rem] border-b border-zinc-200 bg-white px-2 py-2 text-left text-xs font-medium text-zinc-500">
                                        Guru
                                    </th>
                                    {visibleSubjects.map((s) => (
                                        <th
                                            key={s.id}
                                            className="min-w-[7rem] border-b border-zinc-200 px-2 py-2 text-left align-bottom text-xs font-medium text-zinc-500"
                                        >
                                            <span className="block font-mono text-[10px] text-zinc-400">
                                                {s.code}
                                            </span>
                                            {s.name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {teachers.map((t) => (
                                    <tr key={t.id} className="border-b border-zinc-100 last:border-0">
                                        <td className="sticky left-0 z-10 border-r border-zinc-100 bg-white px-2 py-2">
                                            <div className="truncate font-medium text-zinc-900">
                                                {t.name}
                                            </div>
                                            <div className="font-mono text-[10px] text-zinc-400">
                                                {teacher_load[t.id] ?? 0} kelas
                                            </div>
                                        </td>
                                        {visibleSubjects.map((s) => {
                                            const entries = matrix[t.id]?.[s.id] ?? [];
                                            const isActive =
                                                String(form.teacher_id) === String(t.id) &&
                                                String(form.subject_id) === String(s.id);

                                            return (
                                                <td
                                                    key={s.id}
                                                    className={
                                                        'px-1.5 py-1.5 align-top ' +
                                                        (isActive ? 'bg-emerald-50/60' : '')
                                                    }
                                                >
                                                    <div className="flex min-h-[2rem] flex-wrap gap-1">
                                                        {entries.map((e) => (
                                                            <span
                                                                key={e.id}
                                                                className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700"
                                                            >
                                                                {classroomMap[e.classroom_id]?.name ??
                                                                    `#${e.classroom_id}`}
                                                                <button
                                                                    type="button"
                                                                    aria-label="Hapus ploting"
                                                                    onClick={() => removeAssignment(e.id)}
                                                                    className="text-emerald-600 hover:text-red-600"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </span>
                                                        ))}
                                                        <button
                                                            type="button"
                                                            onClick={() => openCell(t.id, s.id)}
                                                            className="rounded border border-dashed border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-emerald-400 hover:text-emerald-600"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="mt-3 text-xs text-zinc-500">
                    Klik <span className="font-mono">+</span> pada sel untuk memilih guru & mapel otomatis,
                    lalu centang kelas di form atas.
                </p>
            </Card>
        </AdminLayout>
    );
}
