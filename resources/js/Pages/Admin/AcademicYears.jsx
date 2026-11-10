import { useForm, router } from '@inertiajs/react';
import AdminLayout from '@/Layouts/AdminLayout';
import {
    Badge,
    Button,
    Card,
    CardHeader,
    EmptyState,
    Field,
    PageHeader,
    Toggle,
    inputClass,
    selectClass,
} from '@/Components/ui';

export default function AcademicYears({ years = [] }) {
    const { data, setData, post, processing, errors, reset } = useForm({
        name: '',
        semester: 'ganjil',
    });

    function submit(e) {
        e.preventDefault();
        post('/admin/academic-years', {
            preserveScroll: true,
            onSuccess: () => reset('name'),
        });
    }

    function activate(year) {
        if (year.is_active) return;
        router.post(
            `/admin/academic-years/${year.id}/activate`,
            {},
            { preserveScroll: true },
        );
    }

    function destroy(year) {
        if (
            !confirm(
                `Hapus tahun pelajaran ${year.name} ${year.semester}? Data ploting/siswa harus kosong.`,
            )
        ) {
            return;
        }
        router.delete(`/admin/academic-years/${year.id}`, { preserveScroll: true });
    }

    const active = years.find((y) => y.is_active) ?? null;

    return (
        <AdminLayout>
            <PageHeader
                title="Tahun Pelajaran"
                subtitle="Kelola dan aktifkan tahun ajaran yang sedang berjalan. Hanya satu TP yang bisa aktif."
                actions={
                    active ? (
                        <Badge tone="emerald">
                            AKTIF: {active.name} {active.semester}
                        </Badge>
                    ) : (
                        <Badge tone="amber">Belum ada TP aktif</Badge>
                    )
                }
            />

            <Card>
                <CardHeader
                    title="Tambah Tahun Pelajaran"
                    subtitle="Format 2026/2027. Kombinasi nama + semester harus unik."
                />
                <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Field label="Nama Tahun" error={errors.name}>
                        <input
                            className={inputClass}
                            value={data.name}
                            placeholder="2026/2027"
                            inputMode="numeric"
                            onChange={(e) => setData('name', e.target.value)}
                        />
                    </Field>
                    <Field label="Semester" error={errors.semester}>
                        <select
                            className={selectClass}
                            value={data.semester}
                            onChange={(e) => setData('semester', e.target.value)}
                        >
                            <option value="ganjil">Ganjil</option>
                            <option value="genap">Genap</option>
                        </select>
                    </Field>
                    <div className="flex items-end">
                        <Button type="submit" disabled={processing} className="w-full sm:w-auto">
                            {processing ? 'Menyimpan…' : 'Tambah'}
                        </Button>
                    </div>
                </form>
            </Card>

            <Card className="mt-4">
                <CardHeader
                    title="Daftar Tahun Pelajaran"
                    subtitle={`${years.length} tahun terdaftar.`}
                />
                {years.length === 0 ? (
                    <EmptyState
                        title="Belum ada tahun pelajaran"
                        description="Tambahkan TP pertama lewat form di atas."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                                    <th className="pb-2 font-medium">Tahun</th>
                                    <th className="pb-2 font-medium">Semester</th>
                                    <th className="pb-2 text-right font-medium">Ploting</th>
                                    <th className="pb-2 text-right font-medium">Siswa</th>
                                    <th className="pb-2 font-medium">Status</th>
                                    <th className="pb-2 text-right font-medium">Aktif</th>
                                    <th className="pb-2 text-right font-medium">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {years.map((y) => (
                                    <tr
                                        key={y.id}
                                        className={
                                            'border-b border-zinc-100 last:border-0 ' +
                                            (y.is_active ? 'bg-emerald-50/40' : '')
                                        }
                                    >
                                        <td className="py-2.5 font-mono text-zinc-900">{y.name}</td>
                                        <td className="py-2.5 capitalize text-zinc-600">{y.semester}</td>
                                        <td className="py-2.5 text-right tabular-nums text-zinc-600">
                                            {y.teaching_assignment_count}
                                        </td>
                                        <td className="py-2.5 text-right tabular-nums text-zinc-600">
                                            {y.student_count}
                                        </td>
                                        <td className="py-2.5">
                                            {y.is_active ? (
                                                <Badge tone="emerald">AKTIF</Badge>
                                            ) : (
                                                <Badge>Nonaktif</Badge>
                                            )}
                                        </td>
                                        <td className="py-2.5">
                                            <div className="flex justify-end">
                                                <Toggle
                                                    on={y.is_active}
                                                    label={`Aktifkan ${y.name} ${y.semester}`}
                                                    onChange={() => activate(y)}
                                                    disabled={y.is_active}
                                                />
                                            </div>
                                        </td>
                                        <td className="py-2.5 text-right">
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                disabled={y.is_active}
                                                onClick={() => destroy(y)}
                                            >
                                                Hapus
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <p className="mt-3 text-xs text-zinc-500">
                TP aktif dipakai untuk penempatan siswa, matriks ploting, dan filter dashboard.
                Menghapus TP hanya boleh jika tidak ada ploting atau siswa terdaftar.
            </p>
        </AdminLayout>
    );
}
