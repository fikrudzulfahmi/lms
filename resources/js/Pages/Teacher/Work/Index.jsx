import { Head, Link, router, useForm } from '@inertiajs/react';
import TeacherLayout from '@/Layouts/TeacherLayout';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, inputClass } from '@/Components/ui';

const GRADE_STATUS = {
    graded: { label: 'Sudah dinilai', tone: 'emerald' },
    waiting_ai_grading: { label: 'Menunggu penilaian AI', tone: 'amber' },
    submitted: { label: 'Terkumpul', tone: 'zinc' },
    in_progress: { label: 'Sedang berjalan', tone: 'zinc' },
};

function CorrectBadge({ correct, isGraded }) {
    if (correct === true) return <Badge tone="emerald">Benar</Badge>;
    if (correct === false) return <Badge tone="red">Salah</Badge>;
    if (isGraded) return <Badge tone="zinc">Dinilai</Badge>;
    return <Badge tone="amber">Menunggu dinilai</Badge>;
}

function EssayGradeForm({ row, gradeAiUrl, gradeManualUrl }) {
    const form = useForm({ score: '', feedback: '' });
    const responseId = row.live.response_id;

    function submitManual(event) {
        event.preventDefault();
        form.post(gradeManualUrl.replace('__ID__', responseId), { preserveScroll: true });
    }

    function gradeAi() {
        router.post(
            gradeAiUrl.replace('__ID__', responseId),
            {},
            { preserveScroll: true },
        );
    }

    return (
        <form onSubmit={submitManual} className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <p className="mb-2 text-xs font-medium text-amber-800">
                Esai ini belum dinilai (maks {row.points} poin). Nilai dengan AI atau isi manual:
            </p>
            <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-zinc-600">
                    Poin
                    <input
                        type="number"
                        min={0}
                        max={row.points}
                        step="0.5"
                        value={form.data.score}
                        onChange={(event) => form.setData('score', event.target.value)}
                        className={`${inputClass} mt-1 w-24`}
                        placeholder={`0–${row.points}`}
                    />
                </label>
                <label className="min-w-48 flex-1 text-xs text-zinc-600">
                    Umpan balik (opsional)
                    <input
                        type="text"
                        value={form.data.feedback}
                        onChange={(event) => form.setData('feedback', event.target.value)}
                        className={`${inputClass} mt-1`}
                        placeholder="Catatan untuk siswa"
                    />
                </label>
                <Button type="submit" size="sm" disabled={form.processing}>
                    Simpan Nilai
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={gradeAi}>
                    Nilai dengan AI
                </Button>
            </div>
            {form.errors.score && <p className="mt-1 text-xs text-red-600">{form.errors.score}</p>}
        </form>
    );
}

function RowLine({ row, gradeAiUrl, gradeManualUrl }) {
    return (
        <div className="border-b border-zinc-100 py-2.5 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-zinc-800">{row.label}</span>
                {row.points > 0 && <span className="font-mono text-[11px] text-zinc-400">{row.points} poin</span>}
                {row.submission && (
                    <Badge tone={row.submission.status === 'graded' ? 'emerald' : 'amber'}>
                        {row.submission.status === 'graded'
                            ? `Tugas dinilai · ${row.submission.score}`
                            : 'Tugas menunggu dinilai'}
                    </Badge>
                )}
            </div>

            {row.live && (
                <div className="mt-1 flex flex-wrap items-start gap-2">
                    <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                        Live
                    </span>
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-zinc-600">{row.live.summary}</p>
                    <CorrectBadge correct={row.live.correct} isGraded={row.live.is_graded} />
                    {row.live.is_graded && (
                        <span className="font-mono text-xs text-zinc-500">{row.live.earned_points} poin</span>
                    )}
                </div>
            )}
            {row.live?.feedback && (
                <p className="mt-1 pl-12 text-xs italic text-zinc-500">“{row.live.feedback}”</p>
            )}
            {row.live?.can_grade && (
                <div className="pl-12">
                    <EssayGradeForm row={row} gradeAiUrl={gradeAiUrl} gradeManualUrl={gradeManualUrl} />
                </div>
            )}

            {row.practice && (
                <div className="mt-1 flex flex-wrap items-start gap-2">
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Mandiri
                    </span>
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-zinc-600">{row.practice.summary}</p>
                    <CorrectBadge correct={row.practice.correct} isGraded={row.practice.correct !== null} />
                    {row.practice.earned_points !== null && (
                        <span className="font-mono text-xs text-zinc-500">{row.practice.earned_points} poin</span>
                    )}
                </div>
            )}

            {!row.live && !row.practice && !row.submission && (
                <p className="mt-0.5 text-xs text-zinc-400">
                    {row.practice_done ? 'Ditandai selesai di Belajar Mandiri.' : 'Belum dikerjakan.'}
                </p>
            )}
        </div>
    );
}

