import { Head, Link, router } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DynamicBlockRenderer from '@/Components/DynamicBlockRenderer';
import { useClassroomSync } from '@/hooks/useClassroomSync';

function xsrfToken() {
    const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

export default function Room({
    session,
    module,
    blocks = [],
    my_responses: myResponses = {},
    student_name: studentName,
    ws_url: wsUrl,
    urls,
}) {
    const [currentId, setCurrentId] = useState(session.current_block_id ?? blocks[0]?.id ?? null);
    const [status, setStatus] = useState(session.status);
    const [liveModule, setLiveModule] = useState(null);
    const [saved, setSaved] = useState(myResponses ?? {});
    const [savingBlocks, setSavingBlocks] = useState(() => new Set());
    const [error, setError] = useState(null);

    const currentIdRef = useRef(currentId);
    useEffect(() => {
        currentIdRef.current = currentId;
    }, [currentId]);

    const allBlocks = useMemo(() => {
        const source = liveModule?.blocks?.length ? liveModule.blocks : blocks;
        return [...source].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    }, [liveModule, blocks]);

    const activeIndex = allBlocks.findIndex((block) => block.id === currentId);
    const activeBlock = activeIndex >= 0 ? allBlocks[activeIndex] : allBlocks[0];

    const handleState = useCallback((state) => {
        if (!state) return;
        if (state.status) setStatus(state.status);
        if (state.status === 'ended') return;
        if (state.current_block_id && state.current_block_id !== currentIdRef.current) {
            currentIdRef.current = state.current_block_id;
            setCurrentId(state.current_block_id);
            setError(null);
        }
    }, []);

    const { status: socketStatus, presence, lastError, sendAnswer } = useClassroomSync({
        wsUrl,
        pin: session.pin_code,
        role: 'student',
        name: studentName,
        onState: handleState,
        onModule: (payload) => {
            // Abaikan payload modul bila daftar bloknya sama dengan props:
            // serialisasi WS mengacak urutan langkah soal sequencing di server,
            // dan mengganti objek blok akan mereset susunan yang sedang dikerjakan siswa.
            const incomingIds = (payload?.blocks ?? []).map((block) => block.id).join(',');
            const knownIds = blocks.map((block) => block.id).join(',');
            if (incomingIds && incomingIds === knownIds) return;
            setLiveModule(payload);
        },
        onEnded: () => setStatus('ended'),
    });

    const savedForActive = saved?.[activeBlock?.id] ?? null;
    const saving = activeBlock ? savingBlocks.has(activeBlock.id) : false;
    const connected = socketStatus === 'open';

    // Mengembalikan true hanya bila jawaban benar-benar tersimpan di server,
    // agar blok soal tidak menampilkan "terkirim" untuk kiriman yang gagal.
    async function submitAnswer(answer) {
        if (!activeBlock) return false;

        const blockId = activeBlock.id;
        if (savingBlocks.has(blockId)) return false;

        setSavingBlocks((current) => new Set(current).add(blockId));
        setError(null);

        try {
            const response = await fetch(urls.respond, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': xsrfToken(),
                },
                body: JSON.stringify({ block_id: blockId, answer }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message ?? 'Gagal menyimpan jawaban.');
            }

            const payload = await response.json();
            setSaved((current) => ({
                ...current,
                [blockId]: {
                    answer,
                    earned_points: payload.earned_points,
                    is_graded: payload.is_graded,
                },
            }));

            sendAnswer(blockId, answer);
            return true;
        } catch (caught) {
            setError(caught.message);
            return false;
        } finally {
            setSavingBlocks((current) => {
                const next = new Set(current);
                next.delete(blockId);
                return next;
            });
        }
    }

    // Cadangan bila WebSocket mati: periksa ulang state sesi dari server
    // secara berkala agar siswa tidak terjebak di layar tunggu selamanya.
    useEffect(() => {
        if (connected || status === 'ended') return undefined;

        const timer = setInterval(() => {
            router.reload({ only: ['session'] });
        }, 20000);

        return () => clearInterval(timer);
    }, [connected, status]);

    const ended = status === 'ended';

    return (
        <div className="min-h-screen bg-zinc-50">
            <Head title={`Live · ${module?.title ?? 'Kelas'}`} />

            <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
                <div className="mx-auto flex w-full max-w-sm items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                    ended ? 'bg-zinc-400' : connected ? 'animate-pulse bg-emerald-500' : 'bg-amber-400'
                                }`}
                            />
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-700">
                                {ended ? 'Sesi selesai' : 'Live'}
                            </span>
                        </div>
                        <div className="truncate font-display text-sm font-bold text-zinc-900">
                            {module?.title}
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">PIN</div>
                        <div className="font-mono text-sm font-semibold tracking-[0.2em] text-zinc-700">
                            {session.pin_code}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Online</div>
                        <div className="font-display text-sm font-bold tabular-nums text-zinc-900">{presence}</div>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-sm px-4 pb-10 pt-4">
                {ended ? (
                    <div className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 text-center">
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                            Selesai
                        </div>
                        <h1 className="mt-2 font-display text-lg font-bold text-zinc-900">Sesi ditutup guru</h1>
                        <p className="mt-1 text-sm text-zinc-500">
                            Jawaban yang sudah dikirim tetap tersimpan.
                        </p>
                        <Link
                            href={urls.join}
                            className="mt-5 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                            Gabung Sesi Lain
                        </Link>
                    </div>
                ) : status === 'waiting' ? (
                    <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
                        </div>
                        <h1 className="mt-3 font-display text-base font-bold text-zinc-900">
                            Menunggu guru memulai
                        </h1>
                        <p className="mt-1 text-sm text-zinc-500">Halaman akan berganti otomatis.</p>
                        {!connected && (
                            <p className="mt-2 text-xs text-amber-600">
                                Koneksi realtime belum tersambung — halaman memeriksa ulang otomatis tiap
                                20 detik. Tetap di halaman ini ya.
                            </p>
                        )}
                    </div>
                ) : activeBlock ? (
                    <>
                        <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                            <span>
                                Slide {activeIndex + 1} / {allBlocks.length}
                            </span>
                            <span>{socketStatus === 'open' ? 'Sinkron' : 'Menyambung...'}</span>
                        </div>

                        <DynamicBlockRenderer
                            key={activeBlock.id}
                            block={activeBlock}
                            mode="live_hp_siswa"
                            index={activeIndex}
                            total={allBlocks.length}
                            onSubmitAnswer={submitAnswer}
                            initialAnswer={saved[activeBlock.id]?.answer ?? null}
                        />

                        <div className="mt-3 min-h-8">
                            {saving && <p className="text-xs text-zinc-500">Mengirim jawaban...</p>}
                            {!saving && savedForActive && (
                                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                                    Jawaban terkirim
                                    {savedForActive.is_graded
                                        ? ` · ${Number(savedForActive.earned_points)} poin`
                                        : ' · menunggu penilaian'}
                                </p>
                            )}
                            {(error || lastError) && (
                                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                    {error ?? lastError}
                                </p>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
                        Belum ada slide untuk ditampilkan.
                    </div>
                )}
            </main>
        </div>
    );
}
