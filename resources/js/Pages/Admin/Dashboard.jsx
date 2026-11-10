import { router } from '@inertiajs/react';
import Layout from '@/Layouts/AdminLayout';
import {
    Badge,
    Button,
    Card,
    CardHeader,
    EmptyState,
    PageHeader,
    StatCard,
    Toolbar,
    selectClass,
} from '@/Components/ui';

export default function Dashboard({
    stats,
    active_year,
    filters = {},
    options = {},
    by_department = [],
    top_teachers = [],
    recent_assignments = [],
}) {
    const years = options.years ?? [];
    const departments = options.departments ?? [];
    const gradeLevels = options.grade_levels ?? ['X', 'XI', 'XII'];

    function applyFilter(key, value) {
        const params = {
            academic_year_id: filters.academic_year_id ?? '',
            department_id: filters.department_id ?? '',
            grade_level: filters.grade_level ?? '',
        };

        params[key] = value ?? '';

        const query = {};
        Object.entries(params).forEach(([k, v]) => {
            if (v !== '' && v !== null && v !== undefined && v !== 0) {
                query[k] = v;
            }
        });

        router.get('/admin', query, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    }

    function resetFilters() {
        router.get('/admin', {}, { preserveState: true, preserveScroll: true, replace: true });
    }

    const hasFilter =
        Boolean(filters.department_id) ||
        Boolean(filters.grade_level) ||
        (filters.academic_year_id && filters.academic_year_id !== active_year?.id);

    const totalDepartmentStudents = by_department.reduce(
        (sum, d) => sum + (d.students_count ?? 0),
        0,
    );

    return (
        <Layout>
            <PageHeader
                title="Dashboard"
                subtitle={
                    active_year
                        ? `Ringkasan akademik ${active_year.label}. Gunakan filter untuk melihat per jurusan atau jenjang.`
                        : 'Belum ada tahun pelajaran aktif — aktifkan di menu Tahun Pelajaran.'
                }
                actions={
                    hasFilter ? (
                        <Button variant="outline" size="sm" onClick={resetFilters}>
                            Reset filter
                        </Button>
                    ) : null
                }
            />

            <Toolbar>
                <div className="min-w-[11rem] flex-1">
                    <div className="mb-1.5 text-xs font-medium text-zinc-600">Tahun Pelajaran</div>
                    <select
                        className={selectClass}
                        value={filters.academic_year_id ?? ''}
                        onChange={(e) => applyFilter('academic_year_id', e.target.value)}
                    >
                        <option value="">TP aktif</option>
                        {years.map((y) => (
                            <option key={y.id} value={y.id}>
                                {y.label}
                                {y.is_active ? ' (aktif)' : ''}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="min-w-[10rem] flex-1">
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
                <div className="w-28">
                    <div className="mb-1.5 text-xs font-medium text-zinc-600">Jenjang</div>
                    <select
                        className={selectClass}
                        value={filters.grade_level ?? ''}
                        onChange={(e) => applyFilter('grade_level', e.target.value)}
                    >
                        <option value="">Semua</option>
                        {gradeLevels.map((g) => (
                            <option key={g} value={g}>
                                {g}
                            </option>
                        ))}
                    </select>
                </div>
            </Toolbar>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard label="Kelas" value={stats.classrooms} accent />
                <StatCard label="Siswa" value={stats.students} hint={`${totalDepartmentStudents} terdaftar di jurusan`} />
                <StatCard label="Guru" value={stats.teachers} hint="mengajar di TP ini" />
                <StatCard label="Mapel" value={stats.subjects} />
                <StatCard label="Bank TP" value={stats.objectives} accent />
                <StatCard label="Ploting" value={stats.teaching_assignments} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader
                        title="Sebaran per Jurusan"
                        subtitle="Kelas & siswa pada tahun pelajaran terpilih."
                    />
                    {by_department.length === 0 ? (
                        <EmptyState title="Belum ada jurusan" description="Tambahkan jurusan di menu Kelas & Siswa." />
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                                    <th className="pb-2 font-medium">Jurusan</th>
                                    <th className="pb-2 text-right font-medium">Kelas</th>
                                    <th className="pb-2 text-right font-medium">Siswa</th>
                                </tr>
                            </thead>
                            <tbody>
                                {by_department.map((d) => (
                                    <tr key={d.id} className="border-b border-zinc-100 last:border-0">
                                        <td className="py-2.5">
                                            <span className="font-mono text-xs text-zinc-500">{d.code}</span>
                                            <span className="ml-2 text-zinc-900">{d.name}</span>
                                        </td>
                                        <td className="py-2.5 text-right tabular-nums text-zinc-600">
                                            {d.classrooms_count}
                                        </td>
                                        <td className="py-2.5 text-right tabular-nums text-zinc-600">
                                            {d.students_count}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </Card>

                <Card>
                    <CardHeader
                        title="Beban Guru Teratas"
                        subtitle="Jumlah kelas unik yang diampu."
                    />
                    {top_teachers.length === 0 ? (
                        <EmptyState
                            title="Belum ada ploting"
                            description="Susun matriks di menu Ploting Mengajar."
                        />
                    ) : (
                        <ul className="space-y-2">
                            {top_teachers.map((t) => (
                                <li
                                    key={t.teacher_id}
                                    className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2"
                                >
                                    <span className="truncate text-sm text-zinc-900">{t.teacher_name}</span>
                                    <span className="ml-3 shrink-0">
                                        <Badge tone="emerald">{t.classroom_count} kelas</Badge>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>

            <Card className="mt-4">
                <CardHeader
                    title="Ploting Terbaru"
                    subtitle={`${stats.teaching_assignments} baris ploting pada filter aktif.`}
                />
                {recent_assignments.length === 0 ? (
                    <EmptyState title="Belum ada data ploting" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                                    <th className="pb-2 font-medium">Guru</th>
                                    <th className="pb-2 font-medium">Mapel</th>
                                    <th className="pb-2 font-medium">Kelas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recent_assignments.map((a) => (
                                    <tr key={a.id} className="border-b border-zinc-100 last:border-0">
                                        <td className="py-2.5 text-zinc-900">{a.teacher}</td>
                                        <td className="py-2.5 text-zinc-600">
                                            <span className="font-mono text-xs text-zinc-500">
                                                {a.subject_code}
                                            </span>{' '}
                                            {a.subject}
                                        </td>
                                        <td className="py-2.5">
                                            <Badge tone="emerald">{a.classroom}</Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </Layout>
    );
}