export default function WorkIndex({ module, students = [], grade_ai_url, grade_manual_url }) {
    const waitingCount = students.reduce(
        (sum, student) =>
            sum +
            student.rows.filter(
                (row) =>
                    row.live?.can_grade || (row.submission && row.submission.status !== 'graded'),
            ).length,
        0,
    );

    return (
        <TeacherLayout>
            <Head title={`Pekerjaan Siswa · ${module.title}`} />

            <PageHeader
                title="Pekerjaan Siswa"
                subtitle={`${module.title}${module.subject ? ` · ${module.subject}` : ''}${module.classroom ? ` · ${module.classroom}` : ''}`}
                actions={
                    <>
                        <Link
                            href={module.submissions_url}
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                            Pengumpulan Tugas
                        </Link>
                        <Link
                            href={module.edit_url}
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                            Buka Studio
                        </Link>
                    </>
                }
            />

            <p className="mb-4 text-sm text-zinc-500">
                Semua pekerjaan siswa pada modul ini dalam satu tempat: jawaban kelas live, jawaban
                Belajar Mandiri, dan status Tugas Unggah.
                {waitingCount > 0 && (
                    <span className="font-medium text-amber-700"> {waitingCount} pekerjaan menunggu dinilai.</span>
                )}
            </p>

            {students.length === 0 ? (
                <EmptyState title="Belum ada siswa" description="Kelas pada ploting modul ini belum memiliki siswa." />
            ) : (
                <div className="space-y-4">
                    {students.map((student) => {
                        const gradeInfo = student.grade ? GRADE_STATUS[student.grade.status] : null;

                        return (
                            <Card key={student.id}>
                                <CardHeader
                                    title={student.name}
                                    subtitle={student.username ?? ''}
                                    actions={
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {student.grade ? (
                                                <Badge tone={gradeInfo?.tone ?? 'zinc'}>
                                                    {gradeInfo?.label ?? student.grade.status}
                                                    {student.grade.final_score !== null &&
                                                        ` · ${student.grade.final_score}`}
                                                </Badge>
                                            ) : (
                                                <Badge tone="zinc">Belum ada nilai</Badge>
                                            )}
                                            {student.practice && (
                                                <Badge tone={student.practice.completed_at ? 'emerald' : 'zinc'}>
                                                    Mandiri {student.practice.percent}%
                                                    {student.practice.completed_at ? ' · Tuntas 🏅' : ''}
                                                </Badge>
                                            )}
                                        </div>
                                    }
                                />
                                <div className="px-4 py-1">
                                    {student.rows.map((row) => (
                                        <RowLine
                                            key={row.block_id}
                                            row={row}
                                            gradeAiUrl={grade_ai_url}
                                            gradeManualUrl={grade_manual_url}
                                        />
                                    ))}
                                    {student.rows.length === 0 && (
                                        <p className="py-3 text-sm text-zinc-400">Modul ini belum memiliki blok soal/materi.</p>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </TeacherLayout>
    );
}
