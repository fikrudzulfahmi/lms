import { Head, Link, router } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TeacherLayout from '@/Layouts/TeacherLayout';
import DynamicBlockRenderer, { BLOCK_LABELS } from '@/Components/DynamicBlockRenderer';
import BlockEditor from '@/Components/studio/BlockEditor';
import { Button, Field, Modal, inputClass, selectClass } from '@/Components/ui';

const PREVIEW_MODES = [
    { value: 'editor_guru', label: 'Editor' },
    { value: 'live_proyektor', label: 'Proyektor' },
    { value: 'live_hp_siswa', label: 'HP Siswa' },
    { value: 'mandiri_siswa', label: 'Mandiri' },
];

function defaultContent(type) {
    switch (type) {
        case 'materi_teks':
            return { title: 'Materi baru', body: 'Tulis penjelasan materi di sini.' };
        case 'materi_accordion':
            return {
                title: 'SOP baru',
                items: [{ label: 'Langkah 1', text: 'Jelaskan langkah kerja sesuai SOP.' }],
            };
        case 'materi_flashcard':
            return {
                title: 'Flashcard baru',
                cards: [
                    { front: 'Istilah', back: 'Penjelasan singkat istilah tersebut.' },
                    { front: 'Istilah kedua', back: 'Penjelasan singkat istilah kedua.' },
                ],
            };
        case 'slide_image':
            return { url: 'https://placehold.co/1280x720/png', caption: 'Slide baru' };
        case 'soal_mcq':
            return {
                question: 'Tulis pertanyaan pilihan ganda...',
                options: [
                    { text: 'Opsi A', correct: true },
                    { text: 'Opsi B', correct: false },
                ],
                explanation: '',
            };
        case 'soal_sequencing':
            return {
                question: 'Urutkan langkah prosedur berikut.',
                steps: ['Langkah pertama', 'Langkah kedua'],
                explanation: '',
            };
        case 'soal_matching':
            return {
                question: 'Cocokkan komponen dengan pasangannya.',
                pairs: [
                    { left: 'Komponen A', right: 'Fungsi A' },
                    { left: 'Komponen B', right: 'Fungsi B' },
                ],
                explanation: '',
            };
        case 'soal_essay_ai':
            return {
                question: 'Tulis studi kasus untuk dianalisis siswa...',
                min_words: 30,
            };
        default:
            return {};
    }
}

function defaultPoints(type) {
    return type.startsWith('soal_') ? 10 : 0;
}

async function apiRequest(url, method, body) {
    const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';

    const response = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-TOKEN': token,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const firstError = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
        throw new Error(firstError || payload?.message || `Gagal menyimpan (${response.status}).`);
    }

    return payload;
}

