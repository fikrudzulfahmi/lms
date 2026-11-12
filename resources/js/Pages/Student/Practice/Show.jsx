import { Head, Link, router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import StudentLayout from '@/Layouts/StudentLayout';
import DynamicBlockRenderer, { BLOCK_LABELS } from '@/Components/DynamicBlockRenderer';

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
        block.block_type !== 'polling' &&
        // Checklist selesai otomatis dari kondisi centang + foto wajib;
        // tugas unggah selesai lewat pengumpulan, bukan tombol ini.
        block.block_type !== 'praktik_checklist' &&
        block.block_type !== 'tugas_upload'
    );
}

export default function PracticeShow({ module, blocks = [], progress = {}, submissions: initialSubmissions = {}, urls = {} }) {
    const initialAnswers =
        progress.answers && !Array.isArray(progress.answers) ? progress.answers : {};

    // Blok disimpan di state agar kunci berurutan bisa membuka blok
    // berikutnya tanpa muat ulang penuh: server mengirim ulang prop blocks
    // (blok yang baru terbuka kini beserta kontennya) lewat router.reload.
    const [blocksState, setBlocksState] = useState(blocks);
    useEffect(() => setBlocksState(blocks), [blocks]);

    const [submissions, setSubmissions] = useState(() =>
        initialSubmissions && !Array.isArray(initialSubmissions) ? initialSubmissions : {},
    );
    const [completedBlocks, setCompletedBlocks] = useState(() => progress.completed_blocks ?? []);
    const [answers, setAnswers] = useState(initialAnswers);
    const [percent, setPercent] = useState(() => progress.percent ?? 0);
    const [completedAt, setCompletedAt] = useState(() => progress.completed_at ?? null);
    const [busyBlocks, setBusyBlocks] = useState(() => new Set());
    const [error, setError] = useState(null);
    const [page, setPage] = useState(0);
    const [finishing, setFinishing] = useState(false);
    const [finished, setFinished] = useState(false);
    const [confirmFinish, setConfirmFinish] = useState(false);

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

    function refreshBlocksIfLocked() {
        if (module.sequential_lock) {
            router.reload({ only: ['blocks'], preserveScroll: true, preserveState: true });
        }
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
            refreshBlocksIfLocked();
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
                // Daftar blok selesai dari server bersifat otoritatif —
                // checklist praktik misalnya hanya selesai bila semua langkah
                // + foto wajib terpenuhi, bukan setiap kali jawaban tersimpan.
                if (Array.isArray(payload.completed_blocks)) {
                    setCompletedBlocks(payload.completed_blocks);
                } else {
                    setCompletedBlocks((current) =>
                        current.includes(block.id) ? current : [...current, block.id],
                    );
                }
                if (typeof payload.percent === 'number') setPercent(payload.percent);
                if ('completed_at' in payload) setCompletedAt(payload.completed_at);
                setError(null);
                if (Array.isArray(payload.completed_blocks) && payload.completed_blocks.includes(block.id)) {
                    refreshBlocksIfLocked();
                }

                // Kontrak blok soal mode latihan: {saved, correct}.
                return { saved: true, correct: payload.correct ?? null };
            } catch (caught) {
                setError(caught.message);
                return false;
            }
        };
    }

    function isAnswered(block) {
        if (block.block_type === 'section_heading') return true;
        if (block.block_type === 'tugas_upload') return Boolean(submissions[block.id]);
        if (answers[block.id]) return true;
        return completedSet.has(block.id);
    }

    async function finishExam() {
        setFinishing(true);
        setError(null);
        try {
            await postJson(urls.finish, {});
            setFinished(true);
            setConfirmFinish(false);
        } catch (caught) {
            setError(caught.message);
        } finally {
            setFinishing(false);
        }
    }

    function submitAssignmentFor(block) {
        return async ({ files, note }) => {
            try {
                const payload = await postJson(urls.submission, {
                    block_id: block.id,
                    files,
                    note,
                });

                if (payload.submission) {
                    setSubmissions((current) => ({ ...current, [block.id]: payload.submission }));
                }
                setCompletedBlocks((current) =>
                    current.includes(block.id) ? current : [...current, block.id],
                );
                if (typeof payload.percent === 'number') setPercent(payload.percent);
                if ('completed_at' in payload) setCompletedAt(payload.completed_at);
                setError(null);
                refreshBlocksIfLocked();

                return payload;
            } catch (caught) {
                setError(caught.message);
                return false;
            }
        };
    }

    if (module.exam_mode) {
        const questionNumbers = {};
        let counter = 0;
        blocksState.forEach((block) => {
            if (block.block_type !== 'section_heading') {
                counter += 1;
                questionNumbers[block.id] = counter;
            }
        });
        const totalQuestions = counter;
        const answeredCount = blocksState.filter(
            (block) => block.block_type !== 'section_heading' && isAnswered(block),
        ).length;
        const active = blocksState[Math.min(page, Math.max(0, blocksState.length - 1))];
        const activeDone = active ? completedSet.has(active.id) : false;

        return (
            <StudentLayout>
                <Head title={`Asesmen · ${module.title}`} />

                <div className="mb-4">
                    <Link href={urls.home} className="text-xs text-zinc-500 hover:text-emerald-700">
                        ← Kembali ke beranda
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                                Mode Asesmen
                            </p>
                            <h1 className="mt-0.5 font-display text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
                                {module.title}
                            </h1>
                            <p className="mt-1 text-sm text-zinc-500">
                                {[module.subject, module.teacher].filter(Boolean).join(' · ')}
                            </p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs text-zinc-600">
                            Terjawab {answeredCount} dari {totalQuestions}
                        </span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                        Kamu boleh melompat ke soal lain dan kembali lagi ke soal yang belum bisa
                        dijawab. Hasil tidak ditampilkan di sini — nilai diumumkan oleh guru.
                    </p>
                </div>

                {error && (
                    <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                        <span>{error}</span>
                        <button type="button" onClick={() => setError(null)} className="text-xs underline">
                            tutup
                        </button>
                    </div>
                )}

                {finished && (
                    <div className="mb-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-5 py-4">
                        <div className="font-display text-base font-bold text-emerald-900">
                            ✅ Asesmen sudah dikumpulkan.
                        </div>
                        <p className="mt-0.5 text-sm text-emerald-700">
                            Jawabanmu terkirim ke guru. Nilai akan muncul di halaman Nilai setelah
                            diumumkan guru. Kamu masih bisa mengubah jawaban lalu mengumpulkan ulang
                            selama halaman ini dibuka.
                        </p>
                    </div>
                )}

                <div className="mb-4 rounded-[20px] border border-zinc-200 bg-white p-3 shadow-card">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                        Navigasi soal
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {blocksState.map((block, index) => {
                            const isActive = index === page;
                            const answered = isAnswered(block);
                            const isHeading = block.block_type === 'section_heading';

                            return (
                                <button
                                    key={block.id}
                                    type="button"
                                    onClick={() => setPage(index)}
                                    title={
                                        isHeading
                                            ? block.content?.title || 'Judul bagian'
                                            : `Soal ${questionNumbers[block.id]}${answered ? ' · sudah dijawab' : ''}`
                                    }
                                    className={`flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 font-mono text-xs font-semibold transition-colors ${
                                        isActive
                                            ? 'border-emerald-600 bg-emerald-600 text-white'
                                            : answered
                                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                              : 'border-zinc-200 bg-white text-zinc-500 hover:border-emerald-300'
                                    }`}
                                >
                                    {isHeading ? '§' : questionNumbers[block.id]}
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-2 flex gap-4 text-[11px] text-zinc-400">
                        <span>
                            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-50" />
                            Sudah dijawab
                        </span>
                        <span>
                            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-zinc-200 bg-white" />
                            Belum dijawab
                        </span>
                        <span>
                            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-600" />
                            Soal aktif
                        </span>
                    </div>
                </div>

                {active ? (
                    <div>
                        <p className="mb-2 font-mono text-xs text-zinc-400">
                            {active.block_type === 'section_heading'
                                ? 'Bagian'
                                : `Soal ${questionNumbers[active.id]} dari ${totalQuestions}`}
                        </p>
                        <DynamicBlockRenderer
                            key={active.id}
                            block={active}
                            mode="mandiri_siswa"
                            onSubmitAnswer={submitAnswerFor(active)}
                            initialAnswer={answers[active.id]?.payload ?? null}
                            initialCorrect={null}
                            studentUploadUrl={urls.upload}
                            submission={submissions[active.id] ?? null}
                            onSubmitAssignment={submitAssignmentFor(active)}
                        />
                        {needsManualDone(active) && (
                            <div className="mt-2 flex items-center gap-3 px-1">
                                {activeDone ? (
                                    <span className="text-xs font-medium text-emerald-700">Selesai ✓</span>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={busyBlocks.has(active.id)}
                                        onClick={() => markDone(active)}
                                        className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        {busyBlocks.has(active.id) ? 'Menyimpan...' : 'Tandai selesai'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="rounded-[20px] border border-dashed border-zinc-200 bg-white px-5 py-10 text-center text-sm text-zinc-400">
                        Modul ini belum memiliki blok.
                    </div>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                    <button
                        type="button"
                        disabled={page <= 0}
                        onClick={() => setPage((current) => Math.max(0, current - 1))}
                        className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        ← Sebelumnya
                    </button>

                    {page >= blocksState.length - 1 ? (
                        confirmFinish ? (
                            <span className="flex items-center gap-2">
                                <span className="text-xs text-zinc-500">
                                    Kumpulkan sekarang? Masih ada {totalQuestions - answeredCount} soal belum dijawab.
                                </span>
                                <button
                                    type="button"
                                    disabled={finishing}
                                    onClick={finishExam}
                                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                                >
                                    {finishing ? 'Mengumpulkan...' : 'Ya, Kumpulkan'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirmFinish(false)}
                                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"
                                >
                                    Batal
                                </button>
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setConfirmFinish(true)}
                                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                            >
                                Kumpulkan Asesmen
                            </button>
                        )
                    ) : (
                        <button
                            type="button"
                            onClick={() => setPage((current) => Math.min(blocksState.length - 1, current + 1))}
                            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-emerald-300 hover:text-emerald-700"
                        >
                            Berikutnya →
                        </button>
                    )}
                </div>
            </StudentLayout>
        );
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
                    {module.sequential_lock && (
                        <p className="mt-1 text-xs font-medium text-emerald-700">
                            🔒 Modul ini memakai kunci berurutan: blok berikutnya terbuka setelah blok
                            sebelumnya selesai.
                        </p>
                    )}
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
                {blocksState.map((block) => {
                    const done = completedSet.has(block.id);
                    const savedAnswer = answers[block.id];

                    if (block.locked) {
                        // Blok pengunci = blok pertama (bukan judul bagian)
                        // yang belum selesai; sebutkan judulnya agar siswa
                        // tahu persis apa yang harus diselesaikan dulu.
                        const gate = blocksState.find(
                            (candidate) =>
                                candidate.block_type !== 'section_heading' &&
                                !candidate.locked &&
                                !completedSet.has(candidate.id),
                        );
                        const gateLabel =
                            gate?.display_title ?? (gate ? (BLOCK_LABELS[gate.block_type] ?? 'Blok') : null);

                        return (
                            <div
                                key={block.id}
                                className="rounded-[20px] border border-dashed border-zinc-300 bg-zinc-50 px-5 py-6 text-center"
                            >
                                <div className="text-2xl" aria-hidden="true">
                                    🔒
                                </div>
                                <p className="mt-1.5 text-sm font-semibold text-zinc-700">
                                    {block.display_title ?? (BLOCK_LABELS[block.block_type] ?? 'Blok')}
                                </p>
                                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                                    {BLOCK_LABELS[block.block_type] ?? 'Blok'} · terkunci
                                </p>
                                <p className="mt-1 text-xs text-zinc-500">
                                    {gateLabel
                                        ? `Selesaikan dulu “${gateLabel}” untuk membuka blok ini.`
                                        : 'Selesaikan blok sebelumnya untuk membuka blok ini.'}
                                </p>
                            </div>
                        );
                    }

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
                                studentUploadUrl={urls.upload}
                                submission={submissions[block.id] ?? null}
                                onSubmitAssignment={submitAssignmentFor(block)}
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

                {blocksState.length === 0 && (
                    <div className="rounded-[20px] border border-dashed border-zinc-200 bg-white px-5 py-10 text-center text-sm text-zinc-400">
                        Modul ini belum memiliki blok materi.
                    </div>
                )}
            </div>
        </StudentLayout>
    );
}
