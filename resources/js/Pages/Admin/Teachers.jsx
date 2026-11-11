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
    Modal,
    PageHeader,
    Toolbar,
    inputClass,
} from '@/Components/ui';

const DEFAULT_PASSWORD = 'guru12345';

export default function Teachers({ teachers = [] }) {
    const [editingId, setEditingId] = useState(null);
    const [query, setQuery] = useState('');
    const [resetTarget, setResetTarget] = useState(null);

    const form = useForm({
        name: '',
        username: '',
        email: '',
        password: DEFAULT_PASSWORD,
    });

    const resetForm = useForm({
        password: DEFAULT_PASSWORD,
    });

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return teachers;
        return teachers.filter(
            (t) =>
                String(t.name ?? '').toLowerCase().includes(term) ||
                String(t.username ?? '').toLowerCase().includes(term) ||
                String(t.email ?? '').toLowerCase().includes(term),
        );
    }, [query, teachers]);

    const totals = useMemo(
        () => ({
            all: teachers.length,
            active: teachers.filter((t) => t.is_active).length,
            inactive: teachers.filter((t) => !t.is_active).length,
        }),
        [teachers],
    );

    function submit(e) {
        e.preventDefault();

        const options = {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                form.setData('password', DEFAULT_PASSWORD);
                setEditingId(null);
            },
        };

        if (editingId) {
            form.put(`/admin/teachers/${editingId}`, options);
        } else {
            form.post('/admin/teachers', options);
        }
    }

    function startEdit(t) {
        form.clearErrors();
        form.setData({
            name: t.name ?? '',
            username: t.username ?? '',
            email: t.email ?? '',
            password: '',
        });
        setEditingId(t.id);
    }

    function cancelEdit() {
        setEditingId(null);
        form.clearErrors();
        form.reset();
        form.setData('password', DEFAULT_PASSWORD);
    }

    function toggleActive(t) {
        if (
            t.is_active &&
            !window.confirm(
                `Nonaktifkan akun ${t.name}? Ia tidak bisa login selama nonaktif. Ploting dan modulnya tetap tersimpan.`,
            )
        ) {
            return;
        }
        router.post(`/admin/teachers/${t.id}/toggle-active`, {}, { preserveScroll: true });
    }

    function destroy(t) {
        if (!window.confirm(`Hapus guru ${t.name} (${t.username})? Tindakan ini tidak dapat dibatalkan.`)) return;
        router.delete(`/admin/teachers/${t.id}`, { preserveScroll: true });
    }

    function submitReset(e) {
        e.preventDefault();
        if (!resetTarget) return;
        resetForm.post(`/admin/teachers/${resetTarget.id}/reset-password`, {
            preserveScroll: true,
            onSuccess: () => {
                setResetTarget(null);
                resetForm.setData('password', DEFAULT_PASSWORD);
            },
        });
    }

    return (
        <AdminLayout>
            <PageHeader
                title="Kelola Guru"
                subtitle="Akun guru untuk login LMS. Setelah ditambahkan, pasangkan guru ke mapel dan kelas lewat Ploting Mengajar."
                actions={
                    <>
                        <Badge tone="emerald">{totals.all} guru</Badge>
                        <Badge>{totals.active} aktif</Badge>
                        {totals.inactive > 0 && <Badge tone="amber">{totals.inactive} nonaktif</Badge>}
                    </>
                }
            />

            <Toolbar>
                <div className="min-w-[14rem]">
                    <div className="mb-1.5 text-xs font-medium text-zinc-600">Cari Guru</div>
                    <input
                        type="search"
                        className={inputClass}
                        placeholder="Nama, username/NIP, atau email"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
            </Toolbar>

            <Card>
                <CardHeader
                    title={editingId ? 'Ubah Guru' : 'Tambah Guru'}
                    subtitle={
                        editingId
                            ? 'Password tidak diubah di sini — gunakan tombol Reset Password pada daftar.'
                            : `Password awal bawaan ${DEFAULT_PASSWORD}, guru sebaiknya menggantinya nanti. Sampaikan username dan password awal ini ke gurunya.`
                    }
                    actions={
                        editingId ? (
                            <Button variant="ghost" size="sm" onClick={cancelEdit}>
                                Batal ubah
                            </Button>
                        ) : null
                    }
                />
                <form onSubmit={submit} className="grid items-start gap-4 md:grid-cols-4">
                    <Field label="Nama Guru" error={form.errors.name}>
                        <input
                            className={inputClass}
                            value={form.data.name}
                            onChange={(e) => form.setData('name', e.target.value)}
                            placeholder="Nama lengkap dengan gelar"
                        />
                    </Field>
                    <Field label="Username / NIP" error={form.errors.username}>
                        <input
                            className={inputClass}
                            value={form.data.username}
                            onChange={(e) => form.setData('username', e.target.value)}
                            placeholder="198501012010011001"
                        />
                    </Field>
                    <Field label="Email (opsional)" error={form.errors.email}>
                        <input
                            type="email"
                            className={inputClass}
                            value={form.data.email}
                            onChange={(e) => form.setData('email', e.target.value)}
                            placeholder="guru@smk.sch.id"
                        />
                    </Field>
                    {!editingId && (
                        <Field label="Password Awal" error={form.errors.password}>
                            <input
                                className={inputClass}
                                value={form.data.password}
                                onChange={(e) => form.setData('password', e.target.value)}
                                placeholder="Minimal 8 karakter"
                            />
                        </Field>
                    )}
                    <div className="flex flex-wrap items-center gap-2 md:col-span-4">
                        <Button type="submit" disabled={form.processing}>
                            {form.processing ? 'Menyimpan…' : editingId ? 'Simpan Perubahan' : 'Tambah Guru'}
                        </Button>
                        {!editingId && (
                            <span className="text-xs text-zinc-500">
                                Username harus unik dan dipakai guru untuk login.
                            </span>
                        )}
                    </div>
                </form>
            </Card>

            <Card className="mt-4">
                <CardHeader
                    title="Daftar Guru"
                    subtitle={`${filtered.length} dari ${teachers.length} guru ditampilkan.`}
                />
                {teachers.length === 0 ? (
                    <EmptyState
                        title="Belum ada guru"
                        description="Tambahkan guru lewat form di atas, lalu ploting ke mapel dan kelas."
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState title="Tidak ada guru yang cocok" description="Ubah kata kunci pencarian." />
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-zinc-100">
                        <table className="w-full min-w-[820px] border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                                    <th className="px-3 py-2.5">Nama</th>
                                    <th className="px-3 py-2.5">Username</th>
                                    <th className="px-3 py-2.5">Email</th>
                                    <th className="px-3 py-2.5">Status</th>
                                    <th className="px-3 py-2.5 text-right">Ploting</th>
                                    <th className="px-3 py-2.5 text-right">Modul</th>
                                    <th className="px-3 py-2.5 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((t) => (
                                    <tr
                                        key={t.id}
                                        className={
                                            'border-b border-zinc-100 last:border-0 ' +
                                            (String(editingId) === String(t.id) ? 'bg-emerald-50/40' : '')
                                        }
                                    >
                                        <td className="px-3 py-3 font-medium text-zinc-800">{t.name}</td>
                                        <td className="px-3 py-3 font-mono text-xs text-zinc-600">{t.username}</td>
                                        <td className="px-3 py-3 text-zinc-600">
                                            {t.email ?? <span className="text-zinc-400">—</span>}
                                        </td>
                                        <td className="px-3 py-3">
                                            {t.is_active ? (
                                                <Badge tone="emerald">Aktif</Badge>
                                            ) : (
                                                <Badge tone="amber">Nonaktif</Badge>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-zinc-600">
                                            {t.assignments_count}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-zinc-600">
                                            {t.modules_count}
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="flex flex-wrap justify-end gap-1.5">
                                                <Button variant="ghost" size="sm" onClick={() => startEdit(t)}>
                                                    Ubah
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        resetForm.setData('password', DEFAULT_PASSWORD);
                                                        setResetTarget(t);
                                                    }}
                                                >
                                                    Reset Password
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => toggleActive(t)}>
                                                    {t.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => destroy(t)}
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

            <Modal
                open={resetTarget !== null}
                title="Reset Password Guru"
                subtitle={resetTarget ? `${resetTarget.name} (${resetTarget.username})` : ''}
                onClose={() => setResetTarget(null)}
            >
                <form onSubmit={submitReset} className="space-y-4 px-5 py-4">
                    <Field label="Password Baru" error={resetForm.errors.password}>
                        <input
                            className={inputClass}
                            value={resetForm.data.password}
                            onChange={(e) => resetForm.setData('password', e.target.value)}
                            placeholder="Minimal 8 karakter"
                        />
                    </Field>
                    <p className="text-xs text-zinc-500">
                        Password lama guru langsung tidak berlaku. Sampaikan password baru ini ke gurunya.
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setResetTarget(null)}>
                            Batal
                        </Button>
                        <Button type="submit" disabled={resetForm.processing}>
                            {resetForm.processing ? 'Menyimpan…' : 'Reset Password'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </AdminLayout>
    );
}
