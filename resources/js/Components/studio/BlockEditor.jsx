import { useState } from 'react';
import { Button, Field, inputClass } from '@/Components/ui';
import { BLOCK_LABELS } from '@/Components/DynamicBlockRenderer';
import PdfSlideImporter from '@/Components/studio/PdfSlideImporter';

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
    onMove,
    onSlidesImported,
    uploadUrl,
    csrfToken,
    index,
    total,
}) {
    const content = block.content ?? {};
    const type = block.block_type;
    const [slideSource, setSlideSource] = useState(
        content.url || (content.images ?? []).length > 0 ? 'manual' : 'pdf',
    );

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
                    {type.startsWith('soal_') && (
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
                    <IconButton label="Hapus blok" onClick={onDelete} danger>
                        Hapus
                    </IconButton>
                </div>
            </div>

            <div className="space-y-3 px-4 py-4">
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
                        <Field label="Isi materi" hint="Baris baru akan dipertahankan saat dirender.">
                            <textarea
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
            </div>
        </div>
    );
}
