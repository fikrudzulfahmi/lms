import { useRef, useState } from 'react';
import { Button, Field, inputClass, selectClass } from '@/Components/ui';
import { BLOCK_LABELS } from '@/Components/DynamicBlockRenderer';
import PdfSlideImporter from '@/Components/studio/PdfSlideImporter';

const NEW_TYPES = [
    'section_heading',
    'materi_richtext',
    'materi_video',
    'materi_file',
    'materi_embed',
    'soal_truefalse',
    'soal_fillblank',
    'soal_hotspot',
    'materi_video_interaktif',
    'polling',
    'praktik_checklist',
    'tugas_upload',
];

function truncateText(value, max = 90) {
    const text = String(value ?? '').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatBytes(size) {
    const bytes = Number(size) || 0;
    if (bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, '')} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

/** Ringkasan satu baris isi blok untuk kartu blok di kanvas editor. */
function contentSummary(type, content) {
    switch (type) {
        case 'section_heading':
            return truncateText(content.title);
        case 'materi_richtext':
            return truncateText(String(content.body ?? '').replace(/[*#[\]()]/g, '').split('\n')[0]);
        case 'materi_video':
            return truncateText(content.url);
        case 'materi_file':
            return `${(content.files ?? []).length} berkas terlampir`;
        case 'materi_embed':
            return truncateText(content.url);
        case 'soal_truefalse':
        case 'soal_fillblank':
        case 'soal_hotspot':
            return truncateText(content.question);
        case 'materi_video_interaktif':
            return truncateText(content.url);
        case 'polling':
            return truncateText(content.question);
        case 'praktik_checklist':
            return `${(content.steps ?? []).length} langkah · ${truncateText(content.title)}`;
        case 'tugas_upload':
            return `${(content.rubric ?? []).length} kriteria rubrik · ${truncateText(content.title)}`;
        default:
            return '';
    }
}

function IconButton({ label, onClick, disabled = false, children, danger = false }) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={`rounded-md border px-1.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                danger
                    ? 'border-red-200 bg-white text-red-600 hover:bg-red-50'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700'
            }`}
        >
            {children}
        </button>
    );
}

function RepeaterRow({ children, onRemove, canRemove = true, label }) {
    return (
        <div className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-2.5">
            <div className="flex-1 space-y-2">{children}</div>
            <IconButton label={`Hapus ${label}`} onClick={onRemove} disabled={!canRemove} danger>
                ✕
            </IconButton>
        </div>
    );
}

export default function BlockEditor({
    block,
    onChange,
    onDelete,
    onDuplicate,
    onSaveToBank,
    onMove,
    onSlidesImported,
    uploadUrl,
    assetUploadUrl,
    csrfToken,
    index,
    total,
}) {
    const content = block.content ?? {};
    const type = block.block_type;
    const [slideSource, setSlideSource] = useState(
        content.url || (content.images ?? []).length > 0 ? 'manual' : 'pdf',
    );
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const richTextRef = useRef(null);
    const richImageInputRef = useRef(null);

    async function uploadAsset(file) {
        const form = new FormData();
        form.append('file', file);

        const response = await fetch(assetUploadUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': csrfToken ?? '',
            },
            body: form,
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            const firstError = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
            throw new Error(firstError || payload?.message || `Gagal mengunggah (${response.status}).`);
        }

        return payload;
    }

    async function handleVideoUpload(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setUploading(true);
        setUploadError(null);

        try {
            const payload = await uploadAsset(file);
            setContent({ url: payload.url, source: 'upload' });
        } catch (error) {
            setUploadError(error.message || 'Gagal mengunggah video.');
        } finally {
            setUploading(false);
        }
    }

    async function handleFilesUpload(event) {
        const files = [...(event.target.files ?? [])];
        event.target.value = '';
        if (files.length === 0) return;

        setUploading(true);
        setUploadError(null);

        try {
            const uploaded = [];
            for (const file of files) {
                const payload = await uploadAsset(file);
                uploaded.push({ name: payload.name, url: payload.url, size: payload.size });
            }
            setContent({ files: [...(content.files ?? []), ...uploaded] });
        } catch (error) {
            setUploadError(error.message || 'Gagal mengunggah berkas.');
        } finally {
            setUploading(false);
        }
    }

    /** Sisipkan markup markdown ringan di posisi kursor/seleksi textarea Teks Kaya. */
    function wrapRichSelection(before, after = before) {
        const element = richTextRef.current;
        const value = content.body ?? '';

        if (!element) {
            setContent({ body: `${value}${before}teks${after}` });
            return;
        }

        const start = element.selectionStart ?? value.length;
        const end = element.selectionEnd ?? value.length;
        const selected = value.slice(start, end) || 'teks';
        const next = value.slice(0, start) + before + selected + after + value.slice(end);
        setContent({ body: next });

        requestAnimationFrame(() => {
            element.focus();
            element.setSelectionRange(start + before.length, start + before.length + selected.length);
        });
    }

    /** Awali setiap baris terseleksi dengan awalan (mis. "## " atau "> "). */
    function prefixRichLines(prefix) {
        const element = richTextRef.current;
        const value = content.body ?? '';

        if (!element || element.selectionStart === element.selectionEnd) {
            setContent({ body: `${value}${value && !value.endsWith('\n') ? '\n' : ''}${prefix}` });
            return;
        }

        const start = element.selectionStart;
        const end = element.selectionEnd;
        const selected = value.slice(start, end);
        const prefixed = selected
            .split('\n')
            .map((line) => (line.trim() ? `${prefix}${line}` : line))
            .join('\n');
        setContent({ body: value.slice(0, start) + prefixed + value.slice(end) });
    }

    function insertRichNumberedList() {
        const element = richTextRef.current;
        const value = content.body ?? '';

        if (!element || element.selectionStart === element.selectionEnd) {
            setContent({ body: `${value}${value && !value.endsWith('\n') ? '\n' : ''}1. Poin baru` });
            return;
        }

        const start = element.selectionStart;
        const end = element.selectionEnd;
        const selected = value.slice(start, end);
        let counter = 0;
        const listed = selected
            .split('\n')
            .map((line) => (line.trim() ? `${++counter}. ${line.replace(/^\d+\.\s*/, '')}` : line))
            .join('\n');
        setContent({ body: value.slice(0, start) + listed + value.slice(end) });
    }

    /** Unggah gambar lalu sisipkan ![nama](url) sebagai paragraf sendiri di posisi kursor. */
    async function handleRichImageUpload(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setUploading(true);
        setUploadError(null);

        try {
            const payload = await uploadAsset(file);
            const element = richTextRef.current;
            const value = content.body ?? '';
            const alt = (payload.name ?? 'Gambar').replace(/\.[^.]+$/, '');
            const snippet = `![${alt}](${payload.url})`;

            if (!element) {
                setContent({ body: `${value}${value ? '\n\n' : ''}${snippet}` });
                return;
            }

            const cursor = element.selectionStart ?? value.length;
            const before = value.slice(0, cursor);
            const after = value.slice(cursor);
            const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
            const trail = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
            setContent({ body: `${before}${lead}${snippet}${trail}${after}` });
        } catch (error) {
            setUploadError(error.message || 'Gagal mengunggah gambar.');
        } finally {
            setUploading(false);
        }
    }

    function insertRichList() {
        const element = richTextRef.current;
        const value = content.body ?? '';

        if (!element || element.selectionStart === element.selectionEnd) {
            setContent({ body: `${value}${value && !value.endsWith('\n') ? '\n' : ''}- Poin baru` });
            return;
        }

        const start = element.selectionStart;
        const end = element.selectionEnd;
        const selected = value.slice(start, end);
        const listed = selected
            .split('\n')
            .map((line) => (line.trim() ? `- ${line.replace(/^-\s*/, '')}` : line))
            .join('\n');
        setContent({ body: value.slice(0, start) + listed + value.slice(end) });
    }

    async function handleAssetUploadField(event, field) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setUploading(true);
        setUploadError(null);

        try {
            const payload = await uploadAsset(file);
            setContent({ [field]: payload.url });
        } catch (error) {
            setUploadError(error.message || 'Gagal mengunggah berkas.');
        } finally {
            setUploading(false);
        }
    }

    /** Toolbar format untuk textarea materi (Teks Kaya & Materi Teks). */
    function renderRichToolbar() {
        return (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
                {[
                    { label: 'B Tebal', action: () => wrapRichSelection('**') },
                    { label: 'I Miring', action: () => wrapRichSelection('*') },
                    { label: 'H Subjudul', action: () => prefixRichLines('## ') },
                    { label: '• Daftar', action: insertRichList },
                    { label: '1. Daftar Nomor', action: insertRichNumberedList },
                    { label: '❝ Kutipan', action: () => prefixRichLines('> ') },
                    { label: '🔗 Tautan', action: () => wrapRichSelection('[', '](https://)') },
                ].map((tool) => (
                    <button
                        key={tool.label}
                        type="button"
                        onClick={tool.action}
                        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                    >
                        {tool.label}
                    </button>
                ))}
                <button
                    type="button"
                    disabled={uploading}
                    onClick={() => richImageInputRef.current?.click()}
                    className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {uploading ? 'Mengunggah…' : '🖼 Sisipkan Gambar'}
                </button>
                <input
                    ref={richImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={handleRichImageUpload}
                />
            </div>
        );
    }

    const hotspotBoxRef = useRef(null);
    const [hotspotDragIndex, setHotspotDragIndex] = useState(null);

    function hotspotPointFromEvent(event) {
        const box = hotspotBoxRef.current;
        if (!box) return null;

        const rect = box.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;

        const clamp = (value) => Math.min(100, Math.max(0, value));

        return {
            x: Math.round(clamp(((event.clientX - rect.left) / rect.width) * 100) * 10) / 10,
            y: Math.round(clamp(((event.clientY - rect.top) / rect.height) * 100) * 10) / 10,
        };
    }

    function handleHotspotBoxClick(event) {
        const point = hotspotPointFromEvent(event);
        if (!point) return;

        const spots = content.spots ?? [];
        if (spots.length >= 20) return;

        setContent({ spots: [...spots, { ...point, label: `Titik ${spots.length + 1}` }] });
    }

    const setCheckpointOption = (checkpointIndex, optionIndex, patch) => {
        const checkpoints = [...(content.checkpoints ?? [])];
        const options = [...(checkpoints[checkpointIndex]?.options ?? [])];
        options[optionIndex] = { ...options[optionIndex], ...patch };
        checkpoints[checkpointIndex] = { ...checkpoints[checkpointIndex], options };
        setContent({ checkpoints });
    };

    const setContent = (patch) => onChange({ content: { ...content, ...patch } });
    const setArrayItem = (key, itemIndex, patch) => {
        const list = Array.isArray(content[key]) ? [...content[key]] : [];
        list[itemIndex] = { ...list[itemIndex], ...patch };
        setContent({ [key]: list });
    };
    const addItem = (key, item) => {
        const list = Array.isArray(content[key]) ? [...content[key]] : [];
        setContent({ [key]: [...list, item] });
    };
    const removeItem = (key, itemIndex) => {
        const list = Array.isArray(content[key]) ? [...content[key]] : [];
        setContent({ [key]: list.filter((_, position) => position !== itemIndex) });
    };

    return (
        <div className="rounded-xl border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 rounded-t-xl border-b border-zinc-100 bg-zinc-50 px-3 py-2">
                <span className="font-mono text-[11px] text-zinc-400">
                    {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-xs font-semibold text-zinc-800">{BLOCK_LABELS[type] ?? type}</span>

                <div className="ml-auto flex items-center gap-2">
                    {(type.startsWith('soal_') || type === 'materi_video_interaktif' || type === 'tugas_upload') && (
                        <label className="flex items-center gap-1 text-[11px] text-zinc-500">
                            Poin
                            <input
                                type="number"
                                min="1"
                                max="1000"
                                value={block.points ?? 0}
                                onChange={(event) => onChange({ points: Number(event.target.value) })}
                                className="w-16 rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-right font-mono text-xs text-zinc-900 focus:border-emerald-500 focus:outline-none"
                            />
                        </label>
                    )}
                    <IconButton
                        label="Naikkan blok"
                        onClick={() => onMove(index, -1)}
                        disabled={index === 0}
                    >
                        ↑
                    </IconButton>
                    <IconButton
                        label="Turunkan blok"
                        onClick={() => onMove(index, 1)}
                        disabled={index === total - 1}
                    >
                        ↓
                    </IconButton>
                    {onDuplicate && (
                        <IconButton label="Duplikat blok" onClick={onDuplicate}>
                            Duplikat
                        </IconButton>
                    )}
                    {onSaveToBank && (type.startsWith('soal_') || type === 'polling') && (
                        <IconButton label="Simpan soal ini ke Bank Soal untuk dipakai ulang" onClick={onSaveToBank}>
                            Ke Bank Soal
                        </IconButton>
                    )}
                    <IconButton label="Hapus blok" onClick={onDelete} danger>
                        Hapus
                    </IconButton>
                </div>
            </div>

            <div className="space-y-3 px-4 py-4">
                {NEW_TYPES.includes(type) && contentSummary(type, content) && (
                    <p className="truncate rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                            Ringkasan ·{' '}
                        </span>
                        {contentSummary(type, content)}
                    </p>
                )}

                {uploadError && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {uploadError}
                    </p>
                )}

                {type === 'section_heading' && (
                    <>
                        <Field label="Judul bagian">
                            <input
                                value={content.title ?? ''}
                                onChange={(event) => setContent({ title: event.target.value })}
                                className={inputClass}
                                placeholder="Contoh: Pengenalan Sistem PGM-FI"
                            />
                        </Field>
                        <Field label="Deskripsi singkat (opsional)">
                            <textarea
                                rows={2}
                                value={content.body ?? ''}
                                onChange={(event) => setContent({ body: event.target.value })}
                                className={inputClass}
                                placeholder="Satu-dua kalimat pembuka bagian ini."
                            />
                        </Field>
                    </>
                )}

                {type === 'materi_richtext' && (
                    <>
                        <Field label="Judul (opsional)">
                            <input
                                value={content.title ?? ''}
                                onChange={(event) => setContent({ title: event.target.value })}
                                className={inputClass}
                                placeholder="Judul teks materi"
                            />
                        </Field>
                        <Field
                            label="Isi materi"
                            hint="Pakai tombol format di bawah: tebal, miring, subjudul, daftar, kutipan, tautan, dan sisipkan gambar di antara paragraf. Baris kosong = paragraf baru."
                        >
                            {renderRichToolbar()}
                            <textarea
                                ref={richTextRef}
                                rows={10}
                                value={content.body ?? ''}
                                onChange={(event) => setContent({ body: event.target.value })}
                                className={inputClass}
                                placeholder={'Tulis materi...\n\nContoh: **istilah penting**, *penekanan*, daftar:\n- poin satu\n- poin dua'}
                            />
                        </Field>
                    </>
                )}

                {type === 'materi_video' && (
                    <>
                        <Field label="Judul (opsional)">
                            <input
                                value={content.title ?? ''}
                                onChange={(event) => setContent({ title: event.target.value })}
                                className={inputClass}
                                placeholder="Judul video"
                            />
                        </Field>
                        <Field label="Sumber video">
                            <select
                                value={content.source ?? 'youtube'}
                                onChange={(event) => setContent({ source: event.target.value })}
                                className={selectClass}
                            >
                                <option value="youtube">YouTube</option>
                                <option value="url">Tautan berkas video</option>
                                <option value="upload">Unggah berkas</option>
                            </select>
                        </Field>
                        {(content.source ?? 'youtube') !== 'upload' && (
                            <Field
                                label="URL video"
                                hint={
                                    (content.source ?? 'youtube') === 'youtube'
                                        ? 'Tempel tautan YouTube (watch, youtu.be, shorts, atau embed).'
                                        : 'Tautan langsung ke berkas video (mp4/webm) atau path /storage/...'
                                }
                            >
                                <input
                                    value={content.url ?? ''}
                                    onChange={(event) => setContent({ url: event.target.value })}
                                    className={inputClass}
                                    placeholder="https://www.youtube.com/watch?v=..."
                                />
                            </Field>
                        )}
                        {(content.source ?? 'youtube') === 'upload' && (
                            <Field label="Berkas video" hint="MP4/WebM/MOV, maksimal 50 MB.">
                                <div className="flex flex-wrap items-center gap-2">
                                    <label
                                        className={`rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 ${
                                            uploading || !assetUploadUrl
                                                ? 'cursor-not-allowed opacity-50'
                                                : 'cursor-pointer'
                                        }`}
                                    >
                                        {uploading ? 'Mengunggah...' : 'Pilih berkas video'}
                                        <input
                                            type="file"
                                            accept="video/*,.mp4,.webm,.mov"
                                            className="hidden"
                                            disabled={uploading || !assetUploadUrl}
                                            onChange={handleVideoUpload}
                                        />
                                    </label>
                                    {content.url && (
                                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-500">
                                            {content.url.split('/').pop()}
                                        </span>
                                    )}
                                </div>
                            </Field>
                        )}
                        <Field label="Keterangan (opsional)">
                            <input
                                value={content.caption ?? ''}
                                onChange={(event) => setContent({ caption: event.target.value })}
                                className={inputClass}
                                placeholder="Keterangan singkat di bawah video"
                            />
                        </Field>
                    </>
                )}

                {type === 'materi_file' && (
                    <>
                        <Field label="Judul (opsional)">
                            <input
                                value={content.title ?? ''}
                                onChange={(event) => setContent({ title: event.target.value })}
                                className={inputClass}
                                placeholder="Contoh: Berkas pendukung praktik"
                            />
                        </Field>
                        <div className="space-y-2">
                            {(content.files ?? []).map((file, fileIndex) => (
                                <div
                                    key={`${file.url}-${fileIndex}`}
                                    className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2.5"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-zinc-800">
                                            {file.name || 'Berkas'}
                                        </span>
                                        {formatBytes(file.size) && (
                                            <span className="font-mono text-[11px] text-zinc-400">
                                                {formatBytes(file.size)}
                                            </span>
                                        )}
                                    </span>
                                    <IconButton
                                        label="Hapus berkas"
                                        onClick={() => removeItem('files', fileIndex)}
                                        danger
                                    >
                                        ✕
                                    </IconButton>
                                </div>
                            ))}
                            {(content.files ?? []).length === 0 && (
                                <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-400">
                                    Belum ada berkas. Unggah minimal satu berkas.
                                </p>
                            )}
                        </div>
                        <label
                            className={`inline-block rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 ${
                                uploading || !assetUploadUrl ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                            }`}
                        >
                            {uploading ? 'Mengunggah...' : 'Unggah berkas'}
                            <input
                                type="file"
                                multiple
                                className="hidden"
                                disabled={uploading || !assetUploadUrl}
                                onChange={handleFilesUpload}
                            />
                        </label>
                    </>
                )}

                {type === 'materi_embed' && (
                    <>
                        <Field label="Judul (opsional)">
                            <input
                                value={content.title ?? ''}
                                onChange={(event) => setContent({ title: event.target.value })}
                                className={inputClass}
                                placeholder="Judul tautan"
                            />
                        </Field>
                        <Field label="URL" hint="Diawali http:// atau https://.">
                            <input
                                value={content.url ?? ''}
                                onChange={(event) => setContent({ url: event.target.value })}
                                className={inputClass}
                                placeholder="https://..."
                            />
                        </Field>
                        <label className="flex items-start gap-2 text-sm text-zinc-700">
                            <input
                                type="checkbox"
                                checked={Boolean(content.embed)}
                                onChange={(event) => setContent({ embed: event.target.checked })}
                                className="mt-0.5 accent-emerald-600"
                            />
                            <span>
                                Tampilkan tersemat di halaman (embed)
                                <span className="block text-xs text-zinc-400">
                                    Sebagian situs menolak disematkan; tautan &quot;Buka di tab baru&quot; tetap
                                    selalu disediakan untuk siswa.
                                </span>
                            </span>
                        </label>
                        <Field label="Keterangan (opsional)">
                            <input
                                value={content.caption ?? ''}
                                onChange={(event) => setContent({ caption: event.target.value })}
                                className={inputClass}
                                placeholder="Keterangan singkat"
                            />
                        </Field>
                    </>
                )}

                {type === 'materi_teks' && (
                    <>
                        <Field label="Judul materi">
                            <input
                                value={content.title ?? ''}
                                onChange={(event) => setContent({ title: event.target.value })}
                                className={inputClass}
                                placeholder="Contoh: Gejala Kerusakan Sensor PGM-FI"
                            />
                        </Field>
                        <Field
                            label="Isi materi"
                            hint="Bisa diformat dengan tombol di bawah dan disisipi gambar di antara paragraf. Baris kosong = paragraf baru."
                        >
                            {renderRichToolbar()}
                            <textarea
                                ref={richTextRef}
                                rows={7}
                                value={content.body ?? ''}
                                onChange={(event) => setContent({ body: event.target.value })}
                                className={inputClass}
                                placeholder="Tulis penjelasan materi..."
                            />
                        </Field>
                    </>
                )}

                {type === 'materi_accordion' && (
                    <>
                        <Field label="Judul accordion">
                            <input
                                value={content.title ?? ''}
                                onChange={(event) => setContent({ title: event.target.value })}
                                className={inputClass}
                                placeholder="Judul bagian SOP"
                            />
                        </Field>
                        <div className="space-y-2">
                            {(content.items ?? []).map((item, itemIndex) => (
                                <RepeaterRow
                                    key={itemIndex}
                                    label="item SOP"
                                    onRemove={() => removeItem('items', itemIndex)}
                                    canRemove={(content.items ?? []).length > 1}
                                >
                                    <input
                                        value={item.label ?? ''}
                                        onChange={(event) =>
                                            setArrayItem('items', itemIndex, { label: event.target.value })
                                        }
                                        className={inputClass}
                                        placeholder="Label langkah"
                                    />
                                    <textarea
                                        rows={2}
                                        value={item.text ?? ''}
                                        onChange={(event) =>
                                            setArrayItem('items', itemIndex, { text: event.target.value })
                                        }
                                        className={inputClass}
                                        placeholder="Penjelasan langkah"
                                    />
                                </RepeaterRow>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addItem('items', { label: '', text: '' })}
                        >
                            + Tambah langkah
                        </Button>
                    </>
                )}

                {type === 'materi_flashcard' && (
                    <>
                        <Field label="Judul flashcard">
                            <input
                                value={content.title ?? ''}
                                onChange={(event) => setContent({ title: event.target.value })}
                                className={inputClass}
                                placeholder="Judul kumpulan kartu"
                            />
                        </Field>
                        <div className="space-y-2">
                            {(content.cards ?? []).map((card, cardIndex) => (
                                <RepeaterRow
                                    key={cardIndex}
                                    label="kartu"
                                    onRemove={() => removeItem('cards', cardIndex)}
                                    canRemove={(content.cards ?? []).length > 2}
                                >
                                    <input
                                        value={card.front ?? ''}
                                        onChange={(event) =>
                                            setArrayItem('cards', cardIndex, { front: event.target.value })
                                        }
                                        className={inputClass}
                                        placeholder="Sisi depan (istilah)"
                                    />
                                    <textarea
                                        rows={2}
                                        value={card.back ?? ''}
                                        onChange={(event) =>
                                            setArrayItem('cards', cardIndex, { back: event.target.value })
                                        }
                                        className={inputClass}
                                        placeholder="Sisi belakang (penjelasan)"
                                    />
                                </RepeaterRow>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addItem('cards', { front: '', back: '' })}
                        >
                            + Tambah kartu
                        </Button>
                    </>
                )}

                {type === 'slide_image' && (
                    <>
                        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
                            {[
                                { key: 'pdf', label: 'Import PDF' },
                                { key: 'manual', label: 'URL manual' },
                            ].map((tab) => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setSlideSource(tab.key)}
                                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                                        slideSource === tab.key
                                            ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200'
                                            : 'text-zinc-500 hover:text-zinc-800'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {slideSource === 'pdf' && (
                            <div className="space-y-1.5">
                                <PdfSlideImporter
                                    endpoint={uploadUrl}
                                    csrfToken={csrfToken}
                                    onImported={(slides, meta) => onSlidesImported?.(slides, meta, block.id)}
                                    disabled={!uploadUrl}
                                />
                                <p className="text-[11px] leading-relaxed text-zinc-500">
                                    Setiap halaman PDF dirender di browser menjadi gambar WebP, lalu otomatis
                                    menjadi blok <span className="font-mono">slide_image</span> per halaman.
                                </p>
                            </div>
                        )}

                        {slideSource === 'manual' && (
                            <>
                                <Field label="URL gambar slide" hint="Boleh URL eksternal atau path /storage/modules/...">
                                    <input
                                        value={content.url ?? ''}
                                        onChange={(event) => setContent({ url: event.target.value })}
                                        className={inputClass}
                                        placeholder="https://... atau /storage/modules/.../slide-01.webp"
                                    />
                                </Field>
                                {(content.images ?? []).length > 0 && (
                                    <p className="font-mono text-[11px] text-zinc-500">
                                        Galeri: {content.images.length} gambar
                                    </p>
                                )}
                                <Field label="Keterangan (opsional)">
                                    <input
                                        value={content.caption ?? ''}
                                        onChange={(event) => setContent({ caption: event.target.value })}
                                        className={inputClass}
                                        placeholder="Keterangan singkat slide"
                                    />
                                </Field>
                            </>
                        )}
                    </>
                )}

                {type === 'soal_mcq' && (
                    <>
                        <Field label="Pertanyaan">
                            <textarea
                                rows={3}
                                value={content.question ?? ''}
                                onChange={(event) => setContent({ question: event.target.value })}
                                className={inputClass}
                                placeholder="Tulis pertanyaan pilihan ganda..."
                            />
                        </Field>
                        <div className="space-y-2">
                            {(content.options ?? []).map((option, optionIndex) => (
                                <div
                                    key={optionIndex}
                                    className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-2.5"
                                >
                                    <label className="flex shrink-0 items-center gap-1.5 pt-2 text-[11px] text-zinc-500">
                                        <input
                                            type="radio"
                                            name={`correct-${block.id}`}
                                            checked={Boolean(option.correct)}
                                            onChange={() => {
                                                const next = (content.options ?? []).map((item, position) => ({
                                                    ...item,
                                                    correct: position === optionIndex,
                                                }));
                                                setContent({ options: next });
                                            }}
                                            className="accent-emerald-600"
                                        />
                                        Kunci
                                    </label>
                                    <input
                                        value={option.text ?? ''}
                                        onChange={(event) =>
                                            setArrayItem('options', optionIndex, { text: event.target.value })
                                        }
                                        className={inputClass}
                                        placeholder={`Opsi ${String.fromCharCode(65 + optionIndex)}`}
                                    />
                                    <IconButton
                                        label="Hapus opsi"
                                        onClick={() => removeItem('options', optionIndex)}
                                        disabled={(content.options ?? []).length <= 2}
                                        danger
                                    >
                                        ✕
                                    </IconButton>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    addItem('options', { text: '', correct: false })
                                }
                                disabled={(content.options ?? []).length >= 10}
                            >
                                + Tambah opsi
                            </Button>
                        </div>
                        <Field label="Pembahasan (opsional)">
                            <textarea
                                rows={2}
                                value={content.explanation ?? ''}
                                onChange={(event) => setContent({ explanation: event.target.value })}
                                className={inputClass}
                                placeholder="Tampil setelah siswa menjawab."
                            />
                        </Field>
                    </>
                )}

                {type === 'soal_truefalse' && (
                    <>
                        <Field label="Pernyataan">
                            <textarea
                                rows={3}
                                value={content.question ?? ''}
                                onChange={(event) => setContent({ question: event.target.value })}
                                className={inputClass}
                                placeholder="Tulis pernyataan yang dinilai benar atau salah..."
                            />
                        </Field>
                        <Field label="Kunci jawaban">
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { value: true, label: '✓ Benar' },
                                    { value: false, label: '✕ Salah' },
                                ].map((option) => (
                                    <label
                                        key={String(option.value)}
                                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                                            content.answer === option.value
                                                ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                                                : 'border-zinc-200 bg-white text-zinc-600 hover:border-emerald-300'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name={`truefalse-${block.id}`}
                                            checked={content.answer === option.value}
                                            onChange={() => setContent({ answer: option.value })}
                                            className="accent-emerald-600"
                                        />
                                        {option.label}
                                    </label>
                                ))}
                            </div>
                        </Field>
                        <Field label="Pembahasan (opsional)">
                            <textarea
                                rows={2}
                                value={content.explanation ?? ''}
                                onChange={(event) => setContent({ explanation: event.target.value })}
                                className={inputClass}
                                placeholder="Tampil setelah siswa menjawab."
                            />
                        </Field>
                    </>
                )}

                {type === 'soal_fillblank' && (
                    <>
                        <Field
                            label="Soal"
                            hint="Tulis ___ (tiga garis bawah) untuk menandai titik isian pada soal."
                        >
                            <textarea
                                rows={3}
                                value={content.question ?? ''}
                                onChange={(event) => setContent({ question: event.target.value })}
                                className={inputClass}
                                placeholder="Contoh: Alat ukur tekanan bahan bakar disebut ___."
                            />
                        </Field>
                        <Field
                            label="Kunci jawaban yang diterima"
                            hint="Pemeriksaan tidak peka huruf besar/kecil dan spasi berlebih diabaikan. Tambahkan variasi ejaan yang masih diterima."
                        >
                            <div className="space-y-2">
                                {(content.answers ?? []).map((answer, answerIndex) => (
                                    <div key={answerIndex} className="flex items-start gap-2">
                                        <input
                                            value={answer}
                                            onChange={(event) => {
                                                const next = [...(content.answers ?? [])];
                                                next[answerIndex] = event.target.value;
                                                setContent({ answers: next });
                                            }}
                                            className={inputClass}
                                            placeholder={`Kunci ${answerIndex + 1}`}
                                        />
                                        <IconButton
                                            label="Hapus kunci"
                                            onClick={() =>
                                                setContent({
                                                    answers: (content.answers ?? []).filter(
                                                        (_, position) => position !== answerIndex,
                                                    ),
                                                })
                                            }
                                            disabled={(content.answers ?? []).length <= 1}
                                            danger
                                        >
                                            ✕
                                        </IconButton>
                                    </div>
                                ))}
                            </div>
                        </Field>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                setContent({ answers: [...(content.answers ?? []), ''] })
                            }
                            disabled={(content.answers ?? []).length >= 10}
                        >
                            + Tambah kunci
                        </Button>
                        <Field label="Pembahasan (opsional)">
                            <textarea
                                rows={2}
                                value={content.explanation ?? ''}
                                onChange={(event) => setContent({ explanation: event.target.value })}
                                className={inputClass}
                                placeholder="Tampil setelah siswa menjawab."
                            />
                        </Field>
                    </>
                )}

                {type === 'soal_sequencing' && (
                    <>
                        <Field label="Pertanyaan">
                            <textarea
                                rows={3}
                                value={content.question ?? ''}
                                onChange={(event) => setContent({ question: event.target.value })}
                                className={inputClass}
                                placeholder="Contoh: Urutkan prosedur pemeriksaan tekanan fuel pump."
                            />
                        </Field>
                        <div className="space-y-2">
                            {(content.steps ?? []).map((step, stepIndex) => (
                                <div key={stepIndex} className="flex items-start gap-2">
                                    <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-50 font-mono text-xs text-emerald-700">
                                        {String(stepIndex + 1).padStart(2, '0')}
                                    </span>
                                    <textarea
                                        rows={2}
                                        value={step}
                                        onChange={(event) => {
                                            const next = [...(content.steps ?? [])];
                                            next[stepIndex] = event.target.value;
                                            setContent({ steps: next });
                                        }}
                                        className={inputClass}
                                        placeholder="Langkah sesuai urutan benar"
                                    />
                                    <IconButton
                                        label="Hapus langkah"
                                        onClick={() => removeItem('steps', stepIndex)}
                                        disabled={(content.steps ?? []).length <= 2}
                                        danger
                                    >
                                        ✕
                                    </IconButton>
                                </div>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addItem('steps', '')}
                            disabled={(content.steps ?? []).length >= 20}
                        >
                            + Tambah langkah
                        </Button>
                        <Field label="Pembahasan (opsional)">
                            <textarea
                                rows={2}
                                value={content.explanation ?? ''}
                                onChange={(event) => setContent({ explanation: event.target.value })}
                                className={inputClass}
                            />
                        </Field>
                    </>
                )}

                {type === 'soal_matching' && (
                    <>
                        <Field label="Pertanyaan">
                            <textarea
                                rows={3}
                                value={content.question ?? ''}
                                onChange={(event) => setContent({ question: event.target.value })}
                                className={inputClass}
                                placeholder="Contoh: Cocokkan komponen dengan fungsinya."
                            />
                        </Field>
                        <div className="space-y-2">
                            {(content.pairs ?? []).map((pair, pairIndex) => (
                                <div
                                    key={pairIndex}
                                    className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-2.5 sm:grid-cols-[1fr_1fr_auto]"
                                >
                                    <input
                                        value={pair.left ?? ''}
                                        onChange={(event) =>
                                            setArrayItem('pairs', pairIndex, { left: event.target.value })
                                        }
                                        className={inputClass}
                                        placeholder="Komponen / istilah"
                                    />
                                    <input
                                        value={pair.right ?? ''}
                                        onChange={(event) =>
                                            setArrayItem('pairs', pairIndex, { right: event.target.value })
                                        }
                                        className={inputClass}
                                        placeholder="Pasangan / fungsi"
                                    />
                                    <IconButton
                                        label="Hapus pasangan"
                                        onClick={() => removeItem('pairs', pairIndex)}
                                        disabled={(content.pairs ?? []).length <= 2}
                                        danger
                                    >
                                        ✕
                                    </IconButton>
                                </div>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addItem('pairs', { left: '', right: '' })}
                            disabled={(content.pairs ?? []).length >= 20}
                        >
                            + Tambah pasangan
                        </Button>
                        <Field label="Pembahasan (opsional)">
                            <textarea
                                rows={2}
                                value={content.explanation ?? ''}
                                onChange={(event) => setContent({ explanation: event.target.value })}
                                className={inputClass}
                            />
                        </Field>
                    </>
                )}

                {type === 'soal_essay_ai' && (
                    <>
                        <Field label="Pertanyaan studi kasus">
                            <textarea
                                rows={4}
                                value={content.question ?? ''}
                                onChange={(event) => setContent({ question: event.target.value })}
                                className={inputClass}
                                placeholder="Tulis studi kasus..."
                            />
                        </Field>
                        <Field label="Minimal kata (opsional)">
                            <input
                                type="number"
                                min="0"
                                max="2000"
                                value={content.min_words ?? 0}
                                onChange={(event) =>
                                    setContent({ min_words: Number(event.target.value) })
                                }
                                className={`${inputClass} max-w-[140px] font-mono`}
                            />
                        </Field>
                        <Field
                            label="Rubrik koreksi AI"
                            hint="Rahasia guru. Tidak pernah dikirim ke tampilan siswa."
                        >
                            <textarea
                                rows={4}
                                value={block.ai_rubric ?? ''}
                                onChange={(event) => onChange({ ai_rubric: event.target.value })}
                                className={inputClass}
                                placeholder="Wajib menyebutkan sensor ECT/EOT dan pengukuran resistansi..."
                            />
                        </Field>
                    </>
                )}

                {type === 'soal_hotspot' && (
                    <>
                        <Field label="Pertanyaan">
                            <textarea
                                rows={2}
                                value={content.question ?? ''}
                                onChange={(event) => setContent({ question: event.target.value })}
                                className={inputClass}
                                placeholder="Contoh: Pasangkan label dengan bagian mesin yang tepat."
                            />
                        </Field>
                        <Field label="URL gambar" hint="Tempel URL gambar, atau unggah berkas gambar.">
                            <input
                                value={content.image_url ?? ''}
                                onChange={(event) => setContent({ image_url: event.target.value })}
                                className={inputClass}
                                placeholder="https://... atau /storage/modules/..."
                            />
                        </Field>
                        <div>
                            <label
                                className={`inline-block rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 ${
                                    uploading || !assetUploadUrl
                                        ? 'cursor-not-allowed opacity-50'
                                        : 'cursor-pointer'
                                }`}
                            >
                                {uploading ? 'Mengunggah...' : 'Unggah gambar'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={uploading || !assetUploadUrl}
                                    onChange={(event) => handleAssetUploadField(event, 'image_url')}
                                />
                            </label>
                        </div>
                        <Field
                            label="Titik label"
                            hint="Klik pada gambar untuk menambah titik. Seret titik bernomor untuk memindahkannya. Label harus berbeda satu sama lain."
                        >
                            {content.image_url ? (
                                <div
                                    ref={hotspotBoxRef}
                                    onClick={handleHotspotBoxClick}
                                    className="relative cursor-crosshair select-none overflow-hidden rounded-lg border border-zinc-200"
                                >
                                    <img
                                        src={content.image_url}
                                        alt="Gambar hotspot"
                                        draggable={false}
                                        className="block w-full"
                                    />
                                    {(content.spots ?? []).map((spot, spotIndex) => (
                                        <button
                                            key={spotIndex}
                                            type="button"
                                            title={spot.label || `Titik ${spotIndex + 1}`}
                                            onClick={(event) => event.stopPropagation()}
                                            onPointerDown={(event) => {
                                                event.stopPropagation();
                                                event.currentTarget.setPointerCapture(event.pointerId);
                                                setHotspotDragIndex(spotIndex);
                                            }}
                                            onPointerMove={(event) => {
                                                if (hotspotDragIndex !== spotIndex) return;
                                                const point = hotspotPointFromEvent(event);
                                                if (point) setArrayItem('spots', spotIndex, point);
                                            }}
                                            onPointerUp={() => setHotspotDragIndex(null)}
                                            onPointerCancel={() => setHotspotDragIndex(null)}
                                            className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white font-mono text-xs font-bold text-white shadow ${
                                                hotspotDragIndex === spotIndex
                                                    ? 'cursor-grabbing bg-emerald-500'
                                                    : 'bg-emerald-600'
                                            }`}
                                            style={{
                                                left: `${Number(spot.x) || 0}%`,
                                                top: `${Number(spot.y) || 0}%`,
                                                touchAction: 'none',
                                            }}
                                        >
                                            {spotIndex + 1}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-400">
                                    Isi URL atau unggah gambar dulu, lalu klik gambar untuk menandai titik.
                                </p>
                            )}
                        </Field>
                        <div className="space-y-2">
                            {(content.spots ?? []).map((spot, spotIndex) => (
                                <div key={spotIndex} className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-mono text-xs font-bold text-white">
                                        {spotIndex + 1}
                                    </span>
                                    <input
                                        value={spot.label ?? ''}
                                        onChange={(event) =>
                                            setArrayItem('spots', spotIndex, { label: event.target.value })
                                        }
                                        className={inputClass}
                                        placeholder={`Label titik ${spotIndex + 1}`}
                                    />
                                    <span className="hidden shrink-0 font-mono text-[11px] text-zinc-400 sm:block">
                                        {Number(spot.x) || 0}%, {Number(spot.y) || 0}%
                                    </span>
                                    <IconButton
                                        label="Hapus titik"
                                        onClick={() => removeItem('spots', spotIndex)}
                                        disabled={(content.spots ?? []).length <= 2}
                                        danger
                                    >
                                        ✕
                                    </IconButton>
                                </div>
                            ))}
                        </div>
                        <Field label="Pembahasan (opsional)">
                            <textarea
                                rows={2}
                                value={content.explanation ?? ''}
                                onChange={(event) => setContent({ explanation: event.target.value })}
                                className={inputClass}
                                placeholder="Tampil setelah siswa menjawab."
                            />
                        </Field>
                    </>
                )}

                {type === 'materi_video_interaktif' && (
                    <>
                        <Field label="Judul (opsional)">
                            <input
                                value={content.title ?? ''}
                                onChange={(event) => setContent({ title: event.target.value })}
                                className={inputClass}
                                placeholder="Judul video"
                            />
                        </Field>
                        <Field
                            label="URL video"
                            hint="Hanya berkas video langsung (MP4/WebM) — tautan atau hasil unggah. YouTube tidak didukung untuk blok ini."
                        >
                            <input
                                value={content.url ?? ''}
                                onChange={(event) => setContent({ url: event.target.value })}
                                className={inputClass}
                                placeholder="https://.../video.mp4 atau /storage/modules/..."
                            />
                        </Field>
                        <div>
                            <label
                                className={`inline-block rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 ${
                                    uploading || !assetUploadUrl
                                        ? 'cursor-not-allowed opacity-50'
                                        : 'cursor-pointer'
                                }`}
                            >
                                {uploading ? 'Mengunggah...' : 'Unggah video'}
                                <input
                                    type="file"
                                    accept="video/mp4,video/webm,.mp4,.webm"
                                    className="hidden"
                                    disabled={uploading || !assetUploadUrl}
                                    onChange={(event) => handleAssetUploadField(event, 'url')}
                                />
                            </label>
                        </div>
                        <Field
                            label="Checkpoint pertanyaan"
                            hint="Video berhenti di detik checkpoint dan siswa wajib menjawab sebelum lanjut. Boleh kosong bila hanya ingin video biasa."
                        >
                            <div className="space-y-2">
                                {(content.checkpoints ?? []).map((checkpoint, checkpointIndex) => (
                                    <RepeaterRow
                                        key={checkpointIndex}
                                        label="checkpoint"
                                        onRemove={() => removeItem('checkpoints', checkpointIndex)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                                                Detik ke-
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={checkpoint.at ?? 0}
                                                    onChange={(event) =>
                                                        setArrayItem('checkpoints', checkpointIndex, {
                                                            at: Number(event.target.value),
                                                        })
                                                    }
                                                    className="w-20 rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-right font-mono text-xs text-zinc-900 focus:border-emerald-500 focus:outline-none"
                                                />
                                            </label>
                                        </div>
                                        <textarea
                                            rows={2}
                                            value={checkpoint.question ?? ''}
                                            onChange={(event) =>
                                                setArrayItem('checkpoints', checkpointIndex, {
                                                    question: event.target.value,
                                                })
                                            }
                                            className={inputClass}
                                            placeholder="Pertanyaan checkpoint..."
                                        />
                                        <div className="space-y-1.5">
                                            {(checkpoint.options ?? []).map((option, optionIndex) => (
                                                <div key={optionIndex} className="flex items-center gap-2">
                                                    <label className="flex shrink-0 items-center gap-1 text-[11px] text-zinc-500">
                                                        <input
                                                            type="radio"
                                                            name={`checkpoint-key-${block.id}-${checkpointIndex}`}
                                                            checked={
                                                                (checkpoint.correct_index ?? 0) === optionIndex
                                                            }
                                                            onChange={() =>
                                                                setArrayItem('checkpoints', checkpointIndex, {
                                                                    correct_index: optionIndex,
                                                                })
                                                            }
                                                            className="accent-emerald-600"
                                                        />
                                                        Kunci
                                                    </label>
                                                    <input
                                                        value={option.text ?? ''}
                                                        onChange={(event) =>
                                                            setCheckpointOption(checkpointIndex, optionIndex, {
                                                                text: event.target.value,
                                                            })
                                                        }
                                                        className={inputClass}
                                                        placeholder={`Opsi ${String.fromCharCode(65 + optionIndex)}`}
                                                    />
                                                    <IconButton
                                                        label="Hapus opsi"
                                                        onClick={() => {
                                                            const options = (
                                                                checkpoint.options ?? []
                                                            ).filter(
                                                                (_, position) => position !== optionIndex,
                                                            );
                                                            const correctIndex = Math.min(
                                                                checkpoint.correct_index ?? 0,
                                                                Math.max(0, options.length - 1),
                                                            );
                                                            setArrayItem('checkpoints', checkpointIndex, {
                                                                options,
                                                                correct_index: correctIndex,
                                                            });
                                                        }}
                                                        disabled={(checkpoint.options ?? []).length <= 2}
                                                        danger
                                                    >
                                                        ✕
                                                    </IconButton>
                                                </div>
                                            ))}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const options = [
                                                    ...(checkpoint.options ?? []),
                                                    { text: '' },
                                                ];
                                                setArrayItem('checkpoints', checkpointIndex, { options });
                                            }}
                                            disabled={(checkpoint.options ?? []).length >= 6}
                                        >
                                            + Tambah opsi
                                        </Button>
                                    </RepeaterRow>
                                ))}
                                {(content.checkpoints ?? []).length === 0 && (
                                    <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-400">
                                        Belum ada checkpoint. Tambahkan agar video berhenti untuk pertanyaan.
                                    </p>
                                )}
                            </div>
                        </Field>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                addItem('checkpoints', {
                                    at: 0,
                                    question: '',
                                    options: [{ text: '' }, { text: '' }],
                                    correct_index: 0,
                                })
                            }
                            disabled={(content.checkpoints ?? []).length >= 20}
                        >
                            + Tambah checkpoint
                        </Button>
                    </>
                )}

                {type === 'polling' && (
                    <>
                        <Field
                            label="Pertanyaan polling"
                            hint="Polling kilat tidak dinilai — untuk memancing diskusi atau mengecek pendapat kelas."
                        >
                            <textarea
                                rows={2}
                                value={content.question ?? ''}
                                onChange={(event) => setContent({ question: event.target.value })}
                                className={inputClass}
                                placeholder="Contoh: Bagian mana yang paling sulit dari materi hari ini?"
                            />
                        </Field>
                        <div className="space-y-2">
                            {(content.options ?? []).map((option, optionIndex) => (
                                <div key={optionIndex} className="flex items-start gap-2">
                                    <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 font-mono text-xs text-emerald-700">
                                        {String.fromCharCode(65 + optionIndex)}
                                    </span>
                                    <input
                                        value={typeof option === 'string' ? option : (option?.text ?? '')}
                                        onChange={(event) => {
                                            const next = [...(content.options ?? [])];
                                            next[optionIndex] = event.target.value;
                                            setContent({ options: next });
                                        }}
                                        className={inputClass}
                                        placeholder={`Opsi ${String.fromCharCode(65 + optionIndex)}`}
                                    />
                                    <IconButton
                                        label="Hapus opsi"
                                        onClick={() => removeItem('options', optionIndex)}
                                        disabled={(content.options ?? []).length <= 2}
                                        danger
                                    >
                                        ✕
                                    </IconButton>
                                </div>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addItem('options', '')}
                            disabled={(content.options ?? []).length >= 6}
                        >
                            + Tambah opsi
                        </Button>
                    </>
                )}

                {type === 'praktik_checklist' && (
                    <>
                        <Field label="Judul checklist">
                            <input
                                value={content.title ?? ''}
                                onChange={(event) => setContent({ title: event.target.value })}
                                className={inputClass}
                                placeholder="Contoh: Checklist Keselamatan Kerja Praktik"
                                maxLength={180}
                            />
                        </Field>
                        <Field label="Instruksi (opsional)">
                            <textarea
                                rows={3}
                                value={content.instructions ?? ''}
                                onChange={(event) => setContent({ instructions: event.target.value })}
                                className={inputClass}
                                placeholder="Petunjuk pelaksanaan praktik untuk siswa."
                            />
                        </Field>
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-zinc-600">
                                Langkah praktik — centang dicatat siswa saat praktik; langkah bertanda
                                kamera wajib dilampiri foto bukti.
                            </p>
                            {(content.steps ?? []).map((step, stepIndex) => (
                                <RepeaterRow
                                    key={stepIndex}
                                    label="langkah"
                                    onRemove={() => removeItem('steps', stepIndex)}
                                    canRemove={(content.steps ?? []).length > 2}
                                >
                                    <input
                                        value={typeof step === 'object' ? (step?.label ?? '') : ''}
                                        onChange={(event) =>
                                            setArrayItem('steps', stepIndex, { label: event.target.value })
                                        }
                                        className={inputClass}
                                        placeholder={`Langkah ${stepIndex + 1}`}
                                        maxLength={500}
                                    />
                                    <label className="flex items-center gap-2 text-xs text-zinc-600">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(
                                                typeof step === 'object' ? step?.require_photo : false,
                                            )}
                                            onChange={(event) =>
                                                setArrayItem('steps', stepIndex, {
                                                    require_photo: event.target.checked,
                                                })
                                            }
                                            className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        📷 Wajib foto bukti
                                    </label>
                                </RepeaterRow>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addItem('steps', { label: '', require_photo: false })}
                            disabled={(content.steps ?? []).length >= 30}
                        >
                            + Tambah langkah
                        </Button>
                    </>
                )}

                {type === 'tugas_upload' && (
                    <>
                        <Field label="Judul tugas">
                            <input
                                value={content.title ?? ''}
                                onChange={(event) => setContent({ title: event.target.value })}
                                className={inputClass}
                                placeholder="Contoh: Video Praktik Menggunakan Jangka Sorong"
                                maxLength={180}
                            />
                        </Field>
                        <Field label="Instruksi (opsional)">
                            <textarea
                                rows={3}
                                value={content.instructions ?? ''}
                                onChange={(event) => setContent({ instructions: event.target.value })}
                                className={inputClass}
                                placeholder="Jelaskan apa yang harus dikumpulkan siswa."
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Maks berkas">
                                <input
                                    type="number"
                                    min={1}
                                    max={5}
                                    value={content.max_files ?? 3}
                                    onChange={(event) =>
                                        setContent({ max_files: Number(event.target.value) })
                                    }
                                    className={inputClass}
                                />
                            </Field>
                            <Field label="Jenis berkas diterima">
                                <select
                                    value={content.accept ?? 'file'}
                                    onChange={(event) => setContent({ accept: event.target.value })}
                                    className={selectClass}
                                >
                                    <option value="file">Semua berkas</option>
                                    <option value="image">Gambar saja</option>
                                    <option value="video">Video saja</option>
                                </select>
                            </Field>
                        </div>
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-zinc-600">
                                Rubrik penilaian — nilai persen dihitung dari total skor kriteria, lalu
                                diskalakan ke poin blok dan masuk buku nilai.
                            </p>
                            {(content.rubric ?? []).map((item, itemIndex) => (
                                <RepeaterRow
                                    key={itemIndex}
                                    label="kriteria"
                                    onRemove={() => removeItem('rubric', itemIndex)}
                                    canRemove={(content.rubric ?? []).length > 1}
                                >
                                    <div className="flex items-start gap-2">
                                        <input
                                            value={item?.criterion ?? ''}
                                            onChange={(event) =>
                                                setArrayItem('rubric', itemIndex, {
                                                    criterion: event.target.value,
                                                })
                                            }
                                            className={inputClass}
                                            placeholder={`Kriteria ${itemIndex + 1}`}
                                            maxLength={500}
                                        />
                                        <input
                                            type="number"
                                            min={1}
                                            max={100}
                                            value={item?.max_score ?? 10}
                                            onChange={(event) =>
                                                setArrayItem('rubric', itemIndex, {
                                                    max_score: Number(event.target.value),
                                                })
                                            }
                                            className={`${inputClass} w-24 shrink-0 text-right font-mono`}
                                            title="Skor maksimal kriteria"
                                        />
                                    </div>
                                </RepeaterRow>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addItem('rubric', { criterion: '', max_score: 10 })}
                            disabled={(content.rubric ?? []).length >= 6}
                        >
                            + Tambah kriteria
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