function timeLabel(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function Edit({ module, blocks: initialBlocks = [], block_types = [], objectives = [], ai = {}, urls = {} }) {
    const [blocks, setBlocks] = useState(initialBlocks);
    const [selectedId, setSelectedId] = useState(initialBlocks[0]?.id ?? null);
    const [saveState, setSaveState] = useState('saved');
    const [savedAt, setSavedAt] = useState(null);
    const [saveError, setSaveError] = useState(null);
    const [previewMode, setPreviewMode] = useState('editor_guru');
    const [title, setTitle] = useState(module.title);
    const [status, setStatus] = useState(module.status);
    const [adding, setAdding] = useState(null);
    const [draggingId, setDraggingId] = useState(null);
    const [aiOpen, setAiOpen] = useState(false);
    const [aiStatus, setAiStatus] = useState(ai.status ?? null);
    const [aiError, setAiError] = useState(ai.error ?? null);
    const [aiNotice, setAiNotice] = useState(null);
    const [aiSubmitting, setAiSubmitting] = useState(false);
    const [aiForm, setAiForm] = useState({
        learning_objective_id: module.objective?.id ?? '',
        count: 4,
        difficulty: 'sedang',
        instruction: '',
    });

    const csrfToken =
        typeof document === 'undefined'
            ? ''
            : (document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '');

    const timers = useRef(new Map());
    const metaTimer = useRef(null);
    const blocksRef = useRef(initialBlocks);
    const titleRef = useRef(module.title);

    blocksRef.current = blocks;

    const selectedBlock = useMemo(
        () => blocks.find((block) => block.id === selectedId) ?? blocks[0] ?? null,
        [blocks, selectedId],
    );

    const markSaved = useCallback((iso = new Date().toISOString()) => {
        setSavedAt(iso);
        setSaveState('saved');
        setSaveError(null);
    }, []);

    const markError = useCallback((error) => {
        setSaveState('error');
        setSaveError(error.message || 'Gagal menyimpan.');
    }, []);

    const scheduleSave = useCallback(
        (block) => {
            setSaveState('dirty');
            setSaveError(null);

            const existing = timers.current.get(block.id);
            if (existing) clearTimeout(existing);

            const timer = setTimeout(async () => {
                timers.current.delete(block.id);
                setSaveState('saving');

                try {
                    const payload = await apiRequest(urls.blocks + '/' + block.id, 'PATCH', {
                        block_type: block.block_type,
                        points: Number(block.points) || 0,
                        content: block.content ?? {},
                        ai_rubric: block.ai_rubric ?? null,
                    });
                    markSaved(payload.saved_at);
                } catch (error) {
                    markError(error);
                }
            }, 750);

            timers.current.set(block.id, timer);
        },
        [markError, markSaved, urls.blocks],
    );

    useEffect(() => {
        return () => {
            timers.current.forEach((timer) => clearTimeout(timer));
            if (metaTimer.current) clearTimeout(metaTimer.current);
        };
    }, []);

    useEffect(() => {
        if (!urls.ai_status) return undefined;

        if (!['queued', 'generating'].includes(aiStatus)) return undefined;

        let cancelled = false;
        let timer = null;

        async function poll() {
            try {
                const payload = await apiRequest(urls.ai_status, 'GET');

                if (cancelled) return;

                const next = payload.ai_status ?? null;
                setAiStatus(next);
                setAiError(payload.ai_error ?? null);

                if (next === 'completed') {
                    const incoming = Array.isArray(payload.blocks) ? payload.blocks : [];
                    setBlocks(incoming);
                    setSelectedId(incoming[incoming.length - 1]?.id ?? null);
                    markSaved(payload.ai_generated_at ?? new Date().toISOString());
                    setAiNotice(`${incoming.length} blok tersedia. Periksa dan sunting sebelum diterbitkan.`);

                    return;
                }

                if (next === 'ai_failed') {
                    setAiError(payload.ai_error || 'AI gagal menyusun blok. Coba lagi.');
                    return;
                }

                timer = setTimeout(poll, 2500);
            } catch (error) {
                if (cancelled) return;

                setAiError(error.message || 'Gagal memeriksa status AI.');
                timer = setTimeout(poll, 5000);
            }
        }

        poll();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [aiStatus, markSaved, urls.ai_status]);

    async function startAiGeneration() {
        setAiSubmitting(true);
        setAiError(null);
        setAiNotice(null);

        try {
            const payload = await apiRequest(urls.ai_generate, 'POST', {
                learning_objective_id: aiForm.learning_objective_id || null,
                count: Number(aiForm.count) || 4,
                difficulty: aiForm.difficulty,
                instruction: aiForm.instruction || null,
            });

            setAiStatus(payload.ai_status ?? 'queued');
            setAiOpen(false);
            setAiNotice('AI sedang menyusun blok. Outline akan diperbarui otomatis.');
        } catch (error) {
            setAiError(error.message || 'Gagal memulai generate AI.');
        } finally {
            setAiSubmitting(false);
        }
    }

    useEffect(() => {
        if (!selectedId && blocks.length > 0) setSelectedId(blocks[0].id);
    }, [blocks, selectedId]);

    function updateBlock(id, patch) {
        let mergedBlock = null;

        const next = blocksRef.current.map((block) => {
            if (block.id !== id) return block;
            mergedBlock = { ...block, ...patch };
            return mergedBlock;
        });

        blocksRef.current = next;
        setBlocks(next);

        if (mergedBlock) scheduleSave(mergedBlock);
    }

    async function addBlock(type) {
        setAdding(type);
        setSaveError(null);

        try {
            const payload = await apiRequest(urls.blocks, 'POST', {
                block_type: type,
                points: defaultPoints(type),
                content: defaultContent(type),
            });

            setBlocks((current) => [...current, payload.block]);
            setSelectedId(payload.block.id);
            markSaved(payload.saved_at);
        } catch (error) {
            markError(error);
        } finally {
            setAdding(null);
        }
    }

    async function importSlidesToBlocks(slides, meta, originId) {
        if (!Array.isArray(slides) || slides.length === 0) return;

        setSaveState('saving');
        setSaveError(null);

        const queue = [...slides];
        let savedAt = null;

        try {
            const origin = blocksRef.current.find((item) => item.id === originId);
            const originIsEmpty =
                origin && !origin.content?.url && (origin.content?.images ?? []).length === 0;

            if (originIsEmpty) {
                const first = queue.shift();
                const content = {
                    ...(origin.content ?? {}),
                    url: first.url,
                    caption: first.name ?? `${meta?.sourceName ?? 'Slide'} — halaman 1`,
                };
                const payload = await apiRequest(`${urls.blocks}/${origin.id}`, 'PATCH', {
                    block_type: 'slide_image',
                    points: Number(origin.points) || 0,
                    content,
                    ai_rubric: origin.ai_rubric ?? null,
                });
                savedAt = payload.saved_at;
                setBlocks((current) =>
                    current.map((item) => (item.id === origin.id ? { ...item, content } : item)),
                );
            }

            const created = [];

            for (const slide of queue) {
                const payload = await apiRequest(urls.blocks, 'POST', {
                    block_type: 'slide_image',
                    points: 0,
                    content: { url: slide.url, caption: slide.name },
                });
                created.push(payload.block);
                savedAt = payload.saved_at;
            }

            if (created.length > 0) setBlocks((current) => [...current, ...created]);
            if (savedAt) markSaved(savedAt);
        } catch (error) {
            markError(error);
        }
    }

    async function deleteBlock(id) {
        if (!window.confirm('Hapus blok ini? Tindakan tidak dapat dibatalkan.')) return;

        const remaining = blocks.filter((block) => block.id !== id);
        const pending = timers.current.get(id);
        if (pending) {
            clearTimeout(pending);
            timers.current.delete(id);
        }
        setBlocks(remaining);
        if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
        setSaveState('saving');

        try {
            const payload = await apiRequest(`${urls.blocks}/${id}`, 'DELETE');
            markSaved(payload.saved_at);
        } catch (error) {
            markError(error);
        }
    }

    async function persistOrder(nextBlocks) {
        setBlocks(nextBlocks);
        setSaveState('saving');

        try {
            const payload = await apiRequest(urls.reorder, 'PATCH', {
                ids: nextBlocks.map((block) => block.id),
            });
            markSaved(payload.saved_at);
        } catch (error) {
            markError(error);
        }
    }

    function moveBlock(index, direction) {
        const target = index + direction;
        if (target < 0 || target >= blocks.length) return;

        const next = [...blocks];
        [next[index], next[target]] = [next[target], next[index]];
        persistOrder(next);
    }

    function moveBlockTo(sourceId, targetId) {
        if (!sourceId || sourceId === targetId) return;

        const sourceIndex = blocks.findIndex((block) => block.id === sourceId);
        const targetIndex = blocks.findIndex((block) => block.id === targetId);
        if (sourceIndex < 0 || targetIndex < 0) return;

        const next = [...blocks];
        const [item] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, item);
        persistOrder(next);
    }

    function updateMeta(patch) {
        setSaveState('dirty');
        if (metaTimer.current) clearTimeout(metaTimer.current);

        metaTimer.current = setTimeout(async () => {
            setSaveState('saving');
            try {
                const payload = await apiRequest(urls.update, 'PATCH', patch);
                markSaved(payload.saved_at);
            } catch (error) {
                markError(error);
            }
        }, 800);
    }

    function toggleStatus() {
        const next = status === 'published' ? 'draft' : 'published';
        setStatus(next);
        updateMeta({ status: next, title: titleRef.current });
    }

    const stateBadge = {
        saved: { dot: 'bg-emerald-500', text: 'Tersimpan' },
        saving: { dot: 'bg-amber-400', text: 'Menyimpan...' },
        dirty: { dot: 'bg-amber-400', text: 'Belum tersimpan' },
        error: { dot: 'bg-red-500', text: 'Gagal menyimpan' },
    }[saveState];

    return (
        <TeacherLayout>
            <Head title={`Studio · ${title}`} />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                        <Link href={urls.index} className="text-zinc-500 hover:text-emerald-700">
                            Modul Ajar
                        </Link>
                        <span className="text-zinc-300">/</span>
                        <span className="font-mono text-zinc-500">#{module.id}</span>
                    </div>
                    <input
                        value={title}
                        onChange={(event) => {
                            setTitle(event.target.value);
                            titleRef.current = event.target.value;
                            updateMeta({ title: event.target.value, status });
                        }}
                        className="mt-1 w-full max-w-2xl border-0 bg-transparent p-0 font-display text-xl font-bold tracking-tight text-zinc-900 focus:outline-none focus:ring-0"
                        maxLength={180}
                        aria-label="Judul modul"
                    />
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-700">{module.subject}</span>
                        <span className="font-mono text-zinc-400">{module.subject_code}</span>
                        <span className="text-zinc-300">·</span>
                        <span>{module.classroom}</span>
                        <span className="text-zinc-300">·</span>
                        <span>
                            {module.year} {module.semester}
                        </span>
                        {module.objective && (
                            <>
                                <span className="text-zinc-300">·</span>
                                <span className="font-mono text-emerald-700">{module.objective.code}</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600">
                        <span className={`h-1.5 w-1.5 rounded-full ${stateBadge.dot}`} />
                        <span>{stateBadge.text}</span>
                        {saveState === 'saved' && savedAt && (
                            <span className="font-mono text-[11px] text-zinc-400">{timeLabel(savedAt)}</span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => router.post(`/teacher/modules/${module.id}/live`)}
                        disabled={blocks.length === 0}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        title={blocks.length === 0 ? 'Tambahkan minimal satu blok dulu' : 'Buka panggung proyektor'}
                    >
                        Panggung Live
                    </button>

                    <button
                        type="button"
                        onClick={toggleStatus}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                            status === 'published'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                        }`}
                    >
                        {status === 'published' ? 'Terbit' : 'Draft'}
                    </button>

                    <span className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 font-mono text-xs text-zinc-500">
                        {blocks.length} blok
                    </span>

                    {['queued', 'generating'].includes(aiStatus) ? (
                        <span className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                            AI menyusun blok...
                        </span>
                    ) : (
                        <Button
                            size="sm"
                            onClick={() => {
                                setAiError(null);
                                setAiOpen(true);
                            }}
                            className="rounded-lg"
                        >
                            Generate dengan AI
                        </Button>
                    )}
                </div>
            </div>

            {saveError && (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                    <span>{saveError}</span>
                    <button type="button" onClick={() => setSaveError(null)} className="text-xs underline">
                        tutup
                    </button>
                </div>
            )}

            {aiError && (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                    <span>{aiError}</span>
                    <button type="button" onClick={() => setAiError(null)} className="text-xs underline">
                        tutup
                    </button>
                </div>
            )}

            {aiNotice && !aiError && (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
                    <span>{aiNotice}</span>
                    <button type="button" onClick={() => setAiNotice(null)} className="text-xs underline">
                        tutup
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_20rem]">
                {/* KOLOM KIRI — outline + palet blok */}
                <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
                    <div className="rounded-xl border border-zinc-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Outline Blok
                            </h2>
                            <span className="font-mono text-[11px] text-zinc-400">{blocks.length}</span>
                        </div>

                        <div className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
                            {blocks.length === 0 && (
                                <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-400">
                                    Belum ada blok.
                                </p>
                            )}
                            {blocks.map((block, index) => {
                                const active = block.id === selectedBlock?.id;
                                return (
                                    <div
                                        key={block.id}
                                        draggable
                                        onDragStart={() => setDraggingId(block.id)}
                                        onDragEnd={() => setDraggingId(null)}
                                        onDragOver={(event) => event.preventDefault()}
                                        onDrop={() => {
                                            moveBlockTo(draggingId, block.id);
                                            setDraggingId(null);
                                        }}
                                        onClick={() => setSelectedId(block.id)}
                                        className={`cursor-grab rounded-lg border px-2 py-1.5 transition-colors ${
                                            active
                                                ? 'border-emerald-600 bg-emerald-50'
                                                : 'border-transparent hover:bg-zinc-50'
                                        } ${draggingId === block.id ? 'opacity-50' : ''}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-[10px] text-zinc-400">
                                                {String(index + 1).padStart(2, '0')}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-700">
                                                {BLOCK_LABELS[block.block_type] ?? block.block_type}
                                            </span>
                                            {block.points > 0 && (
                                                <span className="font-mono text-[10px] text-emerald-700">
                                                    {block.points}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                title="Hapus blok"
                                                aria-label="Hapus blok"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    deleteBlock(block.id);
                                                }}
                                                className="rounded px-1 text-[10px] text-zinc-400 hover:bg-red-50 hover:text-red-600"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white p-3">
                        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Tambah Blok
                        </h2>
                        <div className="space-y-1.5">
                            {block_types.map((type) => (
                                <button
                                    key={type.value}
                                    type="button"
                                    disabled={adding !== null}
                                    onClick={() => addBlock(type.value)}
                                    className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-2.5 py-1.5 text-left text-xs font-medium text-zinc-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                                >
                                    <span>{type.label}</span>
                                    <span className="font-mono text-[10px] text-zinc-400">
                                        {adding === type.value ? '...' : type.group === 'Soal' ? '+pts' : '＋'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* KOLOM TENGAH — kanvas editor */}
                <section className="min-w-0 space-y-3">
                    {blocks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 font-display text-sm font-bold text-emerald-700">
                                01
                            </div>
                            <h2 className="mt-3 font-display text-base font-bold text-zinc-900">
                                Kanvas masih kosong
                            </h2>
                            <p className="mt-1 max-w-sm text-sm text-zinc-500">
                                Tambah blok dari panel kiri. Setiap blok otomatis tersimpan sebagai halaman
                                slide dan bisa dipakai di proyektor maupun HP siswa.
                            </p>
                        </div>
                    ) : (
                        blocks.map((block, index) => (
                            <div
                                key={block.id}
                                onClick={() => setSelectedId(block.id)}
                                className={
                                    block.id === selectedBlock?.id
                                        ? 'rounded-xl ring-2 ring-emerald-600 ring-offset-2 ring-offset-zinc-50'
                                        : 'rounded-xl'
                                }
                            >
                                <BlockEditor
                                    block={block}
                                    index={index}
                                    total={blocks.length}
                                    onChange={(patch) => updateBlock(block.id, patch)}
                                    onDelete={() => deleteBlock(block.id)}
                                    onMove={moveBlock}
                                    onSlidesImported={importSlidesToBlocks}
                                    uploadUrl={urls.slides}
                                    csrfToken={csrfToken}
                                />
                            </div>
                        ))
                    )}
                </section>

                {/* KOLOM KANAN — preview 4 mode */}
                <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
                    <div className="rounded-xl border border-zinc-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Preview
                            </h2>
                            <span className="font-mono text-[10px] text-zinc-400">
                                {selectedBlock ? BLOCK_LABELS[selectedBlock.block_type] : '—'}
                            </span>
                        </div>

                        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1">
                            {PREVIEW_MODES.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setPreviewMode(option.value)}
                                    className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                        previewMode === option.value
                                            ? 'bg-white text-emerald-700 shadow-sm'
                                            : 'text-zinc-500 hover:text-zinc-800'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>

                        <div
                            className={
                                previewMode === 'live_proyektor'
                                    ? 'rounded-xl bg-zinc-950 p-2'
                                    : previewMode === 'live_hp_siswa'
                                      ? 'mx-auto max-w-[19rem] rounded-xl bg-zinc-100 p-2'
                                      : 'rounded-xl bg-zinc-50 p-2'
                            }
                        >
                            {selectedBlock ? (
                                <DynamicBlockRenderer
                                    block={selectedBlock}
                                    mode={previewMode}
                                    index={blocks.findIndex((b) => b.id === selectedBlock.id)}
                                    total={blocks.length}
                                />
                            ) : (
                                <p className="px-3 py-8 text-center text-xs text-zinc-400">
                                    Pilih blok untuk melihat preview.
                                </p>
                            )}
                        </div>

                        <p className="mt-2 text-[11px] leading-4 text-zinc-400">
                            Preview memakai data blok yang sedang diedit. Mode proyektor menyembunyikan
                            kunci jawaban.
                        </p>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white p-3">
                        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Ringkasan Penilaian
                        </h2>
                        <div className="flex items-center justify-between text-xs text-zinc-600">
                            <span>Total poin soal</span>
                            <span className="font-mono text-zinc-900">
                                {blocks.reduce((sum, block) => sum + (Number(block.points) || 0), 0)}
                            </span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-600">
                            <span>KKTP</span>
                            <span className="font-mono text-emerald-700">{module.kktp_score}</span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-600">
                            <span>Blok soal</span>
                            <span className="font-mono text-zinc-900">
                                {blocks.filter((block) => block.block_type.startsWith('soal_')).length}
                            </span>
                        </div>
                    </div>
                </aside>
            </div>

            <Modal
                open={aiOpen}
                onClose={() => (aiSubmitting ? null : setAiOpen(false))}
                title="Generate blok dengan AI"
                subtitle="AI menambahkan blok baru di akhir outline. Blok lama tidak dihapus."
                wide
                footer={
                    <>
                        <Button variant="outline" onClick={() => setAiOpen(false)} disabled={aiSubmitting}>
                            Batal
                        </Button>
                        <Button onClick={startAiGeneration} disabled={aiSubmitting}>
                            {aiSubmitting ? 'Mengirim...' : 'Generate blok'}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <Field
                        label="Tujuan Pembelajaran (TP)"
                        hint={
                            objectives.length === 0
                                ? 'Belum ada TP untuk mapel ini. AI akan memakai judul modul sebagai acuan.'
                                : 'Pilih TP yang menjadi acuan materi dan soal.'
                        }
                    >
                        <select
                            value={aiForm.learning_objective_id}
                            onChange={(event) =>
                                setAiForm((current) => ({
                                    ...current,
                                    learning_objective_id: event.target.value,
                                }))
                            }
                            className={selectClass}
                        >
                            <option value="">Tanpa TP spesifik (pakai judul modul)</option>
                            {objectives.map((objective) => (
                                <option key={objective.id} value={objective.id}>
                                    {objective.code} — {objective.description}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Tingkat kesulitan">
                            <select
                                value={aiForm.difficulty}
                                onChange={(event) =>
                                    setAiForm((current) => ({ ...current, difficulty: event.target.value }))
                                }
                                className={selectClass}
                            >
                                <option value="mudah">Mudah — pengenalan konsep</option>
                                <option value="sedang">Sedang — aplikasi rutin</option>
                                <option value="sulit">Sulit — analisis kasus</option>
                            </select>
                        </Field>

                        <Field label="Jumlah blok" hint="Antara 1 sampai 12 blok.">
                            <input
                                type="number"
                                min={1}
                                max={12}
                                value={aiForm.count}
                                onChange={(event) =>
                                    setAiForm((current) => ({ ...current, count: event.target.value }))
                                }
                                className={inputClass}
                            />
                        </Field>
                    </div>

                    <Field label="Catatan tambahan (opsional)">
                        <textarea
                            rows={3}
                            maxLength={1000}
                            value={aiForm.instruction}
                            onChange={(event) =>
                                setAiForm((current) => ({ ...current, instruction: event.target.value }))
                            }
                            placeholder="Contoh: fokus pada diagnosa sensor PGM-FI, sertakan satu soal studi kasus."
                            className={inputClass}
                        />
                    </Field>

                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
                        AI menyusun materi, soal pilihan ganda, urutan prosedur, dan esai beserta rubrik
                        rahasia. Periksa kembali fakta teknis dan kesesuaian SOP sebelum menerbitkan modul.
                    </div>
                </div>
            </Modal>
        </TeacherLayout>
    );
}
