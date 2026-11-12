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
        case 'section_heading':
            return { title: 'Bagian baru', body: '' };
        case 'materi_richtext':
            return {
                title: '',
                body: 'Tulis penjelasan materi di sini.\n\n- Poin pertama\n- Poin kedua',
            };
        case 'materi_video':
            return {
                title: '',
                source: 'youtube',
                url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
                caption: '',
            };
        case 'materi_file':
            return {
                title: '',
                files: [
                    {
                        name: 'Contoh berkas.pdf',
                        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                        size: 13264,
                    },
                ],
            };
        case 'materi_embed':
            return { title: '', url: 'https://id.wikipedia.org', embed: false, caption: '' };
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
        case 'soal_truefalse':
            return {
                question: 'Tulis pernyataan untuk dinilai benar atau salah...',
                answer: true,
                explanation: '',
            };
        case 'soal_fillblank':
            return {
                question: 'Ibu kota Indonesia adalah ___.',
                answers: ['Jakarta'],
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
        case 'soal_hotspot':
            return {
                question: 'Labeli bagian-bagian pada gambar berikut.',
                image_url: 'https://placehold.co/1280x720/png',
                spots: [
                    { x: 25, y: 40, label: 'Bagian A' },
                    { x: 70, y: 60, label: 'Bagian B' },
                ],
                explanation: '',
            };
        case 'materi_video_interaktif':
            return {
                title: '',
                // URL contoh wajib terisi: validasi backend menolak url kosong
                // (content.url required) saat blok pertama kali dibuat, sama
                // seperti blok video/file/hotspot yang memakai contoh bawaan.
                url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                checkpoints: [
                    {
                        at: 30,
                        question: 'Tulis pertanyaan checkpoint...',
                        options: [{ text: 'Opsi A' }, { text: 'Opsi B' }],
                        correct_index: 0,
                    },
                ],
            };
        case 'polling':
            return {
                question: 'Tulis pertanyaan polling untuk kelas...',
                options: ['Opsi A', 'Opsi B'],
            };
        case 'praktik_checklist':
            return {
                title: 'Checklist praktik baru',
                instructions: '',
                steps: [
                    { label: 'Langkah pertama', require_photo: false },
                    { label: 'Langkah kedua', require_photo: true },
                ],
            };
        case 'tugas_upload':
            return {
                title: 'Tugas praktik baru',
                instructions: '',
                max_files: 3,
                accept: 'file',
                rubric: [
                    { criterion: 'Ketepatan prosedur', max_score: 40 },
                    { criterion: 'Hasil akhir', max_score: 40 },
                    { criterion: 'Keselamatan kerja', max_score: 20 },
                ],
            };
        default:
            return {};
    }
}

function defaultPoints(type) {
    // Video interaktif berkelompok Materi tetapi dinilai per checkpoint,
    // jadi ikut mendapat poin bawaan seperti blok soal. Tugas unggah juga
    // dinilai (rubrik guru diskalakan ke poin blok).
    return type.startsWith('soal_') || type === 'materi_video_interaktif' || type === 'tugas_upload' ? 10 : 0;
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
        const error = new Error(firstError || payload?.message || `Gagal menyimpan (${response.status}).`);
        error.status = response.status;
        throw error;
    }

    return payload;
}

