import { Head, Link } from '@inertiajs/react';
import StudentLayout from '@/Layouts/StudentLayout';
import { Badge, Card, EmptyState, PageHeader, StatCard } from '@/Components/ui';

const ASSESSMENT_LABELS = {
    formatif: 'Formatif',
    sumatif_lingkup_materi: 'Sumatif Lingkup Materi',
    sumatif_akhir_semester: 'Sumatif Akhir Semester',
};

function ScorePill({ score, isPassed, kktp }) {
    if (score === null || score === undefined) {
        return (
            <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-xs text-zinc-500">
                belum dinilai
            </span>
        );
    }

    const tone = isPassed
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-red-200 bg-red-50 text-red-700';

    return (
        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs ${tone}`}>
            {Number(score).toFixed(0)}
            <span className="opacity-60">/ {kktp || 0}</span>
        </span>
    );
}

export default function StudentHome({ student, placement, active_year, summary, modules = [], active_sessions = [] }) {
    const firstName = (student?.name ?? '').split(' ')[0];

    return (
        <StudentLayout>
            <Head title="Beranda Siswa" />

            <div className="mb-5 overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 p-5 text-white sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-emerald-100/80">Selamat datang</p>
                        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">{firstName || 'Siswa'}</h1>
                        <p className="mt-1.5 text-sm text-emerald-50/90">
                            {placement
                                ? `Kelas ${placement.classroom ?? '—'} · TP ${placement.year ?? '—'} ${placement.semester ?? ''}`
                                : 'Kamu belum terdaftar di kelas mana pun untuk tahun pelajaran aktif.'}
                        </p>
                    </div>
                    <div className="rounded-xl bg-white/10 px-4 py-3 text-right backdrop-blur-sm">
                        <div className="text-xs text-emerald-100/80">Rata-rata</div>
                        <div className="font-display text-2xl font-bold">
                            {summary?.average === null || summary?.average === undefined
                                ? '—'
                                : Number(summary.average).toFixed(2)}
                        </div>
                    </div>
                </div>
            </div>

            {active_sessions.length > 0 && (
                <div className="mb-5 space-y-2">
                    {active_sessions.map((session) => (
                        <div
                            key={session.pin_code}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
                        >
                            <div className="flex items-center gap-3">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                                </span>
                                <div>
                                    <div className="text-sm font-semibold text-amber-900">
                                        Sesi live {session.status === 'active' ? 'sedang berjalan' : 'menunggu dimulai'}
                                    </div>
                                    <div className="text-xs text-amber-700">{session.module ?? 'Modul'}</div>
                                </div>
                            </div>
                            <Link
                                href={`/live/${session.pin_code}`}
                                className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                            >
                                Gabung sekarang
                            </Link>
                        </div>
                    ))}
                </div>
            )}

            <div className="mb-6 grid gap-3 sm:grid-cols-3">
                <StatCard label="Modul Tersedia" value={summary?.modules ?? modules.length} hint="Modul terpublikasi untuk kelasmu" />
                <StatCard label="Sudah Dinilai" value={summary?.modules_graded ?? 0} hint="Modul dengan nilai final" />
                <StatCard
                    label="Tuntas KKTP"
                    value={summary?.modules_tuntas ?? 0}
                    hint={`Belum tuntas: ${summary?.modules_belum ?? 0}`}
                    accent
                />
            </div>

            <PageHeader
                title="Modul Pembelajaran"
                subtitle="Modul dari guru kelasmu. Nilai muncul setelah guru menyelesaikan penilaian."
                actions={
                    <Link
                        href="/student/grades"
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                        Lihat rapor
                    </Link>
                }
            />

            {modules.length === 0 ? (
                <Card>
                    <EmptyState
                        title="Belum ada modul"
                        description={
                            placement
                                ? 'Guru belum mempublikasikan modul untuk kelasmu. Cek lagi nanti atau hubungi wali kelas.'
                                : 'Akunmu belum ditempatkan di kelas. Hubungi admin sekolah untuk penempatan kelas.'
                        }
                        action={
                            <Link
                                href="/live"
                                className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                            >
                                Masuk Live Kelas
                            </Link>
                        }
                    />
                </Card>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {modules.map((module) => (
                        <Card key={module.id} className="flex flex-col justify-between gap-3 transition-shadow hover:shadow-md">
                            <div>
                                <div className="mb-1.5 flex items-center gap-2 text-xs text-zinc-500">
                                    <Badge tone="emerald">{module.subject_code || module.subject || 'Mapel'}</Badge>
                                    <span>{ASSESSMENT_LABELS[module.assessment_type] ?? module.assessment_type}</span>
                                </div>
                                <h3 className="font-display text-base font-bold leading-snug text-zinc-900">{module.title}</h3>
                                <p className="mt-1 text-sm text-zinc-500">
                                    {module.teacher ?? 'Guru'} · {module.blocks_count} blok materi
                                </p>
                            </div>
                            <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                                <ScorePill score={module.score} isPassed={module.is_passed} kktp={module.kktp} />
                                <Link
                                    href="/student/grades"
                                    className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                                >
                                    Detail nilai
                                </Link>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </StudentLayout>
    );
}
