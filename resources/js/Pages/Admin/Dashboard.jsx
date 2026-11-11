import { router } from '@inertiajs/react';
import Layout from '@/Layouts/AdminLayout';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, StatCard, selectClass } from '@/Components/ui';

function SvgIcon({ d, className = 'h-4 w-4' }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={d} />
        </svg>
    );
}

const IconGrid = () => <SvgIcon d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25A2.25 2.25 0 0 1 8.25 10.5H6A2.25 2.25 0 0 1 3.75 8.25V6Zm9.75 0a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25Zm9.75 0a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />;
const IconUsers = () => <SvgIcon d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />;
const IconTeacher = () => <SvgIcon d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84 51.052 51.052 0 0 0-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />;
const IconBook = () => <SvgIcon d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />;
const IconTarget = () => <SvgIcon d="M12 3v2.25M12 18.75V21M4.5 12H3m18 0h-1.5M6.34 6.34 5.28 5.28m13.44 13.44-1.06-1.06M6.34 17.66l-1.06 1.06M18.72 5.28l-1.06 1.06M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />;
const IconShuffle = () => <SvgIcon d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />;

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
                eyebrow={active_year?.label ?? 'Ringkasan akademik'}
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

            <div className="mb-4 grid gap-3 rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(24,24,27,0.04)] sm:grid-cols-3">
                <div className="min-w-0">
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
                <div className="min-w-0">
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
                <div className="min-w-0">
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
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard label="Kelas" value={stats.classrooms} hint="Rombongan belajar" accent icon={<IconGrid />} />
                <StatCard label="Siswa" value={stats.students} hint={`${totalDepartmentStudents} terdaftar di jurusan`} icon={<IconUsers />} />
                <StatCard label="Guru" value={stats.teachers} hint="mengajar di TP ini" icon={<IconTeacher />} />
                <StatCard label="Mapel" value={stats.subjects} hint="mata pelajaran aktif" icon={<IconBook />} />
                <StatCard label="Bank TP" value={stats.objectives} hint="tujuan pembelajaran" accent icon={<IconTarget />} />
                <StatCard label="Ploting" value={stats.teaching_assignments} hint="penugasan mengajar" icon={<IconShuffle />} />
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
                                {by_department.map((d) => {
                                    const share = totalDepartmentStudents > 0 ? Math.round(((d.students_count ?? 0) / totalDepartmentStudents) * 100) : 0;
                                    return (
                                        <tr key={d.id} className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50/70">
                                            <td className="py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-[11px] text-zinc-500">{d.code}</span>
                                                    <span className="text-zinc-900">{d.name}</span>
                                                </div>
                                                <div className="mt-1.5 flex items-center gap-2">
                                                    <div className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-zinc-100">
                                                        <div
                                                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                                                            style={{ width: `${share}%` }}
                                                        />
                                                    </div>
                                                    <span className="font-mono text-[10px] text-zinc-400">{share}%</span>
                                                </div>
                                            </td>
                                            <td className="py-2.5 text-right tabular-nums text-zinc-600">{d.classrooms_count}</td>
                                            <td className="py-2.5 text-right tabular-nums text-zinc-600">{d.students_count}</td>
                                        </tr>
                                    );
                                })}
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