function timeLabel(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function Edit({ module, blocks: initialBlocks = [], block_types = [], objectives = [], ai = {}, urls = {}, live = null }) {
    const [blocks, setBlocks] = useState(initialBlocks);
    const [selectedId, setSelectedId] = useState(initialBlocks[0]?.id ?? null);
    const [saveState, setSaveState] = useState('saved');
    const [savedAt, setSavedAt] = useState(null);
    const [saveError, setSaveError] = useState(null);
    const [previewMode, setPreviewMode] = useState('editor_guru');
    const [title, setTitle] = useState(module.title);
    const [status, setStatus] = useState(module.status);
    const [allowPractice, setAllowPractice] = useState(module.allow_practice ?? true);
    const [sequentialLock, setSequentialLock] = useState(module.sequential_lock ?? false);
    const [importing, setImporting] = useState(false);
    const [importNotice, setImportNotice] = useState(null);
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
    const pendingMeta = useRef(null);
    const [liveStarting, setLiveStarting] = useState(false);
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

    const saveBlockNow = useCallback(
        async (block) => {
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
        },
        [markError, markSaved, urls.blocks],
    );

    const scheduleSave = useCallback(
        (block) => {
            setSaveState('dirty');
            setSaveError(null);

            const existing = timers.current.get(block.id);
            if (existing) clearTimeout(existing.handle);

            const handle = setTimeout(() => {
                timers.current.delete(block.id);
                saveBlockNow(block);
            }, 750);

            timers.current.set(block.id, { handle, block });
        },
        [saveBlockNow],
    );

    // Jalankan semua autosave yang masih tertunda SEKARANG. Dipakai saat
    // halaman ditinggalkan agar ketikan terakhir guru tidak hilang diam-diam.
    const flushPendingSaves = useCallback(async () => {
        const pending = [...timers.current.values()];
        timers.current.clear();
        pending.forEach((entry) => clearTimeout(entry.handle));

        if (pending.length > 0) {
            await Promise.allSettled(pending.map((entry) => saveBlockNow(entry.block)));
        }

        if (metaTimer.current) {
            clearTimeout(metaTimer.current);
            metaTimer.current = null;
        }

        if (pendingMeta.current) {
            const patch = pendingMeta.current;
            pendingMeta.current = null;
            setSaveState('saving');

            try {
                const payload = await apiRequest(urls.update, 'PATCH', patch);
                markSaved(payload.saved_at);
            } catch (error) {
                markError(error);
            }
        }
    }, [markError, markSaved, saveBlockNow, urls.update]);

    useEffect(() => {
        return () => {
            // Unmount: flush, JANGAN sekadar membatalkan timer.
            flushPendingSaves();
        };
    }, [flushPendingSaves]);

    useEffect(() => {
        function warnBeforeUnload(event) {
            if (timers.current.size > 0 || pendingMeta.current) {
                event.preventDefault();
                event.returnValue = '';
            }
        }

        window.addEventListener('beforeunload', warnBeforeUnload);
        return () => window.removeEventListener('beforeunload', warnBeforeUnload);
    }, []);

    useEffect(() => {
        if (!urls.ai_status) return undefined;

        if (!['queued', 'generating'].includes(aiStatus)) return undefined;

        let cancelled = false;
        let timer = null;
        let failures = 0;

        async function poll() {
            try {
                const payload = await apiRequest(urls.ai_status, 'GET');

                if (cancelled) return;

                const next = payload.ai_status ?? null;
                setAiStatus(next);
                setAiError(payload.ai_error ?? null);

                if (next === 'completed') {
                    // Batalkan autosave tertunda dulu: PATCH basi tidak boleh
                    // menimpa blok hasil AI yang baru tiba.
                    timers.current.forEach((entry) => clearTimeout(entry.handle));
                    timers.current.clear();

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

                failures += 1;
                const sessionGone = [401, 403, 419].includes(error.status);

                if (sessionGone || failures >= 3) {
                    setAiError(
                        sessionGone
                            ? 'Sesi login berakhir. Muat ulang halaman untuk melanjutkan.'
                            : 'Tidak dapat memeriksa status AI setelah beberapa kali percobaan. Muat ulang halaman untuk mengecek lagi.',
                    );
                    return;
                }

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

    async function handleImportFile(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setImporting(true);
        setImportNotice(null);

        try {
            const form = new FormData();
            form.append('file', file);

            const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
            const response = await fetch(urls.blocks_import, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': token,
                },
                body: form,
            });

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                const firstError = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
                throw new Error(firstError || payload?.message || 'Gagal mengimpor soal.');
            }

            setBlocks((current) => [...current, ...payload.blocks]);
            if (payload.blocks?.length) setSelectedId(payload.blocks[0].id);
            markSaved(payload.saved_at);
            setImportNotice({
                ok: true,
                text: `${payload.imported} soal berhasil diimpor${payload.skipped ? `, ${payload.skipped} dilewati` : ''}. Periksa kunci jawaban tiap soal sebelum menerbitkan modul.`,
            });
        } catch (error) {
            setImportNotice({ ok: false, text: error.message || 'Gagal mengimpor soal.' });
        } finally {
            setImporting(false);
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

    async function duplicateBlock(source) {
        setSaveError(null);
        setSaveState('saving');

        try {
            const payload = await apiRequest(urls.blocks, 'POST', {
                block_type: source.block_type,
                points: Number(source.points) || 0,
                content: source.content ?? {},
                ai_rubric: source.ai_rubric ?? null,
            });

            const current = blocksRef.current;
            const index = current.findIndex((block) => block.id === source.id);
            const next = [...current];
            next.splice(index < 0 ? next.length : index + 1, 0, payload.block);
            setSelectedId(payload.block.id);

            // Blok baru dibuat di akhir oleh server; susun ulang agar persis
            // berada di bawah blok asal (rollback ditangani persistOrder).
            persistOrder(next);
        } catch (error) {
            markError(error);
        }
    }

    async function deleteBlock(id) {
        if (!window.confirm('Hapus blok ini? Tindakan tidak dapat dibatalkan.')) return;

        const snapshot = blocks;
        const previousSelected = selectedId;
        const remaining = blocks.filter((block) => block.id !== id);
        const pending = timers.current.get(id);
        if (pending) {
            clearTimeout(pending.handle);
            timers.current.delete(id);
        }
        setBlocks(remaining);
        if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
        setSaveState('saving');

        try {
            const payload = await apiRequest(`${urls.blocks}/${id}`, 'DELETE');
            markSaved(payload.saved_at);
        } catch (error) {
            // Gagal di server: kembalikan blok ke tampilan agar tidak menyimpang.
            setBlocks(snapshot);
            setSelectedId(previousSelected);
            markError(error);
        }
    }

    async function persistOrder(nextBlocks) {
        const snapshot = blocksRef.current;
        setBlocks(nextBlocks);
        setSaveState('saving');

        try {
            const payload = await apiRequest(urls.reorder, 'PATCH', {
                ids: nextBlocks.map((block) => block.id),
            });
            markSaved(payload.saved_at);
        } catch (error) {
            setBlocks(snapshot);
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
        pendingMeta.current = { ...(pendingMeta.current ?? {}), ...patch };
        if (metaTimer.current) clearTimeout(metaTimer.current);

        metaTimer.current = setTimeout(async () => {
            metaTimer.current = null;
            const pendingPatch = pendingMeta.current;
            pendingMeta.current = null;
            if (!pendingPatch) return;

            setSaveState('saving');
            try {
                const payload = await apiRequest(urls.update, 'PATCH', pendingPatch);
                markSaved(payload.saved_at);
            } catch (error) {
                markError(error);
            }
        }, 800);
    }

    async function toggleStatus() {
        const previous = status;
        const next = status === 'published' ? 'draft' : 'published';
        setStatus(next);
        setSaveState('saving');

        try {
            const payload = await apiRequest(urls.update, 'PATCH', {
                status: next,
                title: titleRef.current,
            });
            markSaved(payload.saved_at);
        } catch (error) {
            // Status di server tidak berubah: kembalikan label ke keadaan semula.
            setStatus(previous);
            markError(error);
        }
    }

    async function toggleAllowPractice() {
        const previous = allowPractice;
        const next = !allowPractice;
        setAllowPractice(next);
        setSaveState('saving');

        try {
            const payload = await apiRequest(urls.update, 'PATCH', { allow_practice: next });
            markSaved(payload.saved_at);
        } catch (error) {
            setAllowPractice(previous);
            markError(error);
        }
    }

    async function toggleSequentialLock() {
        const previous = sequentialLock;
        const next = !sequentialLock;
        setSequentialLock(next);
        setSaveState('saving');

        try {
            const payload = await apiRequest(urls.update, 'PATCH', { sequential_lock: next });
            markSaved(payload.saved_at);
        } catch (error) {
            setSequentialLock(previous);
            markError(error);
        }
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

                    {urls.submissions && (
                        <Link
                            href={urls.submissions}
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                            title="Lihat dan nilai pengumpulan blok Tugas Unggah pada modul ini"
                        >
                            Pengumpulan Tugas
                        </Link>
                    )}

                    {urls.work && (
                        <Link
                            href={urls.work}
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                            title="Lihat semua pekerjaan siswa pada modul ini (live, mandiri, tugas) dan nilai esai yang menunggu"
                        >
                            Pekerjaan Siswa
                        </Link>
                    )}

                    {live?.stage_url ? (
                        <>
                            <Link
                                href={live.stage_url}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                                Buka Panggung (sedang live)
                            </Link>
                            <button
                                type="button"
                                disabled={liveStarting}
                                onClick={() => {
                                    if (
                                        !window.confirm(
                                            'Sesi live yang sedang berjalan akan DI AKHIRI dan diganti sesi baru. Semua siswa terputus dan PIN berubah. Lanjutkan?',
                                        )
                                    ) {
                                        return;
                                    }
                                    setLiveStarting(true);
                                    router.post(`/teacher/modules/${module.id}/live`, {}, {
                                        onFinish: () => setLiveStarting(false),
                                    });
                                }}
                                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {liveStarting ? 'Memulai...' : 'Mulai Sesi Baru'}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setLiveStarting(true);
                                router.post(`/teacher/modules/${module.id}/live`, {}, {
                                    onFinish: () => setLiveStarting(false),
                                });
                            }}
                            disabled={blocks.length === 0 || liveStarting}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            title={blocks.length === 0 ? 'Tambahkan minimal satu blok dulu' : 'Buka panggung proyektor'}
                        >
                            {liveStarting ? 'Memulai...' : 'Panggung Live'}
                        </button>
                    )}

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

                    <button
                        type="button"
                        onClick={toggleAllowPractice}
                        role="switch"
                        aria-checked={allowPractice}
                        title="Izinkan siswa membuka modul ini di halaman Belajar Mandiri"
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                            allowPractice
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                        }`}
                    >
                        <span
                            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                                allowPractice ? 'bg-emerald-500' : 'bg-zinc-300'
                            }`}
                        >
                            <span
                                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                                    allowPractice ? 'left-3.5' : 'left-0.5'
                                }`}
                            />
                        </span>
                        Belajar Mandiri {allowPractice ? 'Aktif' : 'Nonaktif'}
                    </button>

                    <button
                        type="button"
                        onClick={toggleSequentialLock}
                        role="switch"
                        aria-checked={sequentialLock}
                        title="Di Belajar Mandiri, blok berikutnya terkunci sampai blok sebelumnya selesai dikerjakan siswa"
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                            sequentialLock
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                        }`}
                    >
                        <span
                            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                                sequentialLock ? 'bg-emerald-500' : 'bg-zinc-300'
                            }`}
                        >
                            <span
                                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                                    sequentialLock ? 'left-3.5' : 'left-0.5'
                                }`}
                            />
                        </span>
                        Kunci Berurutan {sequentialLock ? 'Aktif' : 'Nonaktif'}
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

                        <div className="mt-3 border-t border-zinc-100 pt-3">
                            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Impor Soal
                            </h3>
                            <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
                                Unggah berkas Word (.docx) atau .rtf berisi soal sesuai format template —
                                soal yang dikenali menjadi blok baru di akhir modul.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <label
                                    className={`inline-block rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 ${
                                        importing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                                    }`}
                                >
                                    {importing ? 'Mengimpor...' : 'Unggah .docx / .rtf'}
                                    <input
                                        type="file"
                                        accept=".docx,.rtf"
                                        className="hidden"
                                        disabled={importing}
                                        onChange={handleImportFile}
                                    />
                                </label>
                                <a
                                    href={urls.blocks_import_template}
                                    className="text-xs font-medium text-emerald-700 underline hover:text-emerald-800"
                                >
                                    Unduh template
                                </a>
                            </div>
                            {importNotice && (
                                <p
                                    className={`mt-2 rounded-lg border px-2.5 py-1.5 text-[11px] leading-relaxed ${
                                        importNotice.ok
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                            : 'border-red-200 bg-red-50 text-red-700'
                                    }`}
                                >
                                    {importNotice.text}
                                </p>
                            )}
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
                                    onDuplicate={() => duplicateBlock(block)}
                                    onMove={moveBlock}
                                    onSlidesImported={importSlidesToBlocks}
                                    uploadUrl={urls.slides}
                                    assetUploadUrl={urls.upload}
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
                        AI menyusun judul bagian, materi teks, soal pilihan ganda, benar/salah, isian
                        singkat, urutan prosedur, polling, dan esai beserta rubrik rahasia. Periksa kembali
                        fakta teknis dan kesesuaian SOP sebelum menerbitkan modul.
                    </div>
                </div>
            </Modal>
        </TeacherLayout>
    );
}
