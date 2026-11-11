import { Head, Link } from '@inertiajs/react';
import { useState } from 'react';
import StudentLayout from '@/Layouts/StudentLayout';
import DynamicBlockRenderer from '@/Components/DynamicBlockRenderer';

function xsrfToken() {
    const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-XSRF-TOKEN': xsrfToken(),
        },
        body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const firstError = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
        throw new Error(firstError || payload?.message || `Gagal menyimpan (${response.status}).`);
    }

    return payload;
}

/** Blok yang diselesaikan lewat tombol "Tandai selesai" (bukan lewat jawaban). */
function needsManualDone(block) {
    return (
        block.block_type !== 'section_heading' &&
        !block.block_type.startsWith('soal_') &&
        block.block_type !== 'polling'
    );
}

export default function PracticeShow({ module, blocks = [], progress = {}, urls = {} }) {
    const initialAnswers =
        progress.answers && !Array.isArray(progress.answers) ? progress.answers : {};

    const [completedBlocks, setCompletedBlocks] = useState(() => progress.completed_blocks ?? []);
    const [answers, setAnswers] = useState(initialAnswers);
    const [percent, setPercent] = useState(() => progress.percent ?? 0);
    const [completedAt, setCompletedAt] = useState(() => progress.completed_at ?? null);
    const [busyBlocks, setBusyBlocks] = useState(() => new Set());
    const [error, setError] = useState(null);

    const completedSet = new Set(completedBlocks);

    function setBusy(blockId, busy) {
        setBusyBlocks((current) => {
            const next = new Set(current);
            if (busy) next.add(blockId);
            else next.delete(blockId);
            return next;
        });
    }

    function applyProgress(payload) {
        if (Array.isArray(payload.completed_blocks)) setCompletedBlocks(payload.completed_blocks);
        if (typeof payload.percent === 'number') setPercent(payload.percent);
        if ('completed_at' in payload) setCompletedAt(payload.completed_at);
    }

    async function markDone(block) {
        if (completedSet.has(block.id) || busyBlocks.has(block.id)) return;

        setBusy(block.id, true);
        setError(null);
        try {
            const payload = await postJson(urls.progress, { block_id: block.id });
            applyProgress(payload);
            setCompletedBlocks((current) =>
                current.includes(block.id) ? current : [...current, block.id],
            );
        } catch (caught) {
            setError(caught.message);
        } finally {
            setBusy(block.id, false);
        }
    }

    function submitAnswerFor(block) {
        return async (answerPayload) => {
            try {
                const payload = await postJson(urls.answer, {
                    block_id: block.id,
                    answer: answerPayload,
                });

                setAnswers((current) => ({
                    ...current,
                    [block.id]: {
                        payload: answerPayload,
                        correct: payload.correct ?? null,
                        earned_points: payload.earned_points ?? 0,
                    },
                }));
                setCompletedBlocks((current) =>
                    current.includes(block.id) ? current : [...current, block.id],
                );
                if (typeof payload.percent === 'number') setPercent(payload.percent);
                if ('completed_at' in payload) setCompletedAt(payload.completed_at);
                setError(null);

                // Kontrak blok soal mode latihan: {saved, correct}.
                return { saved: true, correct: payload.correct ?? null };
            } catch (caught) {
                setError(caught.message);
                return false;
            }
        };
    }

    return (
        <StudentLayout>
            <Head title={`Belajar Mandiri · ${module.title}`} />

            <div className="mb-4">
                <Link href={urls.home} className="text-xs text-zinc-500 hover:text-emerald-700">
                    ← Kembali ke beranda
                </Link>
                <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                            Belajar Mandiri
                        </p>
                        <h1 className="mt-0.5 font-display text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
                            {module.title}
                        </h1>
                        <p className="mt-1 text-sm text-zinc-500">
                            {[module.subject, module.teacher].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                    {completedAt && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">
                            🏅 Tuntas
                        </span>
                    )}
                </div>

                <div className="mt-4 rounded-[20px] border border-zinc-200 bg-white p-4 shadow-card">
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-zinc-700">Progres belajar</span>
                        <span className="font-mono text-xs text-zinc-500">
                            {completedBlocks.length} blok selesai · {percent}%
                        </span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-100">
                        <div
                            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                    <p className="mt-2 text-xs text-zinc-400">
                        Latihan ini tidak masuk nilai rapor — kerjakan untuk belajar, boleh diulang kapan saja.
                    </p>
                </div>
            </div>

            {error && (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError(null)} className="text-xs underline">
                        tutup
                    </button>
                </div>
            )}

            {completedAt && (
                <div className="mb-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-5 py-4">
                    <div className="font-display text-base font-bold text-emerald-900">
                        🎉 Selamat! Kamu menuntaskan modul ini.
                    </div>
                    <p className="mt-0.5 text-sm text-emerald-700">
                        Semua blok sudah selesai dikerjakan. Kamu tetap bisa membuka dan mengulang
                        latihan kapan saja.
                    </p>
                </div>
            )}

            <div className="space-y-4">
                {blocks.map((block) => {
                    const done = completedSet.has(block.id);
                    const savedAnswer = answers[block.id];

                    return (
                        <div key={block.id}>
                            <DynamicBlockRenderer
                                block={block}
                                mode="mandiri_siswa"
                                onSubmitAnswer={submitAnswerFor(block)}
                                initialAnswer={savedAnswer?.payload ?? null}
                                initialCorrect={
                                    typeof savedAnswer?.correct === 'boolean' ? savedAnswer.correct : null
                                }
                            />

                            {needsManualDone(block) && (
                                <div className="mt-2 flex items-center gap-3 px-1">
                                    {done ? (
                                        <span className="text-xs font-medium text-emerald-700">
                                            Selesai ✓
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={busyBlocks.has(block.id)}
                                            onClick={() => markDone(block)}
                                            className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            {busyBlocks.has(block.id) ? 'Menyimpan...' : 'Tandai selesai'}
                                        </button>
                                    )}
                                </div>
                            )}

                            {!needsManualDone(block) &&
                                block.block_type !== 'section_heading' &&
                                done && (
                                    <p className="mt-2 px-1 text-xs font-medium text-emerald-700">
                                        Selesai ✓
                                    </p>
                                )}
                        </div>
                    );
                })}

                {blocks.length === 0 && (
                    <div className="rounded-[20px] border border-dashed border-zinc-200 bg-white px-5 py-10 text-center text-sm text-zinc-400">
                        Modul ini belum memiliki blok materi.
                    </div>
                )}
            </div>
        </StudentLayout>
    );
}
