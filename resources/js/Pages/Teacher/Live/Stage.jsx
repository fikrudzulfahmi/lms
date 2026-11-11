import { Head, Link } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DynamicBlockRenderer from '@/Components/DynamicBlockRenderer';
import { useClassroomSync } from '@/hooks/useClassroomSync';

function xsrfToken() {
    const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

async function sendJson(url, method, body = null) {
    const response = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-XSRF-TOKEN': xsrfToken(),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        let message = 'Gagal menyimpan perubahan.';
        try {
            const payload = await response.json();
            message = payload.message ?? message;
        } catch {
            // keep default
        }
        throw new Error(message);
    }

    return response.json();
}

function answerPreview(answer) {
    if (!answer) return '';
    if (typeof answer.text === 'string') return answer.text.slice(0, 120);
    if (Number.isInteger(answer.option_index)) return `Opsi ${String.fromCharCode(65 + answer.option_index)}`;
    if (Array.isArray(answer.order)) return answer.order.map((step) => String(step).slice(0, 24)).join(' → ');
    if (answer.matching) return Object.keys(answer.matching).length + ' pasangan';
    return '';
}

export default function Stage({
    session,
    module,
    blocks = [],
    ws_url: wsUrl,
    control_token: controlToken,
    urls,
}) {
    const ordered = useMemo(
        () => [...blocks].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
        [blocks],
    );

    const [activeId, setActiveId] = useState(
        session.current_block_id ?? ordered[0]?.id ?? null,
    );
    const [status, setStatus] = useState(session.status);
    const [reveal, setReveal] = useState(false);
    const [answers, setAnswers] = useState([]);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const activeIdRef = useRef(activeId);
    const statusRef = useRef(status);

    useEffect(() => {
        activeIdRef.current = activeId;
    }, [activeId]);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    const activeIndex = ordered.findIndex((block) => block.id === activeId);
    const activeBlock = activeIndex >= 0 ? ordered[activeIndex] : ordered[0];

    const handleState = useCallback((state) => {
        if (!state) return;
        if (state.status) setStatus(state.status);
        if (state.status === 'ended') return;

        const next = state.current_block_id ?? null;
        if (next && next !== activeIdRef.current) {
            activeIdRef.current = next;
            setActiveId(next);
            setReveal(false);
            setAnswers([]);
        }
    }, []);

    const handleAnswer = useCallback((payload) => {
        setAnswers((current) => [...current, payload].slice(-60));
    }, []);

    const handleOpen = useCallback(() => {
        if (statusRef.current !== 'ended') {
            sendState(activeIdRef.current, statusRef.current === 'ended' ? 'ended' : 'active');
        }
    }, []);

    const { status: socketStatus, presence, lastError, sendState, endSession } = useClassroomSync({
        wsUrl,
        pin: session.pin_code,
        role: 'teacher',
        name: 'Guru',
        controlToken,
        onState: handleState,
        onAnswer: handleAnswer,
        onOpen: handleOpen,
        onEnded: () => setStatus('ended'),
    });

    const blockAnswers = answers.filter((item) => item.block_id === activeBlock?.id);
    const isQuestion = activeBlock?.block_type?.startsWith('soal_');
    const connected = socketStatus === 'open';

    async function goTo(index) {
        const target = ordered[index];
        if (!target || target.id === activeIdRef.current) return;

        activeIdRef.current = target.id;
        setActiveId(target.id);
        setReveal(false);
        setAnswers([]);
        setError(null);

        try {
            await sendJson(urls.update, 'PATCH', { current_block_id: target.id, status: 'active' });
        } catch (caught) {
            setError(caught.message);
        }

        const sent = sendState(target.id, 'active');
        if (!sent) {
            setError('Koneksi realtime terputus. State akan disinkronkan ulang saat tersambung.');
        }
    }

    async function endLive() {
        if (!window.confirm('Akhiri sesi live? Siswa tidak bisa bergabung lagi dengan PIN ini.')) return;

        setBusy(true);
        try {
            await sendJson(urls.end, 'POST');
            endSession();
            setStatus('ended');
            statusRef.current = 'ended';
        } catch (caught) {
            setError(caught.message);
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        function onKeyDown(event) {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if (event.key === 'ArrowRight') goTo(activeIndex + 1);
            if (event.key === 'ArrowLeft') goTo(activeIndex - 1);
        }

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    });

    const progress = presence > 0 ? Math.min(100, Math.round((blockAnswers.length / presence) * 100)) : 0;

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
            <Head title={`Live · ${module?.title ?? 'Panggung'}`} />

            <header className="flex flex-wrap items-center gap-4 border-b border-zinc-800 px-5 py-3">
                <div className="flex items-center gap-2">
                    <span
                        className={`h-2 w-2 rounded-full ${
                            status === 'ended' ? 'bg-zinc-500' : 'animate-pulse bg-emerald-400'
                        }`}
                    />
                    <span className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">
                        {status === 'ended' ? 'Selesai' : 'Live'}
                    </span>
                </div>

                <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-sm font-semibold text-zinc-100">
                        {module?.title}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                        {[module?.subject, module?.classroom].filter(Boolean).join(' · ')}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">PIN</div>
                        <div className="font-mono text-2xl font-bold tracking-[0.25em] text-emerald-400 sm:text-3xl">
                            {session.pin_code}
                        </div>
                    </div>
                    <div className="border-l border-zinc-800 pl-4 text-right">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                            Siswa online
                        </div>
                        <div className="font-display text-2xl font-bold tabular-nums">{presence}</div>
                    </div>
                    <div className="border-l border-zinc-800 pl-4 text-right">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Slide</div>
                        <div className="font-mono text-sm text-zinc-300">
                            {ordered.length === 0 ? '0 / 0' : `${activeIndex + 1} / ${ordered.length}`}
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-wrap items-center gap-3 border-b border-zinc-900 px-5 py-2 text-xs">
                <span className={`inline-flex items-center gap-1.5 ${connected ? 'text-emerald-400' : status === 'ended' ? 'text-zinc-500' : 'text-amber-400'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : status === 'ended' ? 'bg-zinc-600' : 'bg-amber-400'}`} />
                    {status === 'ended'
                        ? 'Sesi selesai'
                        : connected
                          ? 'Realtime tersambung'
                          : socketStatus === 'reconnecting'
                            ? 'Menyambung ulang...'
                            : 'Realtime terputus'}
                </span>
                <span className="text-zinc-600">Keyboard ← → untuk pindah slide</span>
                {(error || lastError) && (
                    <span className="rounded border border-red-900 bg-red-950/60 px-2 py-0.5 text-red-300">
                        {error ?? lastError}
                    </span>
                )}
                <Link href={urls.edit} className="ml-auto text-zinc-400 hover:text-emerald-400">
                    Kembali ke Studio
                </Link>
            </div>

            <main className="flex flex-1 flex-col px-4 py-6 sm:px-8">
                {status === 'ended' ? (
                    <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-16 text-center">
                        <div className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500">Sesi selesai</div>
                        <h2 className="mt-3 font-display text-3xl font-bold">Panggung ditutup</h2>
                        <p className="mt-2 text-sm text-zinc-400">
                            Jawaban siswa tetap tersimpan dan bisa dinilai di gradebook.
                        </p>
                        <Link
                            href={urls.edit}
                            className="mt-6 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                            Buka Studio Modul
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="mx-auto w-full max-w-5xl">
                            {activeBlock ? (
                                <DynamicBlockRenderer
                                    key={activeBlock.id}
                                    block={activeBlock}
                                    mode="live_proyektor"
                                    index={activeIndex}
                                    total={ordered.length}
                                    showAnswer={reveal}
                                />
                            ) : (
                                <div className="rounded-2xl border border-dashed border-zinc-700 px-6 py-24 text-center text-zinc-500">
                                    Modul ini belum punya blok. Tambahkan materi di Studio dulu.
                                </div>
                            )}
                        </div>

                        {isQuestion && (
                            <div className="mx-auto mt-5 w-full max-w-5xl rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                                        Jawaban masuk
                                    </span>
                                    <span className="font-display text-lg font-bold tabular-nums text-emerald-400">
                                        {blockAnswers.length}
                                    </span>
                                    <span className="text-xs text-zinc-500">dari {presence} siswa online</span>
                                    <div className="mx-2 h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-zinc-800">
                                        <div
                                            className="h-full rounded-full bg-emerald-500 transition-all"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setReveal((value) => !value)}
                                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-emerald-600 hover:text-emerald-400"
                                    >
                                        {reveal ? 'Sembunyikan Kunci' : 'Tampilkan Kunci'}
                                    </button>
                                </div>

                                {blockAnswers.length > 0 && (
                                    <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                                        {[...blockAnswers].reverse().map((item, index) => (
                                            <li
                                                key={`${item.at}-${index}`}
                                                className="flex items-start gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-xs"
                                            >
                                                <span className="font-medium text-zinc-200">{item.student_name}</span>
                                                <span className="min-w-0 flex-1 truncate text-zinc-400">
                                                    {answerPreview(item.answer)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>

            <footer className="flex flex-wrap items-center gap-3 border-t border-zinc-800 px-5 py-3">
                <button
                    type="button"
                    onClick={() => goTo(activeIndex - 1)}
                    disabled={activeIndex <= 0 || status === 'ended'}
                    className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-emerald-600 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-30"
                >
                    ← Sebelumnya
                </button>

                <div className="font-mono text-xs text-zinc-500">
                    {activeIndex < 0 ? 0 : activeIndex + 1} / {ordered.length}
                </div>

                <button
                    type="button"
                    onClick={() => goTo(activeIndex + 1)}
                    disabled={activeIndex >= ordered.length - 1 || status === 'ended'}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                    Slide Berikutnya →
                </button>

                <button
                    type="button"
                    onClick={endLive}
                    disabled={busy || status === 'ended'}
                    className="ml-auto rounded-lg border border-red-900 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Akhiri Sesi
                </button>
            </footer>
        </div>
    );
}
