import { useMemo, useState } from 'react';
import { useForm, router } from '@inertiajs/react';
import TeacherLayout from '@/Layouts/TeacherLayout';
import {
    Badge,
    Button,
    Card,
    CardHeader,
    EmptyState,
    Field,
    PageHeader,
    Toolbar,
    inputClass,
    selectClass,
} from '@/Components/ui';

export default function Objectives({
    subjects = [],
    objectives = [],
    grade_levels = ['X', 'XI', 'XII'],
    filters = {},
    total = 0,
}) {
    const [editingId, setEditingId] = useState(null);

    const form = useForm({
        subject_id: '',
        grade_level: 'XI',
        code: '',
        description: '',
    });

    const grouped = useMemo(() => {
        const map = {};
        objectives.forEach((o) => {
            (map[o.subject_id] ??= []).push(o);
        });
        Object.values(map).forEach((list) =>
            list.sort(
                (a, b) =>
                    String(a.grade_level ?? '').localeCompare(String(b.grade_level ?? '')) ||
                    String(a.code ?? '').localeCompare(String(b.code ?? ''), undefined, { numeric: true }),
            ),
        );
        return map;
    }, [objectives]);

    function applyFilter(key, value) {
        const params = {
            subject_id: filters.subject_id ?? '',
            grade_level: filters.grade_level ?? '',
            q: filters.q ?? '',
        };
        params[key] = value ?? '';

        const query = {};
        Object.entries(params).forEach(([k, v]) => {
            if (v !== '' && v !== null && v !== undefined) query[k] = v;
        });

        router.get('/teacher/objectives', query, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    }

    function submit(e) {
        e.preventDefault();

        const options = {
            preserveScroll: true,
            onSuccess: () => {
                form.reset('code', 'description');
                setEditingId(null);
            },
        };

        if (editingId) {
            form.put(`/teacher/objectives/${editingId}`, options);
        } else {
            form.post('/teacher/objectives', options);
        }
    }

    function startEdit(o) {
        form.clearErrors();
        form.setData({
            subject_id: String(o.subject_id),
            grade_level: o.grade_level,
            code: o.code,
            description: o.description,
        });
        setEditingId(o.id);
    }

    function cancelEdit() {
        setEditingId(null);
        form.clearErrors();
        form.reset();
    }

    function destroy(o) {
        if (!confirm(`Hapus TP ${o.code} (${o.grade_level}) — ${o.subject_name}?`)) return;
        router.delete(`/teacher/objectives/${o.id}`, { preserveScroll: true });
    }

    return (
        <TeacherLayout>
            <PageHeader
                title="Bank TP"
                subtitle="Bank Tujuan Pembelajaran per mapel & jenjang. Kode TP dipakai saat menyusun modul ajar."
                actions={
                    <>
                        <Badge tone="emerald">{objectives.length} tampil</Badge>
                        <Badge>{total} total</Badge>
                    </>
                }
            />

            {subjects.length === 0 && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Belum ada mapel yang bisa Anda kelola. Minta admin melakukan{' '}
                    <span className="font-semibold">Ploting Mengajar</span> untuk Anda di tahun
                    pelajaran aktif.
                </div>
            )}

            <Toolbar>
                <div className="min-w-[12rem] flex-1">
                    <div className="mb-1.5 text-xs font-medium text-zinc-600">Mata Pelajaran</div>
                    <select
                        className={selectClass}
                        value={filters.subject_id ?? ''}
                        onChange={(e) => applyFilter('subject_id', e.target.value)}
                    >
                        <option value="">Semua mapel</option>
                        {subjects.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.code} — {s.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="w-28">
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
                <div className="min-w-[12rem] flex-1">
                    <div className="mb-1.5 text-xs font-medium text-zinc-600">Cari</div>
                    <input
                        className={inputClass}
                        placeholder="Kode atau deskripsi TP…"
                        defaultValue={filters.q ?? ''}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') applyFilter('q', e.currentTarget.value);
                        }}
                        onBlur={(e) => {
                            if (e.currentTarget.value !== (filters.q ?? '')) {
                                applyFilter('q', e.currentTarget.value);
                            }
                        }}
                    />
                </div>
                <div className="ml-auto pb-1">
                    <Button
                        variant="outline"
                        onClick={() => router.get('/teacher/objectives', {})}
                    >
                        Reset
                    </Button>
                </div>
            </Toolbar>

            <Card>
                <CardHeader
                    title={editingId ? 'Edit Tujuan Pembelajaran' : 'Tambah Tujuan Pembelajaran'}
                    subtitle={
                        editingId
                            ? 'Perubahan langsung berlaku untuk bank TP.'
                            : 'Kode unik per mapel + jenjang, contoh TP-1.2 / KD-3.4.'
                    }
                    actions={
                        editingId ? (
                            <Button size="sm" variant="outline" onClick={cancelEdit}>
                                Batal edit
                            </Button>
                        ) : null
                    }
                />
                <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
                    <Field label="Mata Pelajaran" error={form.errors.subject_id}>
                        <select
                            className={selectClass}
                            value={form.data.subject_id}
                            onChange={(e) => form.setData('subject_id', e.target.value)}
                        >
                            <option value="">Pilih mapel</option>
                            {subjects.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.code} — {s.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Jenjang" error={form.errors.grade_level}>
                        <select
                            className={selectClass}
                            value={form.data.grade_level}
                            onChange={(e) => form.setData('grade_level', e.target.value)}
                        >
                            {grade_levels.map((g) => (
                                <option key={g} value={g}>
                                    {g}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Kode TP / KD" error={form.errors.code}>
                        <input
                            className={inputClass}
                            value={form.data.code}
                            placeholder="TP-1.2"
                            onChange={(e) => form.setData('code', e.target.value.toUpperCase())}
                        />
                    </Field>
                    <div className="md:col-span-4">
                        <Field label="Deskripsi" error={form.errors.description}>
                            <textarea
                                className={inputClass}
                                rows={2}
                                value={form.data.description}
                                placeholder="Siswa mampu mendemonstrasikan …"
                                onChange={(e) => form.setData('description', e.target.value)}
                            />
                        </Field>
                    </div>
                    <div className="flex items-end">
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={
                                form.processing ||
                                !form.data.subject_id ||
                                !form.data.code ||
                                !form.data.description
                            }
                        >
                            {form.processing ? 'Menyimpan…' : editingId ? 'Perbarui' : 'Simpan'}
                        </Button>
                    </div>
                </form>
            </Card>

            <div className="mt-4 space-y-4">
                {objectives.length === 0 && (
                    <Card>
                        <EmptyState
                            title="Belum ada TP pada filter ini"
                            description={
                                subjects.length === 0
                                    ? 'Tambahkan mata pelajaran lebih dulu (seed / migrasi).'
                                    : 'Ubah filter atau tambahkan TP baru lewat form di atas.'
                            }
                        />
                    </Card>
                )}

                {subjects.map((s) => {
                    const list = grouped[s.id] ?? [];
                    if (list.length === 0) return null;

                    return (
                        <Card key={s.id}>
                            <CardHeader
                                title={`${s.code} — ${s.name}`}
                                subtitle={`${s.department?.name ?? 'Tanpa jurusan'} · ${list.length} TP`}
                            />
                            <div className="space-y-2">
                                {list.map((o) => (
                                    <div
                                        key={o.id}
                                        className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge tone="emerald">{o.code}</Badge>
                                                <Badge>{o.grade_level}</Badge>
                                                {o.department && <Badge tone="slate">{o.department}</Badge>}
                                            </div>
                                            <p className="mt-1.5 text-sm text-zinc-600">
                                                {o.description}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => startEdit(o)}
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="danger"
                                                onClick={() => destroy(o)}
                                            >
                                                Hapus
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    );
                })}
            </div>
        </TeacherLayout>
    );
}
