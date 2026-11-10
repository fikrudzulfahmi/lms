import { Head, Link, router } from '@inertiajs/react';
import GradeMatrix, { ScorePill, StatusBadge } from '@/Components/GradeMatrix';
import { Card, EmptyState, PageHeader, StatCard, inputClass } from '@/Components/ui';
import TeacherLayout from '@/Layouts/TeacherLayout';

export default function GradebookIndex({ assignments, filters, matrix, options, urls, has_assignments }) {
    function applyFilter(key, value) {
        const next = { ...filters, [key]: value || undefined };
        router.get('/teacher/gradebook', next, { preserveState: true, preserveScroll: true, replace: true });
    }

    return (
        <TeacherLayout>
            <Head title="Buku Nilai" />

            <PageHeader
                title="Buku Nilai"
                subtitle="Matriks nilai per Tujuan Pembelajaran dengan status KKTP dan deskripsi capaian otomatis."
                actions={
                    matrix && urls.show ? (
                        <>
                            <Link
                                href={urls.show}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                                Detail & Override
                            </Link>
                            <Link
                                href={`${urls.show}/export?year=${matrix.assignment.year_id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                            >
                                Export CSV
                            </Link>
                        </>
                    ) : null
                }
            />

            <div className="mb-5 flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 bg-white p-3">
                <div className="min-w-[11rem]">
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500" htmlFor="filter-year">
                        Tahun Pelajaran
                    </label>
                    <select
                        id="filter-year"
                        className={inputClass}
                        value={filters.year ?? ''}
                        onChange={(event) => applyFilter('year', event.target.value)}
                    >
                        <option value="">Semua tahun</option>
                        {options.years.map((year) => (
                            <option key={year.id} value={year.id}>
                                {year.name} {year.semester}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="min-w-[11rem]">
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500" htmlFor="filter-classroom">
                        Kelas
                    </label>
                    <select
                        id="filter-classroom"
                        className={inputClass}
                        value={filters.classroom ?? ''}
                        onChange={(event) => applyFilter('classroom', event.target.value)}
                    >
                        <option value="">Semua kelas</option>
                        {options.classrooms.map((classroom) => (
                            <option key={classroom.id} value={classroom.id}>
                                {classroom.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="min-w-[13rem]">
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500" htmlFor="filter-subject">
                        Mata Pelajaran
                    </label>
                    <select
                        id="filter-subject"
                        className={inputClass}
                        value={filters.subject ?? ''}
                        onChange={(event) => applyFilter('subject', event.target.value)}
                    >
                        <option value="">Semua mapel</option>
                        {options.subjects.map((subject) => (
                            <option key={subject.id} value={subject.id}>
                                {subject.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {!has_assignments && (
                <Card>
                    <EmptyState
                        title="Belum ada ploting mengajar"
                        description="Minta admin memploting kelas dan mata pelajaran untuk akun Anda."
                    />
                </Card>
            )}

            {has_assignments && !matrix && (
                <Card>
                    <EmptyState
                        title="Kombinasi filter tidak ditemukan"
                        description="Pilih tahun, kelas, dan mapel yang Anda ampu."
                    />
                </Card>
            )}

            {matrix && (
                <>
                    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard label="Siswa" value={matrix.summary.students} hint={`${matrix.assignment.classroom} · ${matrix.assignment.subject}`} accent />
                        <StatCard label="Tuntas" value={matrix.summary.tuntas} hint={`KKTP ${matrix.summary.kktp}`} />
                        <StatCard label="Belum Tuntas" value={matrix.summary.belum} hint="Perlu remedial" />
                        <StatCard
                            label="Rata-rata"
                            value={matrix.summary.average === null ? '—' : Number(matrix.summary.average).toFixed(2)}
                            hint={`${matrix.assignment.year} ${matrix.assignment.semester ?? ''}`}
                        />
                    </div>

                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm text-zinc-600">
                            <span className="font-mono text-xs text-emerald-700">{matrix.assignment.subject_code}</span>{' '}
                            {matrix.assignment.subject} · {matrix.assignment.classroom} · {matrix.assignment.year}{' '}
                            {matrix.assignment.semester}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                            <span className="inline-flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Tuntas
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-amber-500" /> Belum tuntas
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-zinc-300" /> Belum ada nilai
                            </span>
                        </div>
                    </div>

                    <GradeMatrix matrix={matrix} />

                    {matrix.assignment && (
                        <p className="mt-2 text-xs text-zinc-500">
                            Klik <strong>Detail &amp; Override</strong> untuk membuka jawaban siswa per blok dan mengubah nilai manual.
                        </p>
                    )}
                </>
            )}

            {assignments.length > 0 && (
                <Card className="mt-6">
                    <h2 className="mb-3 font-display text-sm font-bold text-zinc-900">Ploting yang Anda ampu</h2>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
                                    <th className="px-2 py-2">Kelas</th>
                                    <th className="px-2 py-2">Mata Pelajaran</th>
                                    <th className="px-2 py-2">Tahun</th>
                                    <th className="px-2 py-2 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {assignments.map((assignment) => (
                                    <tr key={assignment.id} className="border-b border-zinc-50 last:border-0">
                                        <td className="px-2 py-2 font-medium text-zinc-900">{assignment.classroom}</td>
                                        <td className="px-2 py-2 text-zinc-600">
                                            <span className="font-mono text-[11px] text-zinc-400">{assignment.subject_code}</span>{' '}
                                            {assignment.subject}
                                        </td>
                                        <td className="px-2 py-2 text-zinc-500">
                                            {assignment.year} {assignment.semester}
                                        </td>
                                        <td className="px-2 py-2 text-right">
                                            <Link
                                                href={`/teacher/gradebook/${assignment.classroom_id}/${assignment.subject_id}?year=${assignment.year_id}`}
                                                className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                                            >
                                                Buka
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </TeacherLayout>
    );
}
