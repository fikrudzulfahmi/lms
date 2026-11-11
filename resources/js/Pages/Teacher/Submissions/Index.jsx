import { Head, Link, useForm } from '@inertiajs/react';
import TeacherLayout from '@/Layouts/TeacherLayout';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, inputClass } from '@/Components/ui';

function formatDateTime(iso) {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';

    return date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatBytes(size) {
    const bytes = Number(size) || 0;
    if (bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, '')} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

function GradeForm({ block, submission }) {
    const initialScores = block.rubric.map((_, index) =>
        Array.isArray(submission.rubric_scores) && submission.rubric_scores[index] != null
            ? submission.rubric_scores[index]
            : '',
    );

    const form = useForm({
        rubric_scores: initialScores,
        feedback: submission.feedback ?? '',
    });

    const totalMax = block.rubric.reduce((sum, item) => sum + (Number(item.max_score) || 0), 0);
    const totalGiven = form.data.rubric_scores.reduce(
        (sum, value) => sum + (Number(value) || 0),
        0,
    );
    const previewPercent = totalMax > 0 ? Math.round((totalGiven / totalMax) * 1000) / 10 : 0;

    function submit(event) {
        event.preventDefault();
        form.post(submission.grade_url, { preserveScroll: true });
    }

    return (
        <form onSubmit={submit} className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
                {block.rubric.map((item, index) => (
                    <label key={index} className="flex items-center gap-2 text-xs text-zinc-600">
                        <span className="min-w-0 flex-1 truncate" title={item.criterion}>
                            {item.criterion}
                        </span>
                        <input
                            type="number"
                            min={0}
                            max={item.max_score}
                            step="any"
                            value={form.data.rubric_scores[index]}
                            onChange={(event) => {
                                const next = [...form.data.rubric_scores];
                                next[index] = event.target.value === '' ? '' : Number(event.target.value);
                                form.setData('rubric_scores', next);
                            }}
                            className={`${inputClass} w-20 shrink-0 text-right font-mono`}
                        />
                        <span className="shrink-0 font-mono text-[11px] text-zinc-400">
                            / {item.max_score}
                        </span>
                    </label>
                ))}
            </div>

            <textarea
                rows={2}
                value={form.data.feedback}
                onChange={(event) => form.setData('feedback', event.target.value)}
                placeholder="Umpan balik untuk siswa (opsional)"
                className={`${inputClass} mt-2`}
            />

            {form.errors.rubric_scores && (
                <p className="mt-1.5 text-xs text-red-600">{form.errors.rubric_scores}</p>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-3">
                <Button type="submit" size="sm" loading={form.processing} disabled={form.processing}>
                    Simpan Nilai
                </Button>
                <span className="font-mono text-xs text-zinc-500">
                    Total {totalGiven}/{totalMax} · {previewPercent}% · setara{' '}
                    {Math.round(((previewPercent / 100) * (Number(block.points) || 0)) * 100) / 100} dari{' '}
                    {block.points} poin blok
                </span>
            </div>
        </form>
    );
}

export default function SubmissionsIndex({ module, blocks = [] }) {
    const totalSubmissions = blocks.reduce((sum, block) => sum + block.submissions.length, 0);

    return (
        <TeacherLayout>
            <Head title={`Pengumpulan Tugas · ${module.title}`} />

            <PageHeader
                eyebrow="Studio · Tugas Unggah"
                title="Pengumpulan Tugas"
                subtitle={[module.title, module.subject, module.classroom].filter(Boolean).join(' · ')}
                actions={
                    <Link
                        href={module.edit_url}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                    >
                        ← Kembali ke Studio
                    </Link>
                }
            />

            {blocks.length === 0 ? (
                <EmptyState
                    title="Belum ada blok Tugas Unggah"
                    description="Modul ini belum memiliki blok Tugas Unggah. Tambahkan blok Tugas Unggah di Studio agar siswa bisa mengumpulkan foto/video praktik lewat halaman Belajar Mandiri."
                />
            ) : (
                <div className="space-y-5">
                    <p className="text-sm text-zinc-500">
                        {blocks.length} blok tugas · {totalSubmissions} pengumpulan masuk. Nilai rubrik
                        otomatis masuk buku nilai (diskalakan ke poin blok).
                    </p>

                    {blocks.map((block) => (
                        <Card key={block.id}>
                            <CardHeader
                                title={block.title}
                                subtitle={
                                    block.instructions
                                        ? block.instructions
                                        : `${block.points} poin · ${block.rubric.length} kriteria rubrik`
                                }
                                actions={
                                    <Badge tone={block.submissions.length > 0 ? 'emerald' : 'zinc'}>
                                        {block.submissions.length} pengumpulan
                                    </Badge>
                                }
                            />

                            {block.submissions.length === 0 ? (
                                <p className="text-sm text-zinc-400">
                                    Belum ada siswa yang mengumpulkan tugas ini.
                                </p>
                            ) : (
                                <div className="space-y-4">
                                    {block.submissions.map((submission) => (
                                        <div
                                            key={submission.id}
                                            className="rounded-xl border border-zinc-200 p-4"
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-zinc-900">
                                                        {submission.student_name}
                                                        {submission.student_username && (
                                                            <span className="ml-2 font-mono text-xs font-normal text-zinc-400">
                                                                {submission.student_username}
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-zinc-400">
                                                        Dikumpulkan {formatDateTime(submission.submitted_at)}
                                                        {submission.graded_at &&
                                                            ` · dinilai ${formatDateTime(submission.graded_at)}`}
                                                    </p>
                                                </div>
                                                {submission.status === 'graded' ? (
                                                    <Badge tone="emerald">
                                                        Sudah dinilai · {Number(submission.score)}%
                                                    </Badge>
                                                ) : (
                                                    <Badge tone="amber">Menunggu dinilai</Badge>
                                                )}
                                            </div>

                                            <div className="mt-3 space-y-1.5">
                                                {submission.files.map((file, index) => (
                                                    <a
                                                        key={`${file.url}-${index}`}
                                                        href={file.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 hover:border-emerald-300 hover:text-emerald-700"
                                                    >
                                                        <span>📎</span>
                                                        <span className="min-w-0 flex-1 truncate">
                                                            {file.name}
                                                        </span>
                                                        <span className="font-mono text-[11px] text-zinc-400">
                                                            {formatBytes(file.size)}
                                                        </span>
                                                    </a>
                                                ))}
                                            </div>

                                            {submission.note && (
                                                <p className="mt-2 whitespace-pre-line rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                                                    💬 {submission.note}
                                                </p>
                                            )}

                                            <GradeForm block={block} submission={submission} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </TeacherLayout>
    );
}
