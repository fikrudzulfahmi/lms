import { Head, Link } from '@inertiajs/react';
import StudentLayout from '@/Layouts/StudentLayout';
import { ScorePill, StatusBadge } from '@/Components/GradeMatrix';
import { Card, PageHeader, StatCard } from '@/Components/ui';

const ASSESSMENT_LABELS = {
    formatif: 'Formatif',
    sumatif_lingkup_materi: 'Sumatif Lingkup Materi',
    sumatif_akhir_semester: 'Sumatif Akhir Semester',
};

export default function StudentGrades({ report, active_year }) {
    return (
        <StudentLayout>
            <Head title="Nilai Saya" />

            <div className="mx-auto w-full max-w-4xl">
                <PageHeader
                    title="Rapor Nilai"
                    subtitle={
                        active_year
                            ? `Tahun Pelajaran ${active_year.name} ${active_year.semester} · KKTP ${report.kktp}`
                            : `KKTP ${report.kktp}`
                    }
                />

                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                    <StatCard label="Mata Pelajaran" value={report.summary.subjects} accent />
                    <StatCard
                        label="Rata-rata"
                        value={report.summary.average === null ? '—' : Number(report.summary.average).toFixed(2)}
                        hint={`KKTP ${report.kktp}`}
                    />
                    <StatCard
                        label="Status"
                        value={`${report.summary.tuntas} tuntas`}
                        hint={`${report.summary.belum} belum tuntas`}
                    />
                </div>

                {report.subjects.length === 0 && (
                    <Card>
                        <div className="py-6 text-center">
                            <p className="text-sm font-medium text-zinc-700">Belum ada nilai</p>
                            <p className="mt-1 text-sm text-zinc-500">
                                Nilai muncul setelah guru menilai asesmen pada kelas Anda.
                            </p>
                        </div>
                    </Card>
                )}

                <div className="space-y-4">
                    {report.subjects.map((subject) => (
                        <Card key={subject.subject_id}>
                            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-3">
                                <div className="min-w-0">
                                    <div className="font-mono text-[11px] uppercase tracking-wide text-emerald-700">
                                        {subject.subject_code} · {subject.classroom ?? '—'}
                                    </div>
                                    <h2 className="mt-0.5 font-display text-base font-bold text-zinc-900">{subject.subject}</h2>
                                    <p className="text-xs text-zinc-500">
                                        {subject.year} {subject.semester} · KKTP {subject.kktp}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <ScorePill score={subject.final_score} passed={subject.is_passed} className="text-sm" />
                                    <StatusBadge status={subject.status} />
                                </div>
                            </div>

                            <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm leading-relaxed text-emerald-900">
                                {subject.description}
                            </p>

                            {subject.objectives.length > 0 && (
                                <div className="mt-3">
                                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                        Capaian per Tujuan Pembelajaran
                                    </h3>
                                    <div className="space-y-1.5">
                                        {subject.objectives.map((objective) => (
                                            <div
                                                key={objective.key}
                                                className="flex items-start justify-between gap-3 rounded-md border border-zinc-100 px-2.5 py-2"
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-mono text-[11px] text-emerald-700">{objective.code}</div>
                                                    <p className="text-xs leading-snug text-zinc-600">{objective.description}</p>
                                                </div>
                                                <ScorePill score={objective.score} passed={objective.passed} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {subject.assessments.length > 0 && (
                                <div className="mt-3">
                                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                        Riwayat Asesmen
                                    </h3>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-zinc-100 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                                                    <th className="px-2 py-1.5">Asesmen</th>
                                                    <th className="px-2 py-1.5">Jenis</th>
                                                    <th className="px-2 py-1.5 text-right">KKTP</th>
                                                    <th className="px-2 py-1.5 text-right">Nilai</th>
                                                    <th className="px-2 py-1.5 text-right">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {subject.assessments.map((assessment) => (
                                                    <tr key={assessment.module_id} className="border-b border-zinc-50 last:border-0">
                                                        <td className="px-2 py-1.5 text-zinc-800">
                                                            {assessment.title}
                                                            {assessment.has_override && (
                                                                <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 font-mono text-[10px] text-amber-700">
                                                                    OVR
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-2 py-1.5 text-xs text-zinc-500">
                                                            {ASSESSMENT_LABELS[assessment.assessment_type] ?? assessment.assessment_type}
                                                        </td>
                                                        <td className="px-2 py-1.5 text-right font-mono text-xs text-zinc-500">{assessment.kktp}</td>
                                                        <td className="px-2 py-1.5 text-right">
                                                            <ScorePill score={assessment.score} passed={assessment.is_passed} />
                                                        </td>
                                                        <td className="px-2 py-1.5 text-right text-xs">
                                                            {assessment.results_pending ? (
                                                                <span className="font-medium text-amber-700">Menunggu diumumkan guru</span>
                                                            ) : assessment.score === null || assessment.score === undefined ? (
                                                                <span className="text-zinc-500">Belum dinilai</span>
                                                            ) : assessment.is_passed ? (
                                                                <span className="text-emerald-700">Tuntas</span>
                                                            ) : (
                                                                <span className="text-amber-700">Remedial</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            </div>
        </StudentLayout>
    );
}
