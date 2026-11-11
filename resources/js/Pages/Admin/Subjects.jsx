import { useMemo, useState } from 'react';
import { router, useForm } from '@inertiajs/react';
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
    inputClass,
    selectClass,
} from '@/Components/ui';

const categoryLabel = (value) =>
    value === 'kejuruan' ? 'Kejuruan' : value === 'umum' ? 'Umum' : value ?? '—';

export default function Subjects({
    subjects = [],
    departments = [],
    categories = ['umum', 'kejuruan'],
    filters = {},
}) {
    const [editingId, setEditingId] = useState(null);
    const [query, setQuery] = useState(filters.q ?? '');

    const form = useForm({
        code: '',
        name: '',
        department_id: '',
        category: 'kejuruan',
    });

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return subjects;
        return subjects.filter(
            (s) =>
                s.code.toLowerCase().includes(term) ||
                s.name.toLowerCase().includes(term) ||
                (s.department_code ?? '').toLowerCase().includes(term),
        );
    }, [query, subjects]);

    const totals = useMemo(
        () => ({
            subjects: subjects.length,
            kejuruan: subjects.filter((s) => s.category === 'kejuruan').length,
            umum: subjects.filter((s) => s.category === 'umum').length,
        }),
        [subjects],
    );

    function applyDepartment(value) {
        router.get(
            '/admin/subjects',
            value ? { department_id: value } : {},
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    function submit(e) {
        e.preventDefault();

        const options = {
            preserveScroll: true,
            onSuccess: () => {
                form.reset('code', 'name');
                setEditingId(null);
            },
        };

        if (editingId) {
            form.put(`/admin/subjects/${editingId}`, options);
        } else {
            form.post('/admin/subjects', options);
        }
    }

    function startEdit(s) {
        form.clearErrors();
        form.setData({
            code: s.code,
            name: s.name,
            department_id: s.department_id ? String(s.department_id) : '',
            category: s.category ?? 'kejuruan',
        });
        setEditingId(s.id);
    }

    function cancelEdit() {
        setEditingId(null);
        form.clearErrors();
        form.reset();
    }

    function destroy(s) {
        if (!confirm(`Hapus mapel ${s.code} — ${s.name}?`)) return;
        router.delete(`/admin/subjects/${s.id}`, { preserveScroll: true });
    }

    return (
        <AdminLayout>
            <PageHeader
                title="Mata Pelajaran"
                subtitle="Daftar mapel per jurusan. Mapel dipakai saat ploting mengajar dan penyusunan bank TP."
                actions={
                    <>
                        <Badge tone="emerald">{totals.subjects} mapel</Badge>
                        <Badge>{totals.kejuruan} kejuruan</Badge>
                        <Badge>{totals.umum} umum</Badge>
                    </>
                }
            />

            <Toolbar>
                <div className="min-w-[12rem]">
                    <div className="mb-1.5 text-xs font-medium text-zinc-600">Cari Mapel</div>
                    <input
                        type="search"
                        className={inputClass}
                        placeholder="Kode atau nama mapel"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
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
            </Toolbar>

            <Card>
                <CardHeader
                    title={editingId ? 'Ubah Mapel' : 'Tambah Mapel'}
                    subtitle="Kode mapel harus unik, mis. PLPK-TSM atau MTK."
                    actions={
                        editingId ? (
                            <Button variant="ghost" size="sm" onClick={cancelEdit}>
                                Batal ubah
                            </Button>
                        ) : null
                    }
                />
                <form onSubmit={submit} className="grid items-start gap-4 md:grid-cols-4">
                    <Field label="Kode" error={form.errors.code}>
                        <input
                            className={inputClass}
                            value={form.data.code}
                            onChange={(e) => form.setData('code', e.target.value.toUpperCase())}
                            placeholder="PLPK-TSM"
                            maxLength={20}
                        />
                    </Field>
                    <Field label="Nama Mapel" error={form.errors.name}>
                        <input
                            className={inputClass}
                            value={form.data.name}
                            onChange={(e) => form.setData('name', e.target.value)}
                            placeholder="Pemeliharaan Kelistrikan"
                        />
                    </Field>
                    <Field label="Jurusan" error={form.errors.department_id}>
                        <select
                            className={selectClass}
                            value={form.data.department_id}
                            onChange={(e) => form.setData('department_id', e.target.value)}
                        >
                            <option value="">Umum (tanpa jurusan)</option>
                            {departments.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.code} — {d.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Kategori" error={form.errors.category}>
                        <select
                            className={selectClass}
                            value={form.data.category}
                            onChange={(e) => form.setData('category', e.target.value)}
                        >
                            {categories.map((c) => (
                                <option key={c} value={c}>
                                    {categoryLabel(c)}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <div className="flex flex-wrap items-center gap-2 md:col-span-4">
                        <Button type="submit" disabled={form.processing}>
                            {form.processing
                                ? 'Menyimpan…'
                                : editingId
                                  ? 'Simpan Perubahan'
                                  : 'Tambah Mapel'}
                        </Button>
                        {!editingId && (
                            <span className="text-xs text-zinc-500">
                                Kode otomatis diubah ke huruf besar.
                            </span>
                        )}
                    </div>
                </form>
            </Card>

            <Card className="mt-4">
                <CardHeader
                    title="Daftar Mapel"
                    subtitle={`${filtered.length} dari ${subjects.length} mapel ditampilkan.`}
                />
                {subjects.length === 0 ? (
                    <EmptyState
                        title="Belum ada mata pelajaran"
                        description="Tambahkan mapel lewat form di atas, lalu ploting ke guru."
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        title="Tidak ada mapel yang cocok"
                        description="Ubah kata kunci atau filter jurusan."
                    />
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-zinc-100">
                        <table className="w-full min-w-[720px] border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                                    <th className="px-3 py-2.5">Kode</th>
                                    <th className="px-3 py-2.5">Nama</th>
                                    <th className="px-3 py-2.5">Jurusan</th>
                                    <th className="px-3 py-2.5">Kategori</th>
                                    <th className="px-3 py-2.5 text-right">TP</th>
                                    <th className="px-3 py-2.5 text-right">Ploting</th>
                                    <th className="px-3 py-2.5 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((s) => (
                                    <tr
                                        key={s.id}
                                        className={
                                            'border-b border-zinc-100 last:border-0 ' +
                                            (String(editingId) === String(s.id)
                                                ? 'bg-emerald-50/40'
                                                : '')
                                        }
                                    >
                                        <td className="px-3 py-3 font-mono text-xs font-semibold text-zinc-900">
                                            {s.code}
                                        </td>
                                        <td className="px-3 py-3 text-zinc-800">{s.name}</td>
                                        <td className="px-3 py-3 text-zinc-600">
                                            {s.department_code ?? (
                                                <span className="text-zinc-400">Umum</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3">
                                            <Badge tone={s.category === 'umum' ? 'zinc' : 'emerald'}>
                                                {categoryLabel(s.category)}
                                            </Badge>
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-zinc-600">
                                            {s.objectives_count}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-zinc-600">
                                            {s.assignments_count}
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="flex justify-end gap-1.5">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => startEdit(s)}
                                                >
                                                    Ubah
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => destroy(s)}
                                                    className="text-red-600 hover:bg-red-50"
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
        </AdminLayout>
    );
}
