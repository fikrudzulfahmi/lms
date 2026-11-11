import { useMemo, useState } from 'react';
import { useForm, router } from '@inertiajs/react';
import AdminLayout from '@/Layouts/AdminLayout';
import {
    Badge,
    Button,
    Card,
    CardHeader,
    EmptyState,
    Field,
    Modal,
    PageHeader,
    Toolbar,
    inputClass,
    selectClass,
} from '@/Components/ui';

const TABS = [
    { key: 'kelas', label: 'Kelas' },
    { key: 'jurusan', label: 'Jurusan' },
    { key: 'siswa', label: 'Penempatan Siswa' },
    { key: 'import', label: 'Import CSV' },
    { key: 'induk', label: 'Data Induk' },
];

export default function Classrooms({
    departments = [],
    classrooms = [],
    unplaced_students = [],
    grade_levels = ['X', 'XI', 'XII'],
    filters = {},
    active_year = null,
    csv = { headers: [], template: '' },
}) {
    const [tab, setTab] = useState('kelas');
    const [activeClassroom, setActiveClassroom] = useState(null);
    const [search, setSearch] = useState('');

    // ---------------------------------------------------------------- kelas
    const classroomForm = useForm({ department_id: '', grade_level: 'XI', name: '' });
    const [classroomModal, setClassroomModal] = useState({ open: false, id: null });

    function openCreateClassroom() {
        classroomForm.clearErrors();
        classroomForm.setData({ department_id: '', grade_level: 'XI', name: '' });
        setClassroomModal({ open: true, id: null });
    }

    function openEditClassroom(c) {
        classroomForm.clearErrors();
        classroomForm.setData({
            department_id: String(c.department_id ?? ''),
            grade_level: c.grade_level,
            name: c.name,
        });
        setClassroomModal({ open: true, id: c.id });
    }

    function submitClassroom(e) {
        e.preventDefault();
        const options = {
            preserveScroll: true,
            onSuccess: () => setClassroomModal({ open: false, id: null }),
        };

        if (classroomModal.id) {
            classroomForm.put(`/admin/classrooms/${classroomModal.id}`, options);
        } else {
            classroomForm.post('/admin/classrooms', options);
        }
    }

    function destroyClassroom(c) {
        if (!confirm(`Hapus kelas ${c.name}? Siswa yang terpasang ikut dilepas.`)) return;
        router.delete(`/admin/classrooms/${c.id}`, { preserveScroll: true });
    }

    // -------------------------------------------------------------- jurusan
    const deptForm = useForm({ code: '', name: '' });
    const [deptModal, setDeptModal] = useState({ open: false, id: null });

    function openCreateDept() {
        deptForm.clearErrors();
        deptForm.setData({ code: '', name: '' });
        setDeptModal({ open: true, id: null });
    }

    function openEditDept(d) {
        deptForm.clearErrors();
        deptForm.setData({ code: d.code, name: d.name });
        setDeptModal({ open: true, id: d.id });
    }

    function submitDept(e) {
        e.preventDefault();
        const options = {
            preserveScroll: true,
            onSuccess: () => setDeptModal({ open: false, id: null }),
        };

        if (deptModal.id) {
            deptForm.put(`/admin/departments/${deptModal.id}`, options);
        } else {
            deptForm.post('/admin/departments', options);
        }
    }

    function destroyDept(d) {
        if (!confirm(`Hapus jurusan ${d.code} — ${d.name}?`)) return;
        router.delete(`/admin/departments/${d.id}`, { preserveScroll: true });
    }

    // ------------------------------------------------------------- penempatan
    function placeStudent(classroomId, studentId) {
        router.post(
            `/admin/classrooms/${classroomId}/students`,
            { student_id: studentId },
            { preserveScroll: true },
        );
    }

    function unplace(classroomId, studentId) {
        router.delete(`/admin/classrooms/${classroomId}/students/${studentId}`, {
            preserveScroll: true,
        });
    }

    const openClassroom = activeClassroom
        ? classrooms.find((c) => c.id === activeClassroom)
        : null;

    const filteredUnplaced = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return unplaced_students;
        return unplaced_students.filter((s) =>
            [s.name, s.username, s.nisn].filter(Boolean).some((v) =>
                String(v).toLowerCase().includes(term),
            ),
        );
    }, [search, unplaced_students]);

    // ------------------------------------------------------------- import CSV
    const csvForm = useForm({ csv: null, classroom_id: '' });

    function submitCsv(e) {
        e.preventDefault();
        csvForm.post('/admin/classrooms/import-students', {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => csvForm.reset('csv'),
        });
    }

    function downloadTemplate() {
        const blob = new Blob([csv.template || 'name,username,email,nisn\n'], {
            type: 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'template-siswa.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ------------------------------------------------------------ data induk
    const [indukClasses, setIndukClasses] = useState([]);
    const [indukState, setIndukState] = useState({ loading: false, error: null, loaded: false });
    const [indukQuery, setIndukQuery] = useState('');
    const [indukOnlyMatched, setIndukOnlyMatched] = useState(false);
    const syncForm = useForm({ kelas: '', classroom_id: '' });

    async function loadIndukClasses() {
        setIndukState({ loading: true, error: null, loaded: false });
        try {
            const res = await fetch('/admin/classrooms/induk/classes', {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.message || 'Gagal memuat kelas induk.');
            setIndukClasses(json.classes ?? []);
            setIndukState({ loading: false, error: null, loaded: true });
        } catch (err) {
            setIndukState({ loading: false, error: err.message, loaded: false });
        }
    }

    const normaliseName = (name) =>
        String(name)
            .trim()
            .replace(/\s+/g, ' ')
            .toUpperCase()
            .replace(/^(XII|XI|X)\b/, (m) => ({ X: 10, XI: 11, XII: 12 })[m]);

    const matchedClassroomId = (kelas) => {
        const target = normaliseName(kelas);
        return classrooms.find((c) => normaliseName(c.name) === target)?.id ?? '';
    };

    function pickIndukClass(row) {
        const matched = matchedClassroomId(row.kelas);
        syncForm.setData({ kelas: row.kelas, classroom_id: matched ? String(matched) : '' });
    }

    function submitSync(e) {
        e.preventDefault();
        syncForm.post('/admin/classrooms/induk/sync', { preserveScroll: true });
    }

    function syncAllMatched() {
        if (!confirm('Tarik siswa untuk semua kelas yang namanya cocok dengan data induk?')) return;
        router.post('/admin/classrooms/induk/sync-all', {}, { preserveScroll: true });
    }

    const filteredInduk = useMemo(() => {
        const term = indukQuery.trim().toLowerCase();
        return indukClasses.filter((row) => {
            if (indukOnlyMatched && !matchedClassroomId(row.kelas)) return false;
            return !term || String(row.kelas ?? '').toLowerCase().includes(term);
        });
    }, [indukClasses, indukQuery, indukOnlyMatched, classrooms]);

    // ---------------------------------------------------------------- filter
    function applyFilter(key, value) {
        const params = {
            department_id: filters.department_id ?? '',
            grade_level: filters.grade_level ?? '',
        };
        params[key] = value ?? '';

        const query = {};
        Object.entries(params).forEach(([k, v]) => {
            if (v !== '' && v !== null && v !== undefined) query[k] = v;
        });

        router.get('/admin/classrooms', query, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    }

    return (
        <AdminLayout>
            <PageHeader
                title="Kelas & Siswa"
                subtitle={
                    active_year
                        ? `Penempatan siswa untuk ${active_year.label}.`
                        : 'Aktifkan tahun pelajaran dulu untuk penempatan siswa.'
                }
                actions={
                    <>
                        {TABS.map((t) => (
                            <Button
                                key={t.key}
                                size="sm"
                                variant={tab === t.key ? 'primary' : 'outline'}
                                onClick={() => setTab(t.key)}
                            >
                                {t.label}
                            </Button>
                        ))}
                    </>
                }
            />

            {tab === 'kelas' && (
                <>
                    <Toolbar>
                        <div className="min-w-[11rem] flex-1">
                            <div className="mb-1.5 text-xs font-medium text-zinc-600">Jurusan</div>
                            <select
                                className={selectClass}
                                value={filters.department_id ?? ''}
                                onChange={(e) => applyFilter('department_id', e.target.value)}
                            >
                                <option value="">Semua jurusan</option>
                                {departments.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.code} — {d.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="w-32">
                            <div className="mb-1.5 text-xs font-medium text-zinc-600">Jenjang</div>
                            <select
                                className={selectClass}
                                value={filters.grade_level ?? ''}
                                onChange={(e) => applyFilter('grade_level', e.target.value)}
                            >
                                <option value="">Semua</option>
                                {grade_levels.map((g) => (
                                    <option key={g} value={g}>
                                        {g}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="ml-auto">
                            <Button onClick={openCreateClassroom}>+ Tambah Kelas</Button>
                        </div>
                    </Toolbar>

                    <Card>
                        <CardHeader
                            title="Daftar Kelas"
                            subtitle={`${classrooms.length} kelas pada filter aktif.`}
                        />
                        {classrooms.length === 0 ? (
                            <EmptyState
                                title="Belum ada kelas"
                                description="Tambahkan jurusan lebih dulu jika belum ada, lalu buat kelas."
                                action={<Button onClick={openCreateClassroom}>+ Tambah Kelas</Button>}
                            />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                                            <th className="pb-2 font-medium">Kelas</th>
                                            <th className="pb-2 font-medium">Jurusan</th>
                                            <th className="pb-2 font-medium">Jenjang</th>
                                            <th className="pb-2 text-right font-medium">Siswa</th>
                                            <th className="pb-2 text-right font-medium">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {classrooms.map((c) => (
                                            <tr key={c.id} className="border-b border-zinc-100 last:border-0">
                                                <td className="py-2.5 font-medium text-zinc-900">{c.name}</td>
                                                <td className="py-2.5 text-zinc-600">
                                                    <span className="font-mono text-xs text-zinc-500">
                                                        {c.department?.code}
                                                    </span>{' '}
                                                    {c.department?.name}
                                                </td>
                                                <td className="py-2.5">
                                                    <Badge>{c.grade_level}</Badge>
                                                </td>
                                                <td className="py-2.5 text-right tabular-nums text-zinc-600">
                                                    {c.students_count}
                                                </td>
                                                <td className="py-2.5">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => openEditClassroom(c)}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="danger"
                                                            onClick={() => destroyClassroom(c)}
                                                        >
                                                            Hapus
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </>
            )}

            {tab === 'jurusan' && (
                <Card>
                    <CardHeader
                        title="Jurusan"
                        subtitle="Kode jurusan dipakai pada mapel dan kelas."
                        actions={<Button onClick={openCreateDept}>+ Tambah Jurusan</Button>}
                    />
                    {departments.length === 0 ? (
                        <EmptyState
                            title="Belum ada jurusan"
                            description="Tambahkan jurusan (mis. TSM, TKJ) sebelum membuat kelas."
                        />
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {departments.map((d) => (
                                <div
                                    key={d.id}
                                    className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-mono text-xs text-zinc-500">{d.code}</div>
                                            <div className="mt-0.5 truncate font-medium text-zinc-900">
                                                {d.name}
                                            </div>
                                        </div>
                                        <Badge tone="emerald">{d.classrooms_count} kelas</Badge>
                                    </div>
                                    <div className="mt-3 flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => openEditDept(d)}>
                                            Edit
                                        </Button>
                                        <Button size="sm" variant="danger" onClick={() => destroyDept(d)}>
                                            Hapus
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {tab === 'siswa' && (
                <>
                    {!active_year && (
                        <Card className="mb-4 border-amber-200 bg-amber-50">
                            <p className="text-sm text-amber-800">
                                Belum ada tahun pelajaran aktif. Penempatan siswa dinonaktifkan sampai TP
                                diaktifkan di menu Tahun Pelajaran.
                            </p>
                        </Card>
                    )}

                    <Card>
                        <CardHeader
                            title="Pilih Kelas"
                            subtitle="Klik kelas untuk melihat siswa dan menempatkan siswa baru."
                        />
                        {classrooms.length === 0 ? (
                            <EmptyState title="Belum ada kelas" />
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {classrooms.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setActiveClassroom(c.id)}
                                        className={
                                            'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ' +
                                            (activeClassroom === c.id
                                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50')
                                        }
                                    >
                                        {c.name}
                                        <span className="ml-1.5 font-mono text-xs text-zinc-400">
                                            {c.students_count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {openClassroom && (
                            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/60 p-4">
                                <div className="mb-2 text-sm font-medium text-zinc-900">
                                    Siswa {openClassroom.name} ({openClassroom.students_count})
                                </div>
                                {openClassroom.students.length === 0 ? (
                                    <p className="text-sm text-zinc-400">Belum ada siswa di kelas ini.</p>
                                ) : (
                                    <ul className="space-y-1.5">
                                        {openClassroom.students.map((cs) => (
                                            <li
                                                key={cs.id}
                                                className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                                            >
                                                <span className="min-w-0 truncate">
                                                    <span className="font-medium text-zinc-900">
                                                        {cs.student?.name}
                                                    </span>{' '}
                                                    <span className="font-mono text-xs text-zinc-500">
                                                        {cs.student?.nisn || cs.student?.username}
                                                    </span>
                                                </span>
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    onClick={() => unplace(openClassroom.id, cs.student_id)}
                                                >
                                                    Keluarkan
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </Card>

                    <Card className="mt-4">
                        <CardHeader
                            title="Belum Tertempatan"
                            subtitle={`${unplaced_students.length} siswa belum punya kelas pada ${
                                active_year?.label ?? 'TP aktif'
                            }.`}
                            actions={
                                <input
                                    className="w-56 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    placeholder="Cari nama / NISN…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            }
                        />
                        {filteredUnplaced.length === 0 ? (
                            <p className="text-sm text-zinc-400">
                                {unplaced_students.length === 0
                                    ? 'Semua siswa sudah tertempatan.'
                                    : 'Tidak ada siswa yang cocok dengan pencarian.'}
                            </p>
                        ) : (
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {filteredUnplaced.map((s) => (
                                    <div
                                        key={s.id}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                                    >
                                        <span className="min-w-0 truncate">
                                            <span className="font-medium text-zinc-900">{s.name}</span>
                                            <br />
                                            <span className="font-mono text-xs text-zinc-500">
                                                {s.nisn || s.username}
                                            </span>
                                        </span>
                                        {activeClassroom ? (
                                            <Button
                                                size="sm"
                                                onClick={() => placeStudent(activeClassroom, s.id)}
                                            >
                                                Pasang
                                            </Button>
                                        ) : (
                                            <span className="shrink-0 text-xs text-zinc-400">
                                                Pilih kelas
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </>
            )}

            {tab === 'import' && (
                <Card>
                    <CardHeader
                        title="Import Siswa dari CSV"
                        subtitle={`Kolom: ${csv.headers.join(', ')} — pemisah koma atau titik koma.`}
                        actions={
                            <Button size="sm" variant="outline" onClick={downloadTemplate}>
                                Unduh Template
                            </Button>
                        }
                    />
                    <form onSubmit={submitCsv} className="grid gap-3 sm:grid-cols-[1fr_14rem_auto]">
                        <Field
                            label="File CSV"
                            error={csvForm.errors.csv}
                            hint="Maks 5 MB. Baris tanpa name dilewati."
                        >
                            <input
                                type="file"
                                accept=".csv,text/csv,text/plain"
                                className={inputClass}
                                onChange={(e) =>
                                    csvForm.setData('csv', e.target.files?.[0] ?? null)
                                }
                            />
                        </Field>
                        <Field
                            label="Tempatkan ke Kelas"
                            error={csvForm.errors.classroom_id}
                            hint="Opsional."
                        >
                            <select
                                className={selectClass}
                                value={csvForm.data.classroom_id}
                                onChange={(e) => csvForm.setData('classroom_id', e.target.value)}
                            >
                                <option value="">Tanpa penempatan</option>
                                {classrooms.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <div className="flex items-end">
                            <Button
                                type="submit"
                                disabled={csvForm.processing || !csvForm.data.csv}
                                className="w-full sm:w-auto"
                            >
                                {csvForm.processing ? 'Mengimpor…' : 'Import'}
                            </Button>
                        </div>
                    </form>
                    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 font-mono text-xs leading-relaxed text-zinc-600">
                        {(csv.template || 'name,username,email,nisn').trim()}
                    </div>
                </Card>
            )}

            {tab === 'induk' && (
                <div className="grid items-start gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader
                            title="Kelas di Data Induk"
                            subtitle="Sumber: induk.smkislam1blitar.sch.id"
                            actions={
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={loadIndukClasses}
                                    disabled={indukState.loading}
                                >
                                    {indukState.loading
                                        ? 'Memuat…'
                                        : indukState.loaded
                                          ? 'Muat Ulang'
                                          : 'Muat Kelas'}
                                </Button>
                            }
                        />

                        {indukState.error && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                                {indukState.error}
                            </div>
                        )}

                        {!indukState.loaded && !indukState.error && (
                            <EmptyState
                                title="Belum dimuat"
                                description="Klik Muat Kelas untuk mengambil daftar rombel beserta jumlah siswa aktif dari aplikasi data induk."
                            />
                        )}

                        {indukState.loaded && (
                            <>
                                <input
                                    className={inputClass}
                                    placeholder="Cari kelas, mis. 10 DPIB"
                                    value={indukQuery}
                                    onChange={(e) => setIndukQuery(e.target.value)}
                                />
                                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                                    <input
                                        type="checkbox"
                                        className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600"
                                        checked={indukOnlyMatched}
                                        onChange={(e) => setIndukOnlyMatched(e.target.checked)}
                                    />
                                    Hanya kelas yang sudah ada di LMS
                                </label>
                                <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-xl border border-zinc-100">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-zinc-50/95 backdrop-blur">
                                            <tr className="border-b border-zinc-200 text-left text-[11px] uppercase tracking-wide text-zinc-600">
                                                <th className="px-3 py-2 font-semibold">Kelas</th>
                                                <th className="px-3 py-2 text-right font-semibold">Siswa</th>
                                                <th className="px-3 py-2 text-right font-semibold">LMS</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredInduk.map((row) => {
                                                const selected = syncForm.data.kelas === row.kelas;
                                                const matched = matchedClassroomId(row.kelas);
                                                return (
                                                    <tr
                                                        key={`${row.id}-${row.kelas}`}
                                                        onClick={() => pickIndukClass(row)}
                                                        className={
                                                            'cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-emerald-50/50 ' +
                                                            (selected ? 'bg-emerald-50' : '')
                                                        }
                                                    >
                                                        <td className="px-3 py-2.5 font-medium text-zinc-800">
                                                            {row.kelas}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right tabular-nums text-zinc-600">
                                                            {row.jumlah_siswa}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right">
                                                            {matched ? (
                                                                <Badge tone="emerald">cocok</Badge>
                                                            ) : (
                                                                <span className="text-xs text-zinc-400">—</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {filteredInduk.length === 0 && (
                                        <p className="px-3 py-6 text-center text-sm text-zinc-500">
                                            Tidak ada kelas yang cocok.
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </Card>

                    <Card>
                        <CardHeader
                            title="Tarik ke Kelas LMS"
                            subtitle="Siswa dibuat/diperbarui berdasarkan NISN, lalu ditempatkan ke kelas terpilih."
                        />

                        <form onSubmit={submitSync} className="space-y-3">
                            <Field
                                label="Kelas Data Induk"
                                error={syncForm.errors.kelas}
                                hint={
                                    syncForm.data.kelas
                                        ? undefined
                                        : 'Pilih baris di tabel sebelah kiri.'
                                }
                            >
                                <input
                                    className={inputClass}
                                    value={syncForm.data.kelas}
                                    placeholder="10 DPIB 1"
                                    onChange={(e) => syncForm.setData('kelas', e.target.value)}
                                />
                            </Field>

                            <Field label="Kelas LMS" error={syncForm.errors.classroom_id}>
                                <select
                                    className={selectClass}
                                    value={syncForm.data.classroom_id}
                                    onChange={(e) =>
                                        syncForm.setData('classroom_id', e.target.value)
                                    }
                                >
                                    <option value="">Pilih kelas tujuan</option>
                                    {classrooms.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Button
                                type="submit"
                                disabled={
                                    syncForm.processing ||
                                    !syncForm.data.kelas ||
                                    !syncForm.data.classroom_id
                                }
                                className="w-full"
                            >
                                {syncForm.processing ? 'Menarik data…' : 'Tarik Siswa'}
                            </Button>
                        </form>

                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
                            Butuh banyak kelas sekaligus? Tombol di bawah menarik semua kelas yang
                            namanya persis sama dengan kelas di LMS.
                        </div>

                        <Button
                            variant="outline"
                            onClick={syncAllMatched}
                            className="mt-3 w-full"
                            disabled={classrooms.length === 0}
                        >
                            Tarik Semua Kelas yang Cocok
                        </Button>
                    </Card>
                </div>
            )}

            <Modal
                open={classroomModal.open}
                onClose={() => setClassroomModal({ open: false, id: null })}
                title={classroomModal.id ? 'Edit Kelas' : 'Tambah Kelas'}
                footer={
                    <>
                        <Button
                            variant="outline"
                            onClick={() => setClassroomModal({ open: false, id: null })}
                        >
                            Batal
                        </Button>
                        <Button
                            onClick={submitClassroom}
                            disabled={
                                classroomForm.processing ||
                                !classroomForm.data.department_id ||
                                !classroomForm.data.name
                            }
                        >
                            {classroomForm.processing ? 'Menyimpan…' : 'Simpan'}
                        </Button>
                    </>
                }
            >
                <form onSubmit={submitClassroom} className="space-y-3">
                    <Field label="Jurusan" error={classroomForm.errors.department_id}>
                        <select
                            className={selectClass}
                            value={classroomForm.data.department_id}
                            onChange={(e) => classroomForm.setData('department_id', e.target.value)}
                        >
                            <option value="">Pilih jurusan</option>
                            {departments.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.code} — {d.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Jenjang" error={classroomForm.errors.grade_level}>
                        <select
                            className={selectClass}
                            value={classroomForm.data.grade_level}
                            onChange={(e) => classroomForm.setData('grade_level', e.target.value)}
                        >
                            {grade_levels.map((g) => (
                                <option key={g} value={g}>
                                    {g}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Nama Kelas" error={classroomForm.errors.name}>
                        <input
                            className={inputClass}
                            value={classroomForm.data.name}
                            placeholder="XI TSM 2"
                            onChange={(e) => classroomForm.setData('name', e.target.value)}
                        />
                    </Field>
                    <button type="submit" className="hidden" aria-hidden="true" />
                </form>
            </Modal>

            <Modal
                open={deptModal.open}
                onClose={() => setDeptModal({ open: false, id: null })}
                title={deptModal.id ? 'Edit Jurusan' : 'Tambah Jurusan'}
                footer={
                    <>
                        <Button variant="outline" onClick={() => setDeptModal({ open: false, id: null })}>
                            Batal
                        </Button>
                        <Button
                            onClick={submitDept}
                            disabled={
                                deptForm.processing || !deptForm.data.code || !deptForm.data.name
                            }
                        >
                            {deptForm.processing ? 'Menyimpan…' : 'Simpan'}
                        </Button>
                    </>
                }
            >
                <form onSubmit={submitDept} className="space-y-3">
                    <Field label="Kode" error={deptForm.errors.code} hint="Contoh: TSM, TKJ, TKR.">
                        <input
                            className={inputClass}
                            value={deptForm.data.code}
                            placeholder="TSM"
                            maxLength={10}
                            onChange={(e) => deptForm.setData('code', e.target.value.toUpperCase())}
                        />
                    </Field>
                    <Field label="Nama Jurusan" error={deptForm.errors.name}>
                        <input
                            className={inputClass}
                            value={deptForm.data.name}
                            placeholder="Teknik Sepeda Motor"
                            onChange={(e) => deptForm.setData('name', e.target.value)}
                        />
                    </Field>
                    <button type="submit" className="hidden" aria-hidden="true" />
                </form>
            </Modal>
        </AdminLayout>
    );
}
