import { Head, Link, router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import GradeMatrix, { ScorePill, StatusBadge } from '@/Components/GradeMatrix';
import { Badge, Button, Field, PageHeader, inputClass } from '@/Components/ui';
import TeacherLayout from '@/Layouts/TeacherLayout';

const ASSESSMENT_LABELS = {
    formatif: 'Formatif',
    sumatif_lingkup_materi: 'Sumatif Lingkup Materi',
    sumatif_akhir_semester: 'Sumatif Akhir Semester',
};

function answerPreview(answer) {
    if (answer === null || answer === undefined) return 'Belum dijawab';
    if (typeof answer === 'string') return answer;
    if (Array.isArray(answer)) return answer.join(' → ');
    if (typeof answer === 'object') {
        return Object.entries(answer)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join(' · ');
    }
    return String(answer);
}

function OverrideForm({ module, student, onDone }) {
    const initial = module.override_score ?? module.score ?? '';
    const [score, setScore] = useState(initial === null ? '' : String(initial));
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    function submit(event) {
        event.preventDefault();
        setSaving(true);

        router.patch(
            `/teacher/gradebook/modules/${module.id}/students/${student.id}/override`,
            { score, reason },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setReason('');
                    setSaving(false);
                    onDone?.();
                },
                onError: () => setSaving(false),
            },
        );
    }

    return (
        <form onSubmit={submit} className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Override Nilai Manual</span>
                {module.override_score !== null && <Badge tone="amber">Sudah override</Badge>}
            </div>

            <div className="grid gap-2 sm:grid-cols-[7rem_1fr]">
                <Field label="Nilai 0–100">
                    <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        required
                        className={inputClass}
                        value={score}
                        onChange={(event) => setScore(event.target.value)}
                    />
                </Field>
                <Field label="Alasan (wajib)">
                    <input
                        type="text"
                        required
                        minLength={5}
                        maxLength={1000}
                        className={inputClass}
                        placeholder="Contoh: koreksi jawaban esai nomor 3"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                    />
                </Field>
            </div>

            {module.override_reason && (
                <p className="mt-2 text-[11px] text-amber-700">
                    Override sebelumnya: {module.override_reason}
                </p>
            )}

            <div className="mt-2 flex justify-end">
                <Button type="submit" size="sm" disabled={saving}>
                    {saving ? 'Menyimpan…' : 'Simpan Override'}
                </Button>
            </div>
        </form>
    );
}

function StudentDrawer({ open, data, loading, onClose, kktp }) {
    useEffect(() => {
        function onKey(event) {
            if (event.key === 'Escape') onClose();
        }
        if (open) window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-zinc-900/30" onClick={onClose}>
            <aside
                className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-zinc-200 bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
                aria-label="Detail nilai siswa"
            >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-4">
                    <div>
                        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-700">Detail nilai</div>
                        <h2 className="mt-0.5 font-display text-lg font-bold text-zinc-900">
                            {data?.student?.name ?? 'Memuat…'}
                        </h2>
                        {data?.student?.nisn && (
                            <p className="font-mono text-xs text-zinc-500">NISN {data.student.nisn}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
                    >
                        Tutup
                    </button>
                </div>

                <div className="space-y-4 px-5 py-4">
                    {loading && <p className="text-sm text-zinc-500">Memuat jawaban siswa…</p>}

                    {!loading && data && (
                        <>
                            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 py-2">
                                <span className="text-xs uppercase tracking-wide text-zinc-500">Nilai akhir</span>
                                <ScorePill score={data.final_score} passed={data.final_score !== null ? data.final_score >= kktp : null} />
                                <StatusBadge status={data.status} />
                            </div>

                            <p className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm leading-relaxed text-emerald-900">
                                {data.description}
                            </p>

                            {data.modules.length === 0 && (
                                <p className="text-sm text-zinc-500">Belum ada modul pada ploting ini.</p>
                            )}

                            {data.modules.map((module) => (
                                <section key={module.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-semibold text-zinc-900">{module.title}</h3>
                                            <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                                                {module.objective?.code ?? 'Tanpa TP'} · {ASSESSMENT_LABELS[module.assessment_type] ?? module.assessment_type} · KKTP {module.kktp}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <ScorePill score={module.score} passed={module.is_passed} />
                                            {module.override_score !== null && <Badge tone="amber">OVR</Badge>}
                                        </div>
                                    </div>

                                    {module.override_score !== null && (
                                        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                                            Nilai sistem {module.system_score === null ? '—' : Number(module.system_score).toFixed(2)} diubah menjadi{' '}
                                            {Number(module.override_score).toFixed(2)}. Alasan: {module.override_reason}
                                        </p>
                                    )}

                                    <div className="mt-2 space-y-1.5">
                                        {module.blocks.length === 0 && (
                                            <p className="text-xs text-zinc-400">Belum ada blok pada modul ini.</p>
                                        )}
                                        {module.blocks.map((block) => (
                                            <div key={block.block_id} className="rounded-md border border-zinc-100 bg-zinc-50/60 px-2.5 py-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-mono text-[11px] text-zinc-500">
                                                        #{block.block_id.slice(0, 8)} · {block.block_type}
                                                    </span>
                                                    <span className="font-mono text-[11px] text-zinc-700">
                                                        {block.earned_points === null ? 'belum dijawab' : `${block.earned_points} / ${block.points} poin`}
                                                    </span>
                                                </div>
                                                <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{answerPreview(block.answer)}</p>
                                                {block.ai_feedback && (
                                                    <p className="mt-1 rounded bg-white px-2 py-1 text-[11px] text-emerald-800">
                                                        Umpan balik: {block.ai_feedback}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <OverrideForm module={module} student={data.student} />
                                </section>
                            ))}
                        </>
                    )}
                </div>
            </aside>
        </div>
    );
}

export default function GradebookShow({ matrix, urls }) {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(false);

    async function openStudent(student) {
        setDrawerOpen(true);
        setLoading(true);
        setDetail(null);

        try {
            const response = await fetch(urls.detail.replace('__STUDENT__', String(student.id)), {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });

            if (!response.ok) throw new Error('Gagal memuat detail siswa.');
            setDetail(await response.json());
        } catch (error) {
            setDetail(null);
        } finally {
            setLoading(false);
        }
    }

    function reloadMatrix() {
        router.reload({ only: ['matrix'], preserveScroll: true });
        if (detail?.student) {
            openStudent(detail.student);
        }
    }

    return (
        <TeacherLayout>
            <Head title={`Buku Nilai ${matrix.assignment.classroom}`} />

            <PageHeader
                title={`${matrix.assignment.subject} — ${matrix.assignment.classroom}`}
                subtitle={`${matrix.assignment.year} ${matrix.assignment.semester ?? ''} · ${matrix.summary.students} siswa · KKTP ${matrix.summary.kktp}`}
                actions={
                    <>
                        <Link
                            href={urls.index}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                            Kembali
                        </Link>
                        <Link
                            href={urls.export}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                            Export CSV
                        </Link>
                    </>
                }
            />

            <GradeMatrix matrix={matrix} onCellClick={(student) => openStudent(student)} />

            <p className="mt-2 text-xs text-zinc-500">
                Klik salah satu sel nilai untuk membuka jawaban per blok, komentar AI, dan form override manual.
            </p>

            <StudentDrawer
                open={drawerOpen}
                data={detail}
                loading={loading}
                kktp={matrix.summary.kktp}
                onClose={() => {
                    setDrawerOpen(false);
                    setDetail(null);
                }}
            />
        </TeacherLayout>
    );
}
