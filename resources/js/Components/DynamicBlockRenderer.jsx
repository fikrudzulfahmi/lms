import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * DynamicBlockRenderer
 * Satu renderer untuk 4 konteks:
 * - editor_guru     : pratinjau kanvas, ukuran proporsional, kunci jawaban terlihat
 * - live_proyektor  : panggung gelap kontras tinggi, teks besar, kunci disembunyikan
 * - live_hp_siswa   : mobile-first, interaktif, mengikuti slide guru
 * - mandiri_siswa   : belajar mandiri, interaktif + periksa jawaban
 */

const MODES = ['editor_guru', 'live_proyektor', 'live_hp_siswa', 'mandiri_siswa'];

const BLOCK_LABELS = {
    section_heading: 'Judul Bagian',
    materi_richtext: 'Teks Kaya',
    materi_video: 'Video',
    materi_file: 'Lampiran Berkas',
    materi_embed: 'Tautan / Embed',
    materi_teks: 'Teks Materi',
    materi_accordion: 'Accordion SOP',
    materi_flashcard: 'Flashcard',
    slide_image: 'Slide Gambar',
    soal_mcq: 'Pilihan Ganda',
    soal_truefalse: 'Benar / Salah',
    soal_fillblank: 'Isian Singkat',
    soal_sequencing: 'Urutan Prosedur',
    soal_matching: 'Mencocokkan',
    soal_essay_ai: 'Studi Kasus Esai',
    soal_hotspot: 'Labeli Gambar / Hotspot',
    materi_video_interaktif: 'Video Interaktif',
    polling: 'Polling Kilat',
    praktik_checklist: 'Checklist Praktik',
    tugas_upload: 'Tugas Unggah',
};

function text(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

/** Hanya izinkan path storage relatif atau URL http(s). */
function imageSource(value) {
    const src = text(value).trim();

    if (src.startsWith('/') || /^https?:\/\//i.test(src)) return src;

    return '';
}

function normalize(content = {}) {
    const c = content ?? {};

    return {
        title: text(c.title ?? c.h),
        body: text(c.body ?? c.txt ?? c.text),
        question: text(c.question ?? c.q),
        explanation: text(c.explanation ?? c.pembahasan),
        url: imageSource(c.url ?? c.src ?? c.image),
        images: Array.isArray(c.images)
            ? c.images.map((image) => imageSource(image?.url ?? image)).filter(Boolean)
            : [],
        caption: text(c.caption),
        items: Array.isArray(c.items)
            ? c.items.map((item) => ({
                  label: text(item?.label ?? item?.lbl ?? item?.title),
                  text: text(item?.text ?? item?.txt ?? item?.body),
              }))
            : [],
        cards: Array.isArray(c.cards)
            ? c.cards.map((card) => ({
                  front: text(card?.front ?? card?.f),
                  back: text(card?.back ?? card?.b),
              }))
            : [],
        options: Array.isArray(c.options)
            ? c.options.map((option, index) =>
                  typeof option === 'string'
                      ? { text: option, correct: false, key: index }
                      : { text: text(option?.text ?? option?.label ?? option?.t), correct: Boolean(option?.correct), key: index },
              )
            : [],
        steps: Array.isArray(c.steps) ? c.steps.map((step) => text(step)) : [],
        pairs: Array.isArray(c.pairs)
            ? c.pairs.map((pair) => ({ left: text(pair?.left), right: text(pair?.right) }))
            : [],
        rights: Array.isArray(c.rights) ? c.rights.map((right) => text(right)).filter(Boolean) : [],
        keyless: Boolean(c.keyless),
        files: Array.isArray(c.files)
            ? c.files
                  .map((file) => ({
                      name: text(file?.name ?? file?.filename),
                      url: imageSource(file?.url),
                      size: Number(file?.size) || 0,
                  }))
                  .filter((file) => file.url)
            : [],
        source: text(c.source),
        embed: Boolean(c.embed),
        answerKey: typeof c.answer === 'boolean' ? c.answer : null,
        answers: Array.isArray(c.answers) ? c.answers.map((answer) => text(answer)).filter(Boolean) : [],
        imageUrl: imageSource(c.image_url ?? c.imageUrl),
        spots: Array.isArray(c.spots)
            ? c.spots.map((spot) => ({
                  x: Number(spot?.x) || 0,
                  y: Number(spot?.y) || 0,
                  label: text(spot?.label),
              }))
            : [],
        labels: Array.isArray(c.labels) ? c.labels.map((label) => text(label)).filter(Boolean) : [],
        checkpoints: Array.isArray(c.checkpoints)
            ? c.checkpoints.map((checkpoint) => ({
                  at: Math.max(0, Math.floor(Number(checkpoint?.at) || 0)),
                  question: text(checkpoint?.question),
                  options: Array.isArray(checkpoint?.options)
                      ? checkpoint.options.map((option) =>
                            typeof option === 'string'
                                ? { text: option }
                                : { text: text(option?.text ?? option?.label) },
                        )
                      : [],
                  correctIndex:
                      Number.isInteger(checkpoint?.correct_index) || Number.isInteger(checkpoint?.correctIndex)
                          ? (checkpoint.correct_index ?? checkpoint.correctIndex)
                          : null,
              }))
            : [],
        instructions: text(c.instructions),
        // Langkah checklist berupa objek {label, require_photo} — berbeda
        // dari `steps` soal sequencing yang berupa daftar string.
        checkSteps: Array.isArray(c.steps)
            ? c.steps
                  .filter((step) => step !== null && typeof step === 'object')
                  .map((step) => ({
                      label: text(step?.label),
                      requirePhoto: Boolean(step?.require_photo ?? step?.requirePhoto),
                  }))
            : [],
        maxFiles: Math.max(1, Math.min(5, Number(c.max_files) || 3)),
        acceptKind: ['image', 'video', 'file'].includes(c.accept) ? c.accept : 'file',
        rubric: Array.isArray(c.rubric)
            ? c.rubric.map((item) => ({
                  criterion: text(item?.criterion),
                  maxScore: Number(item?.max_score ?? item?.maxScore) || 0,
              }))
            : [],
    };
}

function studentXsrfToken() {
    const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

/** Unggah satu berkas siswa ke endpoint student.uploads; kembalikan {url, name, size}. */
async function uploadStudentFile(file, uploadUrl) {
    const form = new FormData();
    form.append('file', file);

    const response = await fetch(uploadUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': studentXsrfToken(),
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

function formatBytes(size) {
    const bytes = Number(size) || 0;
    if (bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, '')} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

function youtubeVideoId(url) {
    const value = text(url);
    const patterns = [
        /[?&]v=([\w-]{6,})/,
        /youtu\.be\/([\w-]{6,})/,
        /\/embed\/([\w-]{6,})/,
        /\/shorts\/([\w-]{6,})/,
    ];

    for (const pattern of patterns) {
        const match = value.match(pattern);
        if (match) return match[1];
    }

    return null;
}

/** Parse SATU baris markdown ringan: **tebal**, *miring*, [label](url). Tanpa HTML mentah. */
function renderInline(value, keyPrefix) {
    const tokens = value.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g);

    return tokens.map((token, index) => {
        const key = `${keyPrefix}-${index}`;
        if (!token) return null;

        const bold = token.match(/^\*\*([^*\n]+)\*\*$/);
        if (bold) return <strong key={key}>{bold[1]}</strong>;

        const italic = token.match(/^\*([^*\n]+)\*$/);
        if (italic) return <em key={key}>{italic[1]}</em>;

        const link = token.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (link) {
            return (
                <a
                    key={key}
                    href={link[2]}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800"
                >
                    {link[1]}
                </a>
            );
        }

        return <span key={key}>{token}</span>;
    });
}

/**
 * Render markdown subset yang aman menjadi elemen React.
 * Blok: paragraf (baris kosong), daftar "- ", daftar bernomor "1. ".
 */
function RichText({ body, mode }) {
    const blocks = text(body)
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean);

    const paragraphClass =
        mode === 'live_proyektor' ? 'text-2xl leading-relaxed text-zinc-200' : 'text-sm leading-6 text-zinc-600';
    const listClass =
        mode === 'live_proyektor' ? 'text-2xl leading-relaxed text-zinc-200' : 'text-sm leading-6 text-zinc-600';

    if (blocks.length === 0) return null;

    return (
        <div className="space-y-3">
            {blocks.map((block, blockIndex) => {
                const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
                const key = `block-${blockIndex}`;

                if (lines.length > 0 && lines.every((line) => line.startsWith('- '))) {
                    return (
                        <ul key={key} className={`list-disc space-y-1 pl-5 ${listClass}`}>
                            {lines.map((line, lineIndex) => (
                                <li key={`${key}-${lineIndex}`}>{renderInline(line.slice(2), `${key}-${lineIndex}`)}</li>
                            ))}
                        </ul>
                    );
                }

                if (lines.length > 0 && lines.every((line) => /^\d+\.\s/.test(line))) {
                    return (
                        <ol key={key} className={`list-decimal space-y-1 pl-5 ${listClass}`}>
                            {lines.map((line, lineIndex) => (
                                <li key={`${key}-${lineIndex}`}>
                                    {renderInline(line.replace(/^\d+\.\s/, ''), `${key}-${lineIndex}`)}
                                </li>
                            ))}
                        </ol>
                    );
                }

                return (
                    <p key={key} className={paragraphClass}>
                        {lines.map((line, lineIndex) => (
                            <span key={`${key}-${lineIndex}`}>
                                {lineIndex > 0 && <br />}
                                {renderInline(line, `${key}-${lineIndex}`)}
                            </span>
                        ))}
                    </p>
                );
            })}
        </div>
    );
}

function Shell({ mode, children, className = '' }) {
    const base =
        mode === 'live_proyektor'
            ? 'rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-white sm:p-10'
            : 'rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900';

    return <div className={`${base} ${className}`}>{children}</div>;
}

function Heading({ mode, children, kicker = null }) {
    if (!children) return null;

    const size =
        mode === 'live_proyektor'
            ? 'text-3xl sm:text-4xl lg:text-5xl'
            : mode === 'live_hp_siswa'
              ? 'text-lg'
              : 'text-base';

    return (
        <div className="mb-4">
            {kicker && (
                <div
                    className={`mb-1.5 font-mono uppercase tracking-widest ${
                        mode === 'live_proyektor' ? 'text-xs text-emerald-400' : 'text-[11px] text-emerald-700'
                    }`}
                >
                    {kicker}
                </div>
            )}
            <h3 className={`font-display font-bold leading-tight ${size}`}>{children}</h3>
        </div>
    );
}

function BodyText({ mode, children }) {
    if (!children) return null;

    const size =
        mode === 'live_proyektor'
            ? 'text-2xl leading-relaxed sm:text-3xl'
            : mode === 'live_hp_siswa'
              ? 'text-sm leading-7'
              : 'text-sm leading-6';

    return (
        <div
            className={`whitespace-pre-line ${
                mode === 'live_proyektor' ? 'text-zinc-200' : 'text-zinc-600'
            } ${size}`}
        >
            {children}
        </div>
    );
}

function PointsBadge({ points, mode }) {
    if (!points) return null;

    return (
        <span
            className={`ml-auto inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 font-mono text-xs ${
                mode === 'live_proyektor'
                    ? 'border-emerald-800 bg-emerald-950/60 text-emerald-400'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
        >
            {points} poin
        </span>
    );
}

function QuestionHeader({ label, points, mode }) {
    return (
        <div className="mb-3 flex items-center gap-2">
            <span
                className={`font-mono text-[11px] uppercase tracking-widest ${
                    mode === 'live_proyektor' ? 'text-emerald-400' : 'text-emerald-700'
                }`}
            >
                {label}
            </span>
            <PointsBadge points={points} mode={mode} />
        </div>
    );
}

async function submitAndMark(onSubmitAnswer, payload, setSubmitted, setSending, onResult = null) {
    if (!onSubmitAnswer) return;

    setSending(true);
    try {
        const result = await onSubmitAnswer(payload);
        // Kontrak: parent mengembalikan false bila server gagal menyimpan,
        // boolean true bila tersimpan, atau objek {saved, correct} (mode
        // latihan) yang memuat hasil penilaian untuk umpan balik siswa.
        const saved =
            result !== false &&
            !(result !== null && typeof result === 'object' && result.saved === false);
        if (saved) setSubmitted(true);
        if (onResult) onResult(result);
    } finally {
        setSending(false);
    }
}

/** Ekstrak status benar/salah dari hasil submit mode latihan ({saved, correct}). */
function correctFromResult(result) {
    return result !== null && typeof result === 'object' && typeof result.correct === 'boolean'
        ? result.correct
        : null;
}

function McqBlock({ data, mode, points, reveal, onSubmitAnswer, initialAnswer = null, initialCorrect = null }) {
    const [selected, setSelected] = useState(() =>
        Number.isInteger(initialAnswer?.option_index) ? initialAnswer.option_index : null,
    );
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(() => initialAnswer != null);
    const [sending, setSending] = useState(false);
    // Hasil penilaian terakhir (mode latihan): false → tawarkan "Coba lagi".
    const [lastCorrect, setLastCorrect] = useState(() =>
        typeof initialCorrect === 'boolean' ? initialCorrect : null,
    );

    useEffect(() => {
        setSelected(Number.isInteger(initialAnswer?.option_index) ? initialAnswer.option_index : null);
        setChecked(false);
        setSubmitted(initialAnswer != null);
        setLastCorrect(typeof initialCorrect === 'boolean' ? initialCorrect : null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.question, data.options.length]);

    const interactive = mode !== 'editor_guru' && mode !== 'live_proyektor';
    const showKey = mode === 'editor_guru' || reveal;

    function resetAttempt() {
        setSelected(null);
        setChecked(false);
        setSubmitted(false);
        setLastCorrect(null);
    }

    return (
        <div>
            <QuestionHeader label="Pilihan Ganda" points={points} mode={mode} />
            <p className={`mb-4 font-medium ${mode === 'live_proyektor' ? 'text-2xl sm:text-3xl' : 'text-sm'}`}>
                {data.question}
            </p>
            <div className="space-y-2.5">
                {data.options.map((option, index) => {
                    const isSelected = selected === index;
                    const isCorrect = option.correct;
                    const tone = showKey && isCorrect
                        ? mode === 'live_proyektor'
                            ? 'border-emerald-700 bg-emerald-950/50'
                            : 'border-emerald-300 bg-emerald-50'
                        : isSelected
                          ? mode === 'live_proyektor'
                              ? 'border-emerald-500 bg-zinc-800'
                              : 'border-emerald-400 bg-white'
                          : mode === 'live_proyektor'
                            ? 'border-zinc-700 bg-zinc-900'
                            : 'border-zinc-200 bg-white hover:border-emerald-300';

                    return (
                        <button
                            key={`${option.key}-${index}`}
                            type="button"
                            disabled={!interactive}
                            onClick={() => {
                                setSelected(index);
                                setChecked(false);
                            }}
                            className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors disabled:cursor-default ${tone}`}
                        >
                            <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border font-mono text-xs ${
                                    mode === 'live_proyektor'
                                        ? 'border-zinc-600 text-zinc-300'
                                        : 'border-zinc-300 text-zinc-600'
                                }`}
                            >
                                {String.fromCharCode(65 + index)}
                            </span>
                            <span className={`flex-1 ${mode === 'live_proyektor' ? 'text-xl' : 'text-sm'}`}>
                                {option.text}
                            </span>
                            {showKey && isCorrect && (
                                <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">
                                    kunci
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {interactive && (
                <div className="mt-4 flex items-center gap-3">
                    {onSubmitAnswer ? (
                        <>
                            <button
                                type="button"
                                disabled={selected === null || sending}
                                onClick={() =>
                                    submitAndMark(
                                        onSubmitAnswer,
                                        { option_index: selected },
                                        setSubmitted,
                                        setSending,
                                        (result) => setLastCorrect((prev) => correctFromResult(result) ?? prev),
                                    )
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {sending ? 'Mengirim...' : submitted ? 'Kirim Ulang Jawaban' : 'Kirim Jawaban'}
                            </button>
                            {submitted && lastCorrect === null && (
                                <span className="text-xs font-medium text-emerald-700">Jawaban terkirim.</span>
                            )}
                            {submitted && lastCorrect === true && (
                                <span className="text-xs font-medium text-emerald-700">Tepat ✓</span>
                            )}
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                disabled={selected === null}
                                onClick={() => setChecked(true)}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Periksa Jawaban
                            </button>
                            {checked && selected !== null && (
                                <span
                                    className={`text-xs font-medium ${
                                        data.options[selected]?.correct ? 'text-emerald-700' : 'text-red-600'
                                    }`}
                                >
                                    {data.options[selected]?.correct ? 'Tepat.' : 'Belum tepat, coba lagi.'}
                                </span>
                            )}
                        </>
                    )}
                </div>
            )}

            {mode === 'mandiri_siswa' &&
                interactive &&
                (lastCorrect === false || (checked && selected !== null && !data.options[selected]?.correct)) && (
                    <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs font-medium text-red-600">Jawaban belum tepat.</span>
                        <button
                            type="button"
                            onClick={resetAttempt}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                            Coba lagi
                        </button>
                    </div>
                )}

            {data.explanation && (mode === 'editor_guru' || checked || reveal) && (
                <p
                    className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                        mode === 'live_proyektor'
                            ? 'border-zinc-700 bg-zinc-800 text-zinc-300'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                    }`}
                >
                    {data.explanation}
                </p>
            )}
        </div>
    );
}

function shuffledSteps(steps, shuffle) {
    const list = steps.map((step, index) => ({ step, index }));
    if (!shuffle) return list;

    const copy = [...list];
    for (let position = copy.length - 1; position > 0; position -= 1) {
        const swap = Math.floor(Math.random() * (position + 1));
        [copy[position], copy[swap]] = [copy[swap], copy[position]];
    }

    return copy;
}

function orderFromSaved(steps, savedOrder) {
    if (!Array.isArray(savedOrder) || savedOrder.length !== steps.length) return null;

    const items = savedOrder.map((stepText) => {
        const index = steps.indexOf(stepText);
        return index >= 0 ? { step: stepText, index } : null;
    });

    return items.every(Boolean) ? items : null;
}

function SequencingBlock({ data, mode, points, reveal, onSubmitAnswer, initialAnswer = null, initialCorrect = null }) {
    const [order, setOrder] = useState(
        () => orderFromSaved(data.steps, initialAnswer?.order) ?? shuffledSteps(data.steps, mode === 'live_proyektor'),
    );
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(() => initialAnswer != null);
    const [sending, setSending] = useState(false);
    const [lastCorrect, setLastCorrect] = useState(() =>
        typeof initialCorrect === 'boolean' ? initialCorrect : null,
    );

    function resetAttempt() {
        setOrder(shuffledSteps(data.steps, true));
        setChecked(false);
        setSubmitted(false);
        setLastCorrect(null);
    }

    // Reset HANYA bila himpunan langkahnya benar-benar berubah. Reconnect WS
    // mengacak ulang serialisasi server; urutan kerja siswa tidak boleh hilang.
    const stepsSignature = [...data.steps].sort().join('|');
    const signatureRef = useRef(stepsSignature);

    useEffect(() => {
        if (signatureRef.current === stepsSignature) return;
        signatureRef.current = stepsSignature;
        setOrder(
            orderFromSaved(data.steps, initialAnswer?.order) ??
                shuffledSteps(data.steps, mode === 'live_proyektor'),
        );
        setChecked(false);
        setSubmitted(initialAnswer != null);
        setLastCorrect(typeof initialCorrect === 'boolean' ? initialCorrect : null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepsSignature, mode]);

    const interactive = mode !== 'editor_guru' && mode !== 'live_proyektor';

    const move = (position, direction) => {
        const next = position + direction;
        if (next < 0 || next >= order.length) return;
        const copy = [...order];
        [copy[position], copy[next]] = [copy[next], copy[position]];
        setOrder(copy);
        setChecked(false);
    };

    const isCorrect = !data.keyless && order.every((item, position) => item.index === position);

    return (
        <div>
            <QuestionHeader label="Urutan Prosedur" points={points} mode={mode} />
            <p className={`mb-4 font-medium ${mode === 'live_proyektor' ? 'text-2xl sm:text-3xl' : 'text-sm'}`}>
                {data.question}
            </p>
            <ol className="space-y-2">
                {order.map((item, position) => (
                    <li
                        key={`${item.index}-${item.step.slice(0, 12)}`}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                            mode === 'live_proyektor'
                                ? 'border-zinc-700 bg-zinc-900 text-zinc-100'
                                : 'border-zinc-200 bg-white'
                        }`}
                    >
                        <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs ${
                                mode === 'live_proyektor'
                                    ? 'bg-zinc-800 text-emerald-400'
                                    : 'bg-emerald-50 text-emerald-700'
                            }`}
                        >
                            {String(position + 1).padStart(2, '0')}
                        </span>
                        <span className={`flex-1 ${mode === 'live_proyektor' ? 'text-xl' : 'text-sm'}`}>
                            {item.step}
                        </span>
                        {interactive && (
                            <span className="flex shrink-0 gap-1">
                                <button
                                    type="button"
                                    aria-label="Naikkan langkah"
                                    onClick={() => move(position, -1)}
                                    disabled={position === 0}
                                    className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-30"
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    aria-label="Turunkan langkah"
                                    onClick={() => move(position, 1)}
                                    disabled={position === order.length - 1}
                                    className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-30"
                                >
                                    ↓
                                </button>
                            </span>
                        )}
                    </li>
                ))}
            </ol>

            {interactive && (
                <div className="mt-4 flex items-center gap-3">
                    {onSubmitAnswer ? (
                        <>
                            <button
                                type="button"
                                disabled={sending}
                                onClick={() =>
                                    submitAndMark(
                                        onSubmitAnswer,
                                        { order: order.map((item) => item.step) },
                                        setSubmitted,
                                        setSending,
                                        (result) => setLastCorrect((prev) => correctFromResult(result) ?? prev),
                                    )
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {sending ? 'Mengirim...' : submitted ? 'Kirim Ulang Urutan' : 'Kirim Urutan'}
                            </button>
                            {submitted && (
                                <span className="text-xs font-medium text-emerald-700">Urutan terkirim.</span>
                            )}
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => setChecked(true)}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                                Periksa Urutan
                            </button>
                            {checked && (
                                <span className={`text-xs font-medium ${isCorrect ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {isCorrect ? 'Urutan tepat.' : 'Urutan belum tepat.'}
                                </span>
                            )}
                        </>
                    )}
                </div>
            )}

            {mode === 'mandiri_siswa' &&
                interactive &&
                (lastCorrect === false || (checked && !data.keyless && !isCorrect)) && (
                    <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs font-medium text-red-600">Urutan belum tepat.</span>
                        <button
                            type="button"
                            onClick={resetAttempt}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                            Coba lagi
                        </button>
                    </div>
                )}

            {(mode === 'editor_guru' || reveal) && data.steps.length > 0 && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    Kunci: {data.steps.map((step, index) => `${index + 1}. ${step}`).join(' → ')}
                </div>
            )}
        </div>
    );
}

function answersFromSaved(pairs, savedMatching) {
    if (!savedMatching || typeof savedMatching !== 'object') return {};

    const result = {};
    pairs.forEach((pair, index) => {
        if (typeof savedMatching[pair.left] === 'string' && savedMatching[pair.left] !== '') {
            result[index] = savedMatching[pair.left];
        }
    });
    return result;
}

function MatchingBlock({ data, mode, points, reveal, onSubmitAnswer, initialAnswer = null, initialCorrect = null }) {
    const rights = useMemo(
        () =>
            data.rights.length > 0
                ? data.rights
                : data.pairs.map((pair) => pair.right).slice().sort((a, b) => a.localeCompare(b)),
        [data.rights.join('|'), data.pairs.map((p) => p.right).join('|')],
    );
    const [answers, setAnswers] = useState(() => answersFromSaved(data.pairs, initialAnswer?.matching));
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(() => initialAnswer != null);
    const [sending, setSending] = useState(false);
    const [lastCorrect, setLastCorrect] = useState(() =>
        typeof initialCorrect === 'boolean' ? initialCorrect : null,
    );

    useEffect(() => {
        setAnswers(answersFromSaved(data.pairs, initialAnswer?.matching));
        setChecked(false);
        setSubmitted(initialAnswer != null);
        setLastCorrect(typeof initialCorrect === 'boolean' ? initialCorrect : null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.pairs.map((p) => `${p.left}:${p.right}`).join('|')]);

    function resetAttempt() {
        setAnswers({});
        setChecked(false);
        setSubmitted(false);
        setLastCorrect(null);
    }

    const interactive = mode !== 'editor_guru' && mode !== 'live_proyektor';
    const allCorrect =
        !data.keyless &&
        data.pairs.length > 0 &&
        data.pairs.every((pair, index) => answers[index] === pair.right);

    return (
        <div>
            <QuestionHeader label="Mencocokkan" points={points} mode={mode} />
            <p className={`mb-4 font-medium ${mode === 'live_proyektor' ? 'text-2xl sm:text-3xl' : 'text-sm'}`}>
                {data.question}
            </p>
            <div className="space-y-2">
                {data.pairs.map((pair, index) => (
                    <div
                        key={`${pair.left}-${index}`}
                        className={`grid items-center gap-2 rounded-lg border px-3 py-2.5 sm:grid-cols-[1fr_auto_1fr] ${
                            mode === 'live_proyektor'
                                ? 'border-zinc-700 bg-zinc-900'
                                : 'border-zinc-200 bg-white'
                        }`}
                    >
                        <span className={`${mode === 'live_proyektor' ? 'text-xl' : 'text-sm'}`}>{pair.left}</span>
                        <span className="hidden font-mono text-xs text-zinc-400 sm:block">↔</span>
                        {interactive ? (
                            <select
                                value={answers[index] ?? ''}
                                onChange={(event) => {
                                    setAnswers((prev) => ({ ...prev, [index]: event.target.value }));
                                    setChecked(false);
                                }}
                                className={`w-full rounded-md border px-2 py-1.5 text-sm ${
                                    mode === 'live_proyektor'
                                        ? 'border-zinc-600 bg-zinc-800 text-white'
                                        : 'border-zinc-200 bg-white text-zinc-900'
                                }`}
                            >
                                <option value="">— pilih pasangan —</option>
                                {rights.map((right) => (
                                    <option key={right} value={right}>
                                        {right}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <span
                                className={`text-sm ${
                                    mode === 'live_proyektor' ? 'text-zinc-300' : 'text-zinc-500'
                                }`}
                            >
                                {mode === 'editor_guru' || reveal ? pair.right : '...'}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {interactive && (
                <div className="mt-4 flex items-center gap-3">
                    {onSubmitAnswer ? (
                        <>
                            <button
                                type="button"
                                disabled={Object.keys(answers).length < data.pairs.length || sending}
                                onClick={() =>
                                    submitAndMark(
                                        onSubmitAnswer,
                                        {
                                            matching: Object.fromEntries(
                                                data.pairs.map((pair, index) => [
                                                    pair.left,
                                                    answers[index] ?? '',
                                                ]),
                                            ),
                                        },
                                        setSubmitted,
                                        setSending,
                                        (result) => setLastCorrect((prev) => correctFromResult(result) ?? prev),
                                    )
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {sending ? 'Mengirim...' : submitted ? 'Kirim Ulang Pasangan' : 'Kirim Pasangan'}
                            </button>
                            {submitted && (
                                <span className="text-xs font-medium text-emerald-700">Pasangan terkirim.</span>
                            )}
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                disabled={Object.keys(answers).length < data.pairs.length}
                                onClick={() => setChecked(true)}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Periksa Pasangan
                            </button>
                            {checked && (
                                <span className={`text-xs font-medium ${allCorrect ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {allCorrect ? 'Semua pasangan tepat.' : 'Masih ada pasangan yang belum tepat.'}
                                </span>
                            )}
                        </>
                    )}
                </div>
            )}

            {mode === 'mandiri_siswa' &&
                interactive &&
                (lastCorrect === false || (checked && !data.keyless && !allCorrect)) && (
                    <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs font-medium text-red-600">Masih ada pasangan yang belum tepat.</span>
                        <button
                            type="button"
                            onClick={resetAttempt}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                            Coba lagi
                        </button>
                    </div>
                )}

            {(mode === 'editor_guru' || reveal) && data.explanation && (
                <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                    {data.explanation}
                </p>
            )}
        </div>
    );
}

function EssayBlock({ data, mode, points, rubric, onSubmitAnswer, initialAnswer = null }) {
    const [answer, setAnswer] = useState(() => (typeof initialAnswer?.text === 'string' ? initialAnswer.text : ''));
    const [savedNote, setSavedNote] = useState(() => Boolean(initialAnswer?.text));
    const [sending, setSending] = useState(false);
    const interactive = mode !== 'editor_guru' && mode !== 'live_proyektor';

    useEffect(() => {
        setAnswer(typeof initialAnswer?.text === 'string' ? initialAnswer.text : '');
        setSavedNote(Boolean(initialAnswer?.text));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.question]);

    return (
        <div>
            <QuestionHeader label="Studi Kasus Esai" points={points} mode={mode} />
            <p className={`mb-4 font-medium ${mode === 'live_proyektor' ? 'text-2xl sm:text-3xl' : 'text-sm'}`}>
                {data.question}
            </p>
            {interactive ? (
                <>
                    <textarea
                        value={answer}
                        onChange={(event) => {
                            setAnswer(event.target.value);
                            setSavedNote(false);
                        }}
                        rows={mode === 'live_hp_siswa' ? 5 : 6}
                        placeholder="Tulis jawabanmu di sini..."
                        className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                            mode === 'live_proyektor'
                                ? 'border-zinc-600 bg-zinc-800 text-white'
                                : 'border-zinc-200 bg-white text-zinc-900'
                        }`}
                    />
                    <div className="mt-2 flex items-center gap-3">
                        <button
                            type="button"
                            disabled={answer.trim().length === 0 || sending}
                            onClick={async () => {
                                if (!onSubmitAnswer) {
                                    setSavedNote(true);
                                    return;
                                }
                                await submitAndMark(
                                    onSubmitAnswer,
                                    { text: answer },
                                    setSavedNote,
                                    setSending,
                                );
                            }}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {sending ? 'Mengirim...' : onSubmitAnswer ? 'Kirim Jawaban' : 'Simpan Jawaban'}
                        </button>
                        <span className="text-xs text-zinc-500">
                            {answer.trim().split(/\s+/).filter(Boolean).length} kata
                        </span>
                        {savedNote && (
                            <span className="text-xs font-medium text-emerald-700">
                                {onSubmitAnswer ? 'Jawaban terkirim.' : 'Tersimpan lokal.'}
                            </span>
                        )}
                    </div>
                </>
            ) : (
                <div
                    className={`rounded-lg border border-dashed px-3 py-6 text-center text-xs ${
                        mode === 'live_proyektor'
                            ? 'border-zinc-700 text-zinc-500'
                            : 'border-zinc-200 text-zinc-400'
                    }`}
                >
                    Siswa menjawab esai pada perangkat masing-masing.
                </div>
            )}

            {mode === 'editor_guru' && rubric && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span className="font-mono text-[10px] uppercase tracking-wider">Rubrik AI (rahasia)</span>
                    <p className="mt-1 whitespace-pre-line">{rubric}</p>
                </div>
            )}
        </div>
    );
}

function SectionHeadingBlock({ data, mode }) {
    const titleSize =
        mode === 'live_proyektor'
            ? 'text-4xl sm:text-5xl'
            : mode === 'editor_guru'
              ? 'text-xl'
              : 'text-2xl';

    return (
        <div className={mode === 'editor_guru' ? 'py-1' : 'py-2'}>
            <span
                className={`mb-3 block h-1 w-14 rounded-full ${
                    mode === 'live_proyektor' ? 'bg-emerald-400' : 'bg-emerald-600'
                }`}
            />
            <h3
                className={`font-display font-bold leading-tight ${
                    mode === 'live_proyektor' ? 'text-white' : 'text-emerald-950'
                } ${titleSize}`}
            >
                {data.title}
            </h3>
            {data.body && (
                <p
                    className={`mt-2 max-w-2xl ${
                        mode === 'live_proyektor'
                            ? 'text-xl leading-relaxed text-zinc-300'
                            : 'text-sm leading-6 text-zinc-500'
                    }`}
                >
                    {data.body}
                </p>
            )}
        </div>
    );
}

function VideoBlock({ data, mode }) {
    const videoId = youtubeVideoId(data.url);
    const isYoutube = data.source === 'youtube' || videoId !== null;

    return (
        <figure>
            <Heading mode={mode} kicker={BLOCK_LABELS.materi_video}>
                {data.title}
            </Heading>
            {isYoutube && videoId ? (
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                    <iframe
                        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                        title={data.title || 'Video materi'}
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="h-full w-full"
                    />
                </div>
            ) : data.url ? (
                <video controls src={data.url} className="aspect-video w-full rounded-lg bg-black" />
            ) : (
                <div
                    className={`flex aspect-video items-center justify-center rounded-lg border border-dashed text-xs ${
                        mode === 'live_proyektor'
                            ? 'border-zinc-700 text-zinc-500'
                            : 'border-zinc-200 text-zinc-400'
                    }`}
                >
                    Belum ada video.
                </div>
            )}
            {data.caption && (
                <figcaption
                    className={`mt-2 text-center ${
                        mode === 'live_proyektor' ? 'text-lg text-zinc-400' : 'text-xs text-zinc-500'
                    }`}
                >
                    {data.caption}
                </figcaption>
            )}
        </figure>
    );
}

function FileBlock({ data, mode }) {
    return (
        <div>
            <Heading mode={mode} kicker={BLOCK_LABELS.materi_file}>
                {data.title}
            </Heading>
            {data.files.length === 0 ? (
                <p className={`text-xs ${mode === 'live_proyektor' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Belum ada berkas terlampir.
                </p>
            ) : (
                <div className="space-y-2">
                    {data.files.map((file, fileIndex) => (
                        <div
                            key={`${file.url}-${fileIndex}`}
                            className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 ${
                                mode === 'live_proyektor'
                                    ? 'border-zinc-700 bg-zinc-900'
                                    : 'border-zinc-200 bg-white'
                            }`}
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                className={`h-8 w-8 shrink-0 ${mode === 'live_proyektor' ? 'text-emerald-400' : 'text-emerald-700'}`}
                                aria-hidden="true"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M7 3h7l4 4v14H7z M14 3v4h4 M10 12h5 M10 16h5"
                                />
                            </svg>
                            <span className="min-w-0 flex-1">
                                <span
                                    className={`block truncate font-medium ${
                                        mode === 'live_proyektor' ? 'text-lg text-zinc-100' : 'text-sm text-zinc-800'
                                    }`}
                                >
                                    {file.name || 'Berkas'}
                                </span>
                                {formatBytes(file.size) && (
                                    <span className={`font-mono text-[11px] ${mode === 'live_proyektor' ? 'text-zinc-400' : 'text-zinc-400'}`}>
                                        {formatBytes(file.size)}
                                    </span>
                                )}
                            </span>
                            <a
                                href={file.url}
                                download
                                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                                    mode === 'live_proyektor'
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                            >
                                Unduh
                            </a>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function EmbedBlock({ data, mode }) {
    let hostname = '';
    try {
        hostname = data.url ? new URL(data.url).hostname : '';
    } catch {
        hostname = '';
    }

    return (
        <div>
            <Heading mode={mode} kicker={BLOCK_LABELS.materi_embed}>
                {data.title}
            </Heading>
            {data.url ? (
                <>
                    {data.embed ? (
                        <div
                            className={`aspect-video w-full overflow-hidden rounded-lg border ${
                                mode === 'live_proyektor' ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-200 bg-white'
                            }`}
                        >
                            <iframe
                                src={data.url}
                                title={data.title || 'Konten tersemat'}
                                loading="lazy"
                                allowFullScreen
                                className="h-full w-full"
                            />
                        </div>
                    ) : (
                        <a
                            href={data.url}
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                                mode === 'live_proyektor'
                                    ? 'border-zinc-700 bg-zinc-900 hover:border-emerald-600'
                                    : 'border-zinc-200 bg-white hover:border-emerald-300 hover:bg-emerald-50'
                            }`}
                        >
                            <span className="min-w-0 flex-1">
                                <span
                                    className={`block truncate font-medium ${
                                        mode === 'live_proyektor' ? 'text-lg text-zinc-100' : 'text-sm text-zinc-800'
                                    }`}
                                >
                                    {hostname || data.url}
                                </span>
                                <span className={`block truncate text-xs ${mode === 'live_proyektor' ? 'text-zinc-400' : 'text-zinc-400'}`}>
                                    {data.url}
                                </span>
                            </span>
                            <span className={`shrink-0 text-lg ${mode === 'live_proyektor' ? 'text-emerald-400' : 'text-emerald-700'}`}>↗</span>
                        </a>
                    )}
                    {data.embed && (
                        <p className="mt-2">
                            <a
                                href={data.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`text-xs font-medium underline underline-offset-2 ${
                                    mode === 'live_proyektor' ? 'text-emerald-400' : 'text-emerald-700'
                                }`}
                            >
                                Buka di tab baru ↗
                            </a>
                        </p>
                    )}
                </>
            ) : (
                <p className={`text-xs ${mode === 'live_proyektor' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Belum ada tautan.
                </p>
            )}
            {data.caption && (
                <p className={`mt-2 ${mode === 'live_proyektor' ? 'text-lg text-zinc-400' : 'text-xs text-zinc-500'}`}>
                    {data.caption}
                </p>
            )}
        </div>
    );
}

function TrueFalseBlock({ data, mode, points, reveal, onSubmitAnswer, initialAnswer = null, initialCorrect = null }) {
    const [selected, setSelected] = useState(() =>
        typeof initialAnswer?.value === 'boolean' ? initialAnswer.value : null,
    );
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(() => initialAnswer != null);
    const [sending, setSending] = useState(false);
    const [lastCorrect, setLastCorrect] = useState(() =>
        typeof initialCorrect === 'boolean' ? initialCorrect : null,
    );

    useEffect(() => {
        setSelected(typeof initialAnswer?.value === 'boolean' ? initialAnswer.value : null);
        setChecked(false);
        setSubmitted(initialAnswer != null);
        setLastCorrect(typeof initialCorrect === 'boolean' ? initialCorrect : null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.question]);

    const interactive = mode !== 'editor_guru' && mode !== 'live_proyektor';
    const showKey = mode === 'editor_guru' || reveal;

    function resetAttempt() {
        setSelected(null);
        setChecked(false);
        setSubmitted(false);
        setLastCorrect(null);
    }
    const choices = [
        { value: true, label: 'Benar', icon: '✓' },
        { value: false, label: 'Salah', icon: '✕' },
    ];

    return (
        <div>
            <QuestionHeader label="Benar / Salah" points={points} mode={mode} />
            <p className={`mb-4 font-medium ${mode === 'live_proyektor' ? 'text-2xl sm:text-3xl' : 'text-sm'}`}>
                {data.question}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
                {choices.map((choice) => {
                    const isSelected = selected === choice.value;
                    const isCorrect = data.answerKey !== null && choice.value === data.answerKey;
                    const tone = showKey && isCorrect
                        ? mode === 'live_proyektor'
                            ? 'border-emerald-700 bg-emerald-950/50'
                            : 'border-emerald-300 bg-emerald-50'
                        : isSelected
                          ? mode === 'live_proyektor'
                              ? 'border-emerald-500 bg-zinc-800'
                              : 'border-emerald-400 bg-white'
                          : mode === 'live_proyektor'
                            ? 'border-zinc-700 bg-zinc-900'
                            : 'border-zinc-200 bg-white hover:border-emerald-300';

                    return (
                        <button
                            key={String(choice.value)}
                            type="button"
                            disabled={!interactive}
                            onClick={() => {
                                setSelected(choice.value);
                                setChecked(false);
                            }}
                            className={`flex items-center justify-center gap-2 rounded-lg border px-3.5 py-4 text-center transition-colors disabled:cursor-default ${tone}`}
                        >
                            <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                                    choice.value
                                        ? 'border-emerald-300 text-emerald-600'
                                        : 'border-red-300 text-red-500'
                                }`}
                            >
                                {choice.icon}
                            </span>
                            <span className={`font-semibold ${mode === 'live_proyektor' ? 'text-2xl' : 'text-base'}`}>
                                {choice.label}
                            </span>
                            {showKey && isCorrect && (
                                <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">
                                    kunci
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {interactive && (
                <div className="mt-4 flex items-center gap-3">
                    {onSubmitAnswer ? (
                        <>
                            <button
                                type="button"
                                disabled={selected === null || sending}
                                onClick={() =>
                                    submitAndMark(
                                        onSubmitAnswer,
                                        { value: selected },
                                        setSubmitted,
                                        setSending,
                                        (result) => setLastCorrect((prev) => correctFromResult(result) ?? prev),
                                    )
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {sending ? 'Mengirim...' : submitted ? 'Kirim Ulang Jawaban' : 'Kirim Jawaban'}
                            </button>
                            {submitted && lastCorrect === null && (
                                <span className="text-xs font-medium text-emerald-700">Jawaban terkirim.</span>
                            )}
                            {submitted && lastCorrect === true && (
                                <span className="text-xs font-medium text-emerald-700">Tepat ✓</span>
                            )}
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                disabled={selected === null}
                                onClick={() => setChecked(true)}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Periksa Jawaban
                            </button>
                            {checked && selected !== null && data.answerKey !== null && (
                                <span
                                    className={`text-xs font-medium ${
                                        selected === data.answerKey ? 'text-emerald-700' : 'text-red-600'
                                    }`}
                                >
                                    {selected === data.answerKey ? 'Tepat.' : 'Belum tepat, coba lagi.'}
                                </span>
                            )}
                        </>
                    )}
                </div>
            )}

            {mode === 'mandiri_siswa' &&
                interactive &&
                (lastCorrect === false ||
                    (checked && selected !== null && data.answerKey !== null && selected !== data.answerKey)) && (
                    <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs font-medium text-red-600">Jawaban belum tepat.</span>
                        <button
                            type="button"
                            onClick={resetAttempt}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                            Coba lagi
                        </button>
                    </div>
                )}

            {data.explanation && (mode === 'editor_guru' || checked || reveal) && (
                <p
                    className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                        mode === 'live_proyektor'
                            ? 'border-zinc-700 bg-zinc-800 text-zinc-300'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                    }`}
                >
                    {data.explanation}
                </p>
            )}
        </div>
    );
}

function normalizeFillBlankClient(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function FillBlankBlock({ data, mode, points, reveal, onSubmitAnswer, initialAnswer = null, initialCorrect = null }) {
    const [answer, setAnswer] = useState(() => (typeof initialAnswer?.text === 'string' ? initialAnswer.text : ''));
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(() => initialAnswer != null);
    const [sending, setSending] = useState(false);
    const [lastCorrect, setLastCorrect] = useState(() =>
        typeof initialCorrect === 'boolean' ? initialCorrect : null,
    );

    useEffect(() => {
        setAnswer(typeof initialAnswer?.text === 'string' ? initialAnswer.text : '');
        setChecked(false);
        setSubmitted(initialAnswer != null);
        setLastCorrect(typeof initialCorrect === 'boolean' ? initialCorrect : null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.question]);

    function resetAttempt() {
        setAnswer('');
        setChecked(false);
        setSubmitted(false);
        setLastCorrect(null);
    }

    const interactive = mode !== 'editor_guru' && mode !== 'live_proyektor';
    const isCorrect =
        data.answers.length > 0 &&
        data.answers.some((accepted) => normalizeFillBlankClient(accepted) === normalizeFillBlankClient(answer));
    const questionParts = data.question.split('___');

    return (
        <div>
            <QuestionHeader label="Isian Singkat" points={points} mode={mode} />
            <p className={`mb-4 font-medium ${mode === 'live_proyektor' ? 'text-2xl sm:text-3xl' : 'text-sm'}`}>
                {questionParts.map((part, partIndex) => (
                    <span key={partIndex}>
                        {partIndex > 0 && (
                            <span className="mx-1 inline-block min-w-[4.5rem] border-b-2 border-emerald-500 align-baseline">
                                &nbsp;
                            </span>
                        )}
                        {part}
                    </span>
                ))}
            </p>

            {interactive ? (
                <>
                    <input
                        type="text"
                        value={answer}
                        onChange={(event) => {
                            setAnswer(event.target.value);
                            setChecked(false);
                            setSubmitted(false);
                        }}
                        placeholder="Tulis jawabanmu di sini..."
                        className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                            mode === 'live_proyektor'
                                ? 'border-zinc-600 bg-zinc-800 text-white'
                                : 'border-zinc-200 bg-white text-zinc-900'
                        }`}
                    />
                    <div className="mt-3 flex items-center gap-3">
                        {onSubmitAnswer ? (
                            <>
                                <button
                                    type="button"
                                    disabled={answer.trim().length === 0 || sending}
                                    onClick={() =>
                                        submitAndMark(
                                            onSubmitAnswer,
                                            { text: answer },
                                            setSubmitted,
                                            setSending,
                                            (result) =>
                                                setLastCorrect((prev) => correctFromResult(result) ?? prev),
                                        )
                                    }
                                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {sending ? 'Mengirim...' : submitted ? 'Kirim Ulang Jawaban' : 'Kirim Jawaban'}
                                </button>
                                {submitted && lastCorrect === null && (
                                    <span className="text-xs font-medium text-emerald-700">Jawaban terkirim.</span>
                                )}
                                {submitted && lastCorrect === true && (
                                    <span className="text-xs font-medium text-emerald-700">Tepat ✓</span>
                                )}
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    disabled={answer.trim().length === 0}
                                    onClick={() => setChecked(true)}
                                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Periksa Jawaban
                                </button>
                                {checked && data.answers.length > 0 && (
                                    <span className={`text-xs font-medium ${isCorrect ? 'text-emerald-700' : 'text-red-600'}`}>
                                        {isCorrect ? 'Tepat.' : 'Belum tepat, coba lagi.'}
                                    </span>
                                )}
                            </>
                        )}
                    </div>

                    {mode === 'mandiri_siswa' &&
                        (lastCorrect === false || (checked && data.answers.length > 0 && !isCorrect)) && (
                            <div className="mt-3 flex items-center gap-3">
                                <span className="text-xs font-medium text-red-600">Jawaban belum tepat.</span>
                                <button
                                    type="button"
                                    onClick={resetAttempt}
                                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                                >
                                    Coba lagi
                                </button>
                            </div>
                        )}
                </>
            ) : (
                <div
                    className={`rounded-lg border border-dashed px-3 py-6 text-center text-xs ${
                        mode === 'live_proyektor'
                            ? 'border-zinc-700 text-zinc-500'
                            : 'border-zinc-200 text-zinc-400'
                    }`}
                >
                    Siswa mengetik jawaban singkat pada perangkat masing-masing.
                </div>
            )}

            {(mode === 'editor_guru' || reveal) && data.answers.length > 0 && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    Kunci: {data.answers.join(' / ')}
                </div>
            )}

            {data.explanation && (mode === 'editor_guru' || checked || reveal) && (
                <p
                    className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                        mode === 'live_proyektor'
                            ? 'border-zinc-700 bg-zinc-800 text-zinc-300'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                    }`}
                >
                    {data.explanation}
                </p>
            )}
        </div>
    );
}

function assignmentsFromSaved(spots, savedAssignments) {
    if (!savedAssignments || typeof savedAssignments !== 'object') return {};

    const result = {};
    spots.forEach((spot, index) => {
        const value = savedAssignments[index] ?? savedAssignments[String(index)];
        if (typeof value === 'string' && value !== '') {
            result[index] = value;
        }
    });
    return result;
}

function HotspotBlock({ data, mode, points, reveal, onSubmitAnswer, initialAnswer = null, initialCorrect = null }) {
    // Label tersedia dari spots (konten penuh) atau daftar terpisah pada
    // payload siswa live (server sudah memisahkan label dari titiknya).
    const allLabels = useMemo(() => {
        const fromSpots = data.spots.map((spot) => spot.label).filter(Boolean);
        return data.labels.length > 0 ? data.labels : [...new Set(fromSpots)];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.spots.map((spot) => spot.label).join('|'), data.labels.join('|')]);

    // Urutan opsi diacak SEKALI per mount agar tidak berubah di tengah menjawab.
    const [shuffledLabels] = useState(() => {
        const copy = [...allLabels];
        for (let position = copy.length - 1; position > 0; position -= 1) {
            const swap = Math.floor(Math.random() * (position + 1));
            [copy[position], copy[swap]] = [copy[swap], copy[position]];
        }
        return copy;
    });

    const [assignments, setAssignments] = useState(() =>
        assignmentsFromSaved(data.spots, initialAnswer?.assignments),
    );
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(() => initialAnswer != null);
    const [sending, setSending] = useState(false);
    const [lastCorrect, setLastCorrect] = useState(() =>
        typeof initialCorrect === 'boolean' ? initialCorrect : null,
    );

    const spotsSignature = data.spots.map((spot) => `${spot.x},${spot.y},${spot.label}`).join('|');
    useEffect(() => {
        setAssignments(assignmentsFromSaved(data.spots, initialAnswer?.assignments));
        setChecked(false);
        setSubmitted(initialAnswer != null);
        setLastCorrect(typeof initialCorrect === 'boolean' ? initialCorrect : null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.question, data.imageUrl, spotsSignature]);

    function resetAttempt() {
        setAssignments({});
        setChecked(false);
        setSubmitted(false);
        setLastCorrect(null);
    }

    const interactive = mode !== 'editor_guru' && mode !== 'live_proyektor';
    const showKey = mode === 'editor_guru' || reveal;
    const allCorrect =
        !data.keyless &&
        data.spots.length > 0 &&
        data.spots.every((spot, index) => assignments[index] === spot.label);
    const allAssigned = data.spots.length > 0 && data.spots.every((_, index) => assignments[index]);

    return (
        <div>
            <QuestionHeader label="Labeli Gambar / Hotspot" points={points} mode={mode} />
            <p className={`mb-4 font-medium ${mode === 'live_proyektor' ? 'text-2xl sm:text-3xl' : 'text-sm'}`}>
                {data.question}
            </p>

            {data.imageUrl ? (
                <div className="relative select-none overflow-hidden rounded-lg border border-zinc-200">
                    <img src={data.imageUrl} alt={data.question || 'Gambar hotspot'} className="block w-full" />
                    {data.spots.map((spot, index) => (
                        <span
                            key={index}
                            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5"
                            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                        >
                            <span
                                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white font-mono text-xs font-bold text-white shadow ${
                                    interactive && assignments[index] ? 'bg-emerald-500' : 'bg-emerald-600'
                                }`}
                            >
                                {index + 1}
                            </span>
                            {showKey && spot.label && (
                                <span className="rounded bg-zinc-900/85 px-1.5 py-0.5 text-[11px] font-medium text-white">
                                    {spot.label}
                                </span>
                            )}
                        </span>
                    ))}
                </div>
            ) : (
                <div
                    className={`flex aspect-video items-center justify-center rounded-lg border border-dashed text-xs ${
                        mode === 'live_proyektor' ? 'border-zinc-700 text-zinc-500' : 'border-zinc-200 text-zinc-400'
                    }`}
                >
                    Belum ada gambar.
                </div>
            )}

            {interactive && (
                <>
                    <div className="mt-4 space-y-2">
                        {data.spots.map((spot, index) => (
                            <div
                                key={index}
                                className="grid grid-cols-[auto_1fr] items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 py-2.5"
                            >
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 font-mono text-xs font-bold text-white">
                                    {index + 1}
                                </span>
                                <select
                                    value={assignments[index] ?? ''}
                                    onChange={(event) => {
                                        setAssignments((prev) => ({ ...prev, [index]: event.target.value }));
                                        setChecked(false);
                                    }}
                                    className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                                >
                                    <option value="">— pilih label titik {index + 1} —</option>
                                    {shuffledLabels.map((label) => (
                                        <option key={label} value={label}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                        {onSubmitAnswer ? (
                            <>
                                <button
                                    type="button"
                                    disabled={!allAssigned || sending}
                                    onClick={() =>
                                        submitAndMark(
                                            onSubmitAnswer,
                                            {
                                                assignments: Object.fromEntries(
                                                    data.spots.map((_, index) => [
                                                        String(index),
                                                        assignments[index] ?? '',
                                                    ]),
                                                ),
                                            },
                                            setSubmitted,
                                            setSending,
                                            (result) =>
                                                setLastCorrect((prev) => correctFromResult(result) ?? prev),
                                        )
                                    }
                                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {sending ? 'Mengirim...' : submitted ? 'Kirim Ulang Label' : 'Kirim Label'}
                                </button>
                                {submitted && (
                                    <span className="text-xs font-medium text-emerald-700">Label terkirim.</span>
                                )}
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    disabled={!allAssigned}
                                    onClick={() => setChecked(true)}
                                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Periksa Label
                                </button>
                                {checked && !data.keyless && (
                                    <span
                                        className={`text-xs font-medium ${allCorrect ? 'text-emerald-700' : 'text-red-600'}`}
                                    >
                                        {allCorrect ? 'Semua label tepat.' : 'Masih ada label yang belum tepat.'}
                                    </span>
                                )}
                            </>
                        )}
                    </div>

                    {mode === 'mandiri_siswa' &&
                        (lastCorrect === false || (checked && !data.keyless && !allCorrect)) && (
                            <div className="mt-3 flex items-center gap-3">
                                <span className="text-xs font-medium text-red-600">
                                    Masih ada label yang belum tepat.
                                </span>
                                <button
                                    type="button"
                                    onClick={resetAttempt}
                                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                                >
                                    Coba lagi
                                </button>
                            </div>
                        )}
                </>
            )}

            {data.explanation && (mode === 'editor_guru' || checked || reveal) && (
                <p
                    className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                        mode === 'live_proyektor'
                            ? 'border-zinc-700 bg-zinc-800 text-zinc-300'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                    }`}
                >
                    {data.explanation}
                </p>
            )}
        </div>
    );
}

function PollingBlock({ data, mode, onSubmitAnswer, initialAnswer = null, pollResults = null }) {
    const [selected, setSelected] = useState(() =>
        Number.isInteger(initialAnswer?.option_index) ? initialAnswer.option_index : null,
    );
    const [submitted, setSubmitted] = useState(() => initialAnswer != null);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        setSelected(Number.isInteger(initialAnswer?.option_index) ? initialAnswer.option_index : null);
        setSubmitted(initialAnswer != null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.question, data.options.length]);

    const interactive = mode !== 'editor_guru' && mode !== 'live_proyektor';
    const locked = submitted;

    // Tampilan proyektor dengan hasil agregat dari panggung guru.
    if (mode === 'live_proyektor' && pollResults) {
        const counts = data.options.map((_, index) => Number(pollResults.counts?.[index]) || 0);
        const total = Number(pollResults.total) || counts.reduce((sum, count) => sum + count, 0);

        return (
            <div>
                <QuestionHeader label="Polling Kilat" points={0} mode={mode} />
                <p className="mb-5 font-medium text-2xl sm:text-3xl">{data.question}</p>
                <div className="space-y-3">
                    {data.options.map((option, index) => {
                        const percent = total > 0 ? Math.round((counts[index] / total) * 100) : 0;

                        return (
                            <div key={index}>
                                <div className="mb-1 flex items-baseline justify-between gap-3">
                                    <span className="text-xl text-zinc-100">{option.text}</span>
                                    <span className="font-mono text-sm text-emerald-400">
                                        {counts[index]} suara · {percent}%
                                    </span>
                                </div>
                                <div className="h-3.5 overflow-hidden rounded-full bg-zinc-800">
                                    <div
                                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                        style={{ width: `${percent}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
                <p className="mt-4 font-mono text-xs uppercase tracking-widest text-zinc-500">
                    Total {total} suara masuk
                </p>
            </div>
        );
    }

    return (
        <div>
            <QuestionHeader label="Polling Kilat" points={0} mode={mode} />
            <p className={`mb-4 font-medium ${mode === 'live_proyektor' ? 'text-2xl sm:text-3xl' : 'text-sm'}`}>
                {data.question}
            </p>
            <div className="space-y-2.5">
                {data.options.map((option, index) => {
                    const isSelected = selected === index;
                    const tone = isSelected
                        ? mode === 'live_proyektor'
                            ? 'border-emerald-500 bg-zinc-800'
                            : 'border-emerald-400 bg-emerald-50'
                        : mode === 'live_proyektor'
                          ? 'border-zinc-700 bg-zinc-900'
                          : 'border-zinc-200 bg-white hover:border-emerald-300';

                    return (
                        <button
                            key={index}
                            type="button"
                            disabled={!interactive || locked}
                            onClick={() => setSelected(index)}
                            className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors disabled:cursor-default ${tone}`}
                        >
                            <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${
                                    isSelected
                                        ? 'border-emerald-500 bg-emerald-600 text-white'
                                        : mode === 'live_proyektor'
                                          ? 'border-zinc-600 text-zinc-300'
                                          : 'border-zinc-300 text-zinc-500'
                                }`}
                            >
                                {isSelected ? '✓' : String.fromCharCode(65 + index)}
                            </span>
                            <span className={`flex-1 ${mode === 'live_proyektor' ? 'text-xl' : 'text-sm'}`}>
                                {option.text}
                            </span>
                        </button>
                    );
                })}
            </div>

            {interactive && (
                <div className="mt-4 flex items-center gap-3">
                    {locked ? (
                        <span className="text-xs font-medium text-emerald-700">
                            Suara terkirim ✓ — pilihanmu terkunci.
                        </span>
                    ) : (
                        <>
                            <button
                                type="button"
                                disabled={selected === null || sending}
                                onClick={() =>
                                    submitAndMark(
                                        onSubmitAnswer,
                                        { option_index: selected },
                                        setSubmitted,
                                        setSending,
                                    )
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {sending ? 'Mengirim...' : 'Kirim Suara'}
                            </button>
                            <span className="text-xs text-zinc-500">Polling tidak dinilai.</span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function checkedFromSaved(steps, savedChecked) {
    if (!Array.isArray(savedChecked)) return [];

    return savedChecked
        .map((value) => Number(value))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < steps.length);
}

function photosFromSaved(savedPhotos) {
    const result = {};

    if (savedPhotos && typeof savedPhotos === 'object' && !Array.isArray(savedPhotos)) {
        for (const [key, value] of Object.entries(savedPhotos)) {
            if (typeof value === 'string' && value) result[String(key)] = value;
        }
    }

    return result;
}

function ChecklistBlock({ data, mode, onSubmitAnswer, initialAnswer = null, studentUploadUrl = null }) {
    const steps = data.checkSteps;
    const [checked, setChecked] = useState(() => checkedFromSaved(steps, initialAnswer?.checked));
    const [photos, setPhotos] = useState(() => photosFromSaved(initialAnswer?.photos));
    const [submitted, setSubmitted] = useState(() => initialAnswer != null);
    const [sending, setSending] = useState(false);
    const [uploadingIndex, setUploadingIndex] = useState(null);
    const [error, setError] = useState(null);
    const fileInputs = useRef({});

    useEffect(() => {
        setChecked(checkedFromSaved(steps, initialAnswer?.checked));
        setPhotos(photosFromSaved(initialAnswer?.photos));
        setSubmitted(initialAnswer != null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.title, steps.length]);

    const interactive = mode === 'live_hp_siswa' || mode === 'mandiri_siswa';
    const canUpload = interactive && Boolean(studentUploadUrl);
    const allDone =
        steps.length > 0 &&
        steps.every(
            (step, index) => checked.includes(index) && (!step.requirePhoto || Boolean(photos[String(index)])),
        );

    function persist(nextChecked, nextPhotos) {
        const payload = { checked: nextChecked, photos: nextPhotos };
        if (onSubmitAnswer) {
            submitAndMark(onSubmitAnswer, payload, setSubmitted, setSending);
        } else {
            setSubmitted(true);
        }
    }

    function toggleStep(index) {
        const next = checked.includes(index)
            ? checked.filter((item) => item !== index)
            : [...checked, index].sort((a, b) => a - b);
        setChecked(next);
        persist(next, photos);
    }

    async function handlePhoto(event, index) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !studentUploadUrl) return;

        setUploadingIndex(index);
        setError(null);
        try {
            const payload = await uploadStudentFile(file, studentUploadUrl);
            const next = { ...photos, [String(index)]: payload.url };
            setPhotos(next);
            persist(checked, next);
        } catch (caught) {
            setError(caught.message || 'Gagal mengunggah foto.');
        } finally {
            setUploadingIndex(null);
        }
    }

    return (
        <div>
            <Heading mode={mode} kicker={BLOCK_LABELS.praktik_checklist}>
                {data.title}
            </Heading>
            {data.instructions && <BodyText mode={mode}>{data.instructions}</BodyText>}

            <div className={`mt-4 space-y-2 ${mode === 'live_proyektor' ? 'text-xl' : ''}`}>
                {steps.map((step, index) => {
                    const isChecked = checked.includes(index);
                    const photo = photos[String(index)];

                    return (
                        <div
                            key={index}
                            className={`rounded-lg border px-3.5 py-3 ${
                                mode === 'live_proyektor'
                                    ? 'border-zinc-700 bg-zinc-900'
                                    : isChecked
                                      ? 'border-emerald-300 bg-emerald-50/60'
                                      : 'border-zinc-200 bg-white'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <button
                                    type="button"
                                    disabled={!interactive}
                                    onClick={() => toggleStep(index)}
                                    aria-pressed={isChecked}
                                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm transition-colors disabled:cursor-default ${
                                        isChecked
                                            ? 'border-emerald-600 bg-emerald-600 text-white'
                                            : mode === 'live_proyektor'
                                              ? 'border-zinc-600 text-transparent'
                                              : 'border-zinc-300 text-transparent hover:border-emerald-400'
                                    }`}
                                >
                                    ✓
                                </button>
                                <div className="min-w-0 flex-1">
                                    <p
                                        className={`${
                                            mode === 'live_proyektor'
                                                ? 'text-xl text-zinc-100'
                                                : 'text-sm text-zinc-800'
                                        } ${isChecked && mode !== 'live_proyektor' ? 'text-zinc-500 line-through' : ''}`}
                                    >
                                        <span className="mr-2 font-mono text-xs text-emerald-600">
                                            {String(index + 1).padStart(2, '0')}
                                        </span>
                                        {step.label}
                                        {step.requirePhoto && (
                                            <span
                                                className="ml-2 align-middle font-mono text-[10px] uppercase tracking-wider text-amber-600"
                                                title="Langkah ini wajib dilampiri foto"
                                            >
                                                📷 wajib foto
                                            </span>
                                        )}
                                    </p>

                                    {step.requirePhoto && (
                                        <div className="mt-2">
                                            {photo ? (
                                                <div className="flex items-center gap-3">
                                                    <img
                                                        src={photo}
                                                        alt={`Foto bukti langkah ${index + 1}`}
                                                        className="h-14 w-14 rounded-lg border border-zinc-200 object-cover"
                                                    />
                                                    {canUpload && (
                                                        <button
                                                            type="button"
                                                            onClick={() => fileInputs.current[index]?.click()}
                                                            className="text-xs font-medium text-emerald-700 hover:underline"
                                                        >
                                                            Ganti foto
                                                        </button>
                                                    )}
                                                </div>
                                            ) : canUpload ? (
                                                <button
                                                    type="button"
                                                    disabled={uploadingIndex === index}
                                                    onClick={() => fileInputs.current[index]?.click()}
                                                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    {uploadingIndex === index ? 'Mengunggah...' : '📷 Unggah foto bukti'}
                                                </button>
                                            ) : interactive ? (
                                                <p className="text-xs text-zinc-400">
                                                    Foto bukti diunggah dari halaman siswa.
                                                </p>
                                            ) : null}
                                            <input
                                                ref={(element) => {
                                                    fileInputs.current[index] = element;
                                                }}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(event) => handlePhoto(event, index)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-4">
                <div className="flex items-center justify-between gap-3 text-xs">
                    <span className={mode === 'live_proyektor' ? 'text-zinc-400' : 'text-zinc-500'}>
                        {checked.length} dari {steps.length} langkah tercentang
                        {sending ? ' · menyimpan...' : submitted ? ' · tersimpan ✓' : ''}
                    </span>
                    {allDone && (
                        <span className="font-medium text-emerald-700">Checklist tuntas 🎉</span>
                    )}
                </div>
                <div
                    className={`mt-1.5 h-2 overflow-hidden rounded-full ${
                        mode === 'live_proyektor' ? 'bg-zinc-800' : 'bg-zinc-100'
                    }`}
                >
                    <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${steps.length ? (checked.length / steps.length) * 100 : 0}%` }}
                    />
                </div>
                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            </div>
        </div>
    );
}

function TugasUploadBlock({
    data,
    mode,
    points,
    onSubmitAssignment = null,
    submission = null,
    studentUploadUrl = null,
}) {
    const [current, setCurrent] = useState(submission);
    const [files, setFiles] = useState(() => submission?.files ?? []);
    const [note, setNote] = useState(() => submission?.note ?? '');
    const [uploading, setUploading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const fileInput = useRef(null);

    useEffect(() => {
        setCurrent(submission);
        setFiles(submission?.files ?? []);
        setNote(submission?.note ?? '');
    }, [submission]);

    const interactive = mode === 'mandiri_siswa' && Boolean(onSubmitAssignment);
    const acceptAttr = data.acceptKind === 'image' ? 'image/*' : data.acceptKind === 'video' ? 'video/*' : undefined;
    const acceptLabel =
        data.acceptKind === 'image'
            ? 'gambar'
            : data.acceptKind === 'video'
              ? 'video'
              : 'berkas (gambar, video, atau dokumen)';

    async function handleUpload(event) {
        const picked = [...(event.target.files ?? [])];
        event.target.value = '';
        if (picked.length === 0 || !studentUploadUrl) return;

        setUploading(true);
        setError(null);
        try {
            const uploaded = [];
            for (const file of picked) {
                const payload = await uploadStudentFile(file, studentUploadUrl);
                uploaded.push({ name: payload.name, url: payload.url, size: payload.size });
            }
            setFiles((existing) => [...existing, ...uploaded].slice(0, data.maxFiles));
        } catch (caught) {
            setError(caught.message || 'Gagal mengunggah berkas.');
        } finally {
            setUploading(false);
        }
    }

    async function handleSubmit() {
        if (!onSubmitAssignment || files.length === 0) return;

        setSending(true);
        setError(null);
        try {
            const result = await onSubmitAssignment({ files, note: note || null });
            if (result === false) {
                setError('Gagal mengumpulkan tugas. Coba lagi.');
            } else if (result?.submission) {
                setCurrent(result.submission);
            }
        } finally {
            setSending(false);
        }
    }

    return (
        <div>
            <div className="mb-3 flex items-center gap-2">
                <span
                    className={`font-mono text-[11px] uppercase tracking-widest ${
                        mode === 'live_proyektor' ? 'text-emerald-400' : 'text-emerald-700'
                    }`}
                >
                    {BLOCK_LABELS.tugas_upload}
                </span>
                <PointsBadge points={points} mode={mode} />
            </div>
            <Heading mode={mode}>{data.title}</Heading>
            {data.instructions && <BodyText mode={mode}>{data.instructions}</BodyText>}

            {data.rubric.length > 0 && (
                <div
                    className={`mt-3 rounded-lg border px-3.5 py-3 ${
                        mode === 'live_proyektor' ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-200 bg-zinc-50/60'
                    }`}
                >
                    <p
                        className={`font-mono text-[10px] uppercase tracking-wider ${
                            mode === 'live_proyektor' ? 'text-zinc-400' : 'text-zinc-400'
                        }`}
                    >
                        Rubrik penilaian
                    </p>
                    <ul className={`mt-1.5 space-y-1 ${mode === 'live_proyektor' ? 'text-lg text-zinc-200' : 'text-sm text-zinc-700'}`}>
                        {data.rubric.map((item, index) => (
                            <li key={index} className="flex items-baseline justify-between gap-3">
                                <span>{item.criterion}</span>
                                <span className="font-mono text-xs text-zinc-400">maks {item.maxScore}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {mode === 'live_hp_siswa' || mode === 'live_proyektor' ? (
                <p
                    className={`mt-4 rounded-lg border px-3.5 py-3 ${
                        mode === 'live_proyektor'
                            ? 'border-zinc-700 bg-zinc-900 text-lg text-zinc-300'
                            : 'border-amber-200 bg-amber-50 text-sm text-amber-700'
                    }`}
                >
                    📥 Tugas ini dikumpulkan lewat halaman <strong>Belajar Mandiri</strong>, bukan di sesi
                    live ini.
                </p>
            ) : interactive ? (
                <div className="mt-4 space-y-3">
                    {current?.status === 'graded' ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3">
                            <p className="text-sm font-semibold text-emerald-800">
                                Sudah dinilai · Skor {Number(current.score)}%
                            </p>
                            {Array.isArray(current.rubric_scores) && (
                                <ul className="mt-1.5 space-y-1 text-sm text-emerald-700">
                                    {data.rubric.map((item, index) => (
                                        <li key={index} className="flex items-baseline justify-between gap-3">
                                            <span>{item.criterion}</span>
                                            <span className="font-mono text-xs">
                                                {current.rubric_scores[index] ?? 0} / {item.maxScore}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {current.feedback && (
                                <p className="mt-2 whitespace-pre-line text-sm text-emerald-700">
                                    💬 {current.feedback}
                                </p>
                            )}
                            <p className="mt-2 text-xs text-emerald-600">
                                Kamu masih bisa mengumpulkan ulang — nilai lama akan diganti setelah
                                dinilai kembali.
                            </p>
                        </div>
                    ) : current ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
                            ⏳ Sudah dikumpulkan — menunggu dinilai guru. Kamu bisa mengumpulkan ulang
                            bila ada perbaikan.
                        </p>
                    ) : null}

                    <div className="space-y-2">
                        {files.map((file, index) => (
                            <div
                                key={`${file.url}-${index}`}
                                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2"
                            >
                                <span className="text-base">📎</span>
                                <a
                                    href={file.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="min-w-0 flex-1 truncate text-sm text-zinc-700 hover:text-emerald-700"
                                >
                                    {file.name}
                                </a>
                                <span className="font-mono text-[11px] text-zinc-400">
                                    {formatBytes(file.size)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setFiles((existing) => existing.filter((_, i) => i !== index))}
                                    className="text-xs text-red-500 hover:underline"
                                >
                                    Hapus
                                </button>
                            </div>
                        ))}
                    </div>

                    <input
                        ref={fileInput}
                        type="file"
                        multiple
                        accept={acceptAttr}
                        className="hidden"
                        onChange={handleUpload}
                    />
                    <button
                        type="button"
                        disabled={uploading || files.length >= data.maxFiles || !studentUploadUrl}
                        onClick={() => fileInput.current?.click()}
                        className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {uploading ? 'Mengunggah...' : `+ Unggah ${acceptLabel}`}
                    </button>
                    <span className="ml-2 text-xs text-zinc-400">
                        {files.length}/{data.maxFiles} berkas
                    </span>

                    <textarea
                        rows={3}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Catatan untuk guru (opsional) — mis. kendala saat praktik."
                        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 focus:border-emerald-500 focus:outline-none"
                    />

                    {error && <p className="text-xs text-red-600">{error}</p>}

                    <button
                        type="button"
                        disabled={sending || uploading || files.length === 0}
                        onClick={handleSubmit}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {sending ? 'Mengumpulkan...' : current ? 'Kumpulkan Ulang Tugas' : 'Kumpulkan Tugas'}
                    </button>
                </div>
            ) : (
                <p className="mt-4 text-sm text-zinc-500">
                    Siswa mengumpulkan {acceptLabel} (maks {data.maxFiles} berkas) lewat halaman Belajar
                    Mandiri; nilai diisi guru dari halaman Pengumpulan Tugas.
                </p>
            )}
        </div>
    );
}

function formatCheckpointTime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function InteractiveVideoBlock({ data, mode, onSubmitAnswer, initialAnswer = null }) {
    const videoRef = useRef(null);
    const interactive = mode === 'live_hp_siswa' || mode === 'mandiri_siswa';
    const checkpoints = data.checkpoints;

    const savedAnswers = useMemo(() => {
        const result = {};
        const raw = initialAnswer?.answers ?? {};
        Object.entries(raw ?? {}).forEach(([key, value]) => {
            const optionIndex = Number(value);
            if (Number.isInteger(optionIndex)) result[key] = optionIndex;
        });
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(initialAnswer?.answers ?? {})]);

    const [answers, setAnswers] = useState(savedAnswers);
    const [answered, setAnswered] = useState(() => Object.keys(savedAnswers).map(Number));
    const [activeIndex, setActiveIndex] = useState(null);
    const [selection, setSelection] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        setAnswers(savedAnswers);
        setAnswered(Object.keys(savedAnswers).map(Number));
        setActiveIndex(null);
        setSelection(null);
        setFeedback(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.url, checkpoints.length]);

    const sortedCheckpoints = useMemo(
        () =>
            checkpoints
                .map((checkpoint, index) => ({ ...checkpoint, index }))
                .sort((a, b) => a.at - b.at),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [checkpoints.map((checkpoint) => `${checkpoint.at}:${checkpoint.question}`).join('|')],
    );

    function openCheckpoint(index) {
        const video = videoRef.current;
        if (video && !video.paused) video.pause();
        setActiveIndex(index);
        setSelection(answers[index] ?? null);
        setFeedback(null);
    }

    function guardPlayback() {
        if (!interactive || activeIndex !== null) return;

        const video = videoRef.current;
        if (!video) return;

        const next = sortedCheckpoints.find(
            (checkpoint) => !answered.includes(checkpoint.index) && video.currentTime >= checkpoint.at,
        );

        if (next) {
            if (video.currentTime > next.at + 0.05) {
                video.currentTime = next.at;
            }
            openCheckpoint(next.index);
        }
    }

    async function confirmAnswer() {
        if (activeIndex === null || selection === null || sending) return;

        const checkpoint = checkpoints[activeIndex];
        const cumulative = { ...answers, [activeIndex]: selection };
        const hasLocalKey = checkpoint && checkpoint.correctIndex !== null;

        if (onSubmitAnswer) {
            setSending(true);
            try {
                const ok = await onSubmitAnswer({ answers: cumulative });
                if (ok === false && !hasLocalKey) return; // server gagal: jangan tandai terjawab
            } finally {
                setSending(false);
            }
        }

        setAnswers(cumulative);
        setAnswered((current) => (current.includes(activeIndex) ? current : [...current, activeIndex]));

        if (hasLocalKey) {
            setFeedback({ correct: selection === checkpoint.correctIndex });
        } else {
            closeCheckpoint(true);
        }
    }

    function closeCheckpoint(resume) {
        setActiveIndex(null);
        setSelection(null);
        setFeedback(null);
        if (resume) videoRef.current?.play().catch(() => {});
    }

    const activeCheckpoint = activeIndex !== null ? checkpoints[activeIndex] : null;

    return (
        <figure>
            <Heading mode={mode} kicker={BLOCK_LABELS.materi_video_interaktif}>
                {data.title}
            </Heading>

            {data.url ? (
                <video
                    ref={videoRef}
                    controls
                    src={data.url}
                    onTimeUpdate={guardPlayback}
                    onSeeking={guardPlayback}
                    className="aspect-video w-full rounded-lg bg-black"
                />
            ) : (
                <div
                    className={`flex aspect-video items-center justify-center rounded-lg border border-dashed text-xs ${
                        mode === 'live_proyektor' ? 'border-zinc-700 text-zinc-500' : 'border-zinc-200 text-zinc-400'
                    }`}
                >
                    Belum ada video.
                </div>
            )}

            {checkpoints.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {checkpoints.map((checkpoint, index) => (
                        <span
                            key={index}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] ${
                                answered.includes(index)
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                    : mode === 'live_proyektor'
                                      ? 'border-zinc-700 bg-zinc-900 text-zinc-400'
                                      : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                            }`}
                        >
                            Checkpoint {index + 1} · {formatCheckpointTime(checkpoint.at)}
                            {answered.includes(index) ? ' ✓' : ''}
                        </span>
                    ))}
                </div>
            )}

            {interactive && activeCheckpoint && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-emerald-700">
                        Checkpoint {activeIndex + 1} · {formatCheckpointTime(activeCheckpoint.at)}
                    </div>
                    <p className="mb-3 text-sm font-medium text-zinc-900">{activeCheckpoint.question}</p>
                    <div className="space-y-2">
                        {activeCheckpoint.options.map((option, optionIndex) => (
                            <label
                                key={optionIndex}
                                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                                    selection === optionIndex
                                        ? 'border-emerald-400 bg-white'
                                        : 'border-zinc-200 bg-white hover:border-emerald-300'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name={`checkpoint-${activeIndex}`}
                                    checked={selection === optionIndex}
                                    disabled={feedback !== null}
                                    onChange={() => setSelection(optionIndex)}
                                    className="accent-emerald-600"
                                />
                                <span className="flex-1">{option.text}</span>
                                {feedback !== null && activeCheckpoint.correctIndex === optionIndex && (
                                    <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">
                                        kunci
                                    </span>
                                )}
                            </label>
                        ))}
                    </div>

                    {feedback !== null ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <span
                                className={`text-xs font-medium ${feedback.correct ? 'text-emerald-700' : 'text-red-600'}`}
                            >
                                {feedback.correct ? 'Tepat.' : 'Belum tepat.'}
                            </span>
                            <button
                                type="button"
                                onClick={() => closeCheckpoint(true)}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                                Lanjutkan video
                            </button>
                        </div>
                    ) : (
                        <div className="mt-3 flex items-center gap-3">
                            <button
                                type="button"
                                disabled={selection === null || sending}
                                onClick={confirmAnswer}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {sending ? 'Mengirim...' : 'Jawab'}
                            </button>
                            <span className="text-xs text-zinc-500">
                                Video berlanjut setelah pertanyaan ini dijawab.
                            </span>
                        </div>
                    )}
                </div>
            )}

            {!interactive && checkpoints.length > 0 && (
                <div className="mt-4 space-y-2">
                    {checkpoints.map((checkpoint, index) => (
                        <div
                            key={index}
                            className={`rounded-lg border px-3 py-2.5 ${
                                mode === 'live_proyektor'
                                    ? 'border-zinc-700 bg-zinc-900'
                                    : 'border-zinc-200 bg-white'
                            }`}
                        >
                            <div
                                className={`font-mono text-[11px] uppercase tracking-widest ${
                                    mode === 'live_proyektor' ? 'text-emerald-400' : 'text-emerald-700'
                                }`}
                            >
                                Checkpoint {index + 1} · {formatCheckpointTime(checkpoint.at)}
                            </div>
                            <p className={`mt-1 font-medium ${mode === 'live_proyektor' ? 'text-lg' : 'text-sm'}`}>
                                {checkpoint.question}
                            </p>
                            <ul className={`mt-1 space-y-0.5 ${mode === 'live_proyektor' ? 'text-base text-zinc-300' : 'text-xs text-zinc-600'}`}>
                                {checkpoint.options.map((option, optionIndex) => (
                                    <li key={optionIndex}>
                                        {String.fromCharCode(65 + optionIndex)}. {option.text}
                                        {mode === 'editor_guru' && checkpoint.correctIndex === optionIndex && (
                                            <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-emerald-600">
                                                kunci
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </figure>
    );
}

function FlashcardDeck({ data, mode }) {
    const cards = data.cards;
    const [order, setOrder] = useState(() => cards.map((_, index) => index));
    const [position, setPosition] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [known, setKnown] = useState(() => new Set());

    const cardsSignature = cards.map((card) => `${card.front}|${card.back}`).join('||');
    useEffect(() => {
        setOrder(cards.map((_, index) => index));
        setPosition(0);
        setFlipped(false);
        setKnown(new Set());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cardsSignature]);

    if (cards.length === 0) return null;

    const cardIndex = order[Math.min(position, order.length - 1)] ?? 0;
    const card = cards[cardIndex];
    const isKnown = known.has(cardIndex);
    const big = mode === 'live_hp_siswa';

    function goTo(nextPosition) {
        setPosition(Math.min(cards.length - 1, Math.max(0, nextPosition)));
        setFlipped(false);
    }

    function shuffleDeck() {
        const copy = cards.map((_, index) => index);
        for (let i = copy.length - 1; i > 0; i -= 1) {
            const swap = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[swap]] = [copy[swap], copy[i]];
        }
        setOrder(copy);
        setPosition(0);
        setFlipped(false);
    }

    function toggleKnown() {
        setKnown((current) => {
            const next = new Set(current);
            if (next.has(cardIndex)) next.delete(cardIndex);
            else next.add(cardIndex);
            return next;
        });
    }

    return (
        <div>
            <div className="[perspective:1200px]">
                <button
                    type="button"
                    onClick={() => setFlipped((value) => !value)}
                    aria-label={flipped ? 'Balik ke sisi depan kartu' : 'Balik kartu untuk melihat jawaban'}
                    className="relative block h-64 w-full text-left"
                >
                    <span
                        className="absolute inset-0 block transition-transform duration-500 [transform-style:preserve-3d]"
                        style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                    >
                        <span className="absolute inset-0 flex flex-col rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 [backface-visibility:hidden]">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-700">
                                Istilah · ketuk untuk membalik
                            </span>
                            <span
                                className={`mt-3 flex flex-1 items-center font-display font-bold leading-snug text-emerald-950 ${
                                    big ? 'text-2xl' : 'text-xl'
                                }`}
                            >
                                {card.front}
                            </span>
                            {isKnown && (
                                <span className="self-start rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">
                                    ✓ Sudah hafal
                                </span>
                            )}
                        </span>
                        <span
                            className="absolute inset-0 flex flex-col rounded-xl border border-zinc-200 bg-white p-5 [backface-visibility:hidden]"
                            style={{ transform: 'rotateY(180deg)' }}
                        >
                            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                                Penjelasan
                            </span>
                            <span
                                className={`mt-3 flex-1 whitespace-pre-line leading-relaxed text-zinc-700 ${
                                    big ? 'text-base' : 'text-sm'
                                }`}
                            >
                                {card.back}
                            </span>
                        </span>
                    </span>
                </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => goTo(position - 1)}
                    disabled={position <= 0}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    ← Sebelumnya
                </button>
                <span className="font-mono text-xs text-zinc-500">
                    Kartu {Math.min(position + 1, cards.length)}/{cards.length}
                </span>
                <button
                    type="button"
                    onClick={() => goTo(position + 1)}
                    disabled={position >= cards.length - 1}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Berikutnya →
                </button>
                <button
                    type="button"
                    onClick={shuffleDeck}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                    🔀 Acak
                </button>
                <button
                    type="button"
                    onClick={toggleKnown}
                    className={`rounded-lg px-3 py-2 text-xs font-medium ${
                        isKnown
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                >
                    {isKnown ? '✓ Sudah hafal' : 'Tandai sudah hafal'}
                </button>
                <span className="ml-auto font-mono text-xs text-zinc-500">
                    Hafal: {known.size}/{cards.length}
                </span>
            </div>
        </div>
    );
}

export default function DynamicBlockRenderer({
    block,
    mode = 'editor_guru',
    index = null,
    total = null,
    showAnswer = false,
    onSubmitAnswer = null,
    initialAnswer = null,
    initialCorrect = null,
    pollResults = null,
    studentUploadUrl = null,
    submission = null,
    onSubmitAssignment = null,
    className = '',
}) {
    const safeMode = MODES.includes(mode) ? mode : 'editor_guru';
    const content = block?.content ?? {};
    const data = normalize(content);
    const type = block?.block_type ?? 'materi_teks';
    const points = Number(block?.points ?? 0);

    let inner = null;

    switch (type) {
        case 'section_heading':
            inner = <SectionHeadingBlock data={data} mode={safeMode} />;
            break;

        case 'materi_richtext':
            inner = (
                <>
                    <Heading mode={safeMode} kicker={BLOCK_LABELS[type]}>
                        {data.title}
                    </Heading>
                    <RichText body={data.body} mode={safeMode} />
                </>
            );
            break;

        case 'materi_video':
            inner = <VideoBlock data={data} mode={safeMode} />;
            break;

        case 'materi_file':
            inner = <FileBlock data={data} mode={safeMode} />;
            break;

        case 'materi_embed':
            inner = <EmbedBlock data={data} mode={safeMode} />;
            break;

        case 'materi_teks':
            inner = (
                <>
                    <Heading mode={safeMode} kicker={BLOCK_LABELS[type]}>
                        {data.title}
                    </Heading>
                    <BodyText mode={safeMode}>{data.body}</BodyText>
                </>
            );
            break;

        case 'materi_accordion':
            inner = (
                <>
                    <Heading mode={safeMode} kicker={BLOCK_LABELS[type]}>
                        {data.title}
                    </Heading>
                    <div className="space-y-2">
                        {data.items.map((item, itemIndex) => (
                            <details
                                key={`${item.label}-${itemIndex}`}
                                open={safeMode === 'editor_guru' || itemIndex === 0}
                                className={`group rounded-lg border px-3 py-2.5 ${
                                    safeMode === 'live_proyektor'
                                        ? 'border-zinc-700 bg-zinc-900'
                                        : 'border-zinc-200 bg-white'
                                }`}
                            >
                                <summary
                                    className={`cursor-pointer list-none font-medium marker:hidden ${
                                        safeMode === 'live_proyektor' ? 'text-xl text-zinc-100' : 'text-sm text-zinc-800'
                                    }`}
                                >
                                    <span className="mr-2 font-mono text-xs text-emerald-600">
                                        {String(itemIndex + 1).padStart(2, '0')}
                                    </span>
                                    {item.label}
                                </summary>
                                <p
                                    className={`mt-2 whitespace-pre-line pl-7 ${
                                        safeMode === 'live_proyektor'
                                            ? 'text-lg leading-relaxed text-zinc-300'
                                            : 'text-sm leading-6 text-zinc-600'
                                    }`}
                                >
                                    {item.text}
                                </p>
                            </details>
                        ))}
                    </div>
                </>
            );
            break;

        case 'materi_flashcard':
            inner =
                safeMode === 'live_hp_siswa' || safeMode === 'mandiri_siswa' ? (
                    <>
                        <Heading mode={safeMode} kicker={BLOCK_LABELS[type]}>
                            {data.title}
                        </Heading>
                        <FlashcardDeck data={data} mode={safeMode} />
                    </>
                ) : (
                <>
                    <Heading mode={safeMode} kicker={BLOCK_LABELS[type]}>
                        {data.title}
                    </Heading>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {data.cards.map((card, cardIndex) => (
                            <div
                                key={`${card.front}-${cardIndex}`}
                                className={`rounded-lg border p-3 ${
                                    safeMode === 'live_proyektor'
                                        ? 'border-zinc-700 bg-zinc-900'
                                        : 'border-zinc-200 bg-zinc-50/60'
                                }`}
                            >
                                <div
                                    className={`font-mono text-[10px] uppercase tracking-wider ${
                                        safeMode === 'live_proyektor' ? 'text-emerald-400' : 'text-emerald-700'
                                    }`}
                                >
                                    Kartu {cardIndex + 1}
                                </div>
                                <div className={`mt-1 font-semibold ${safeMode === 'live_proyektor' ? 'text-xl' : 'text-sm'}`}>
                                    {card.front}
                                </div>
                                <div
                                    className={`mt-1.5 whitespace-pre-line ${
                                        safeMode === 'live_proyektor'
                                            ? 'text-lg text-zinc-300'
                                            : 'text-xs leading-5 text-zinc-600'
                                    }`}
                                >
                                    {card.back}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
                );
            break;

        case 'slide_image': {
            const gallery = data.images.length > 0 ? data.images : data.url ? [data.url] : [];

            inner = (
                <figure>
                    {gallery.length > 0 ? (
                        <div className={gallery.length > 1 ? 'grid gap-2 sm:grid-cols-2' : ''}>
                            {gallery.map((source, imageIndex) => (
                                <img
                                    key={`${source}-${imageIndex}`}
                                    src={source}
                                    alt={data.caption || data.title || `Slide materi ${imageIndex + 1}`}
                                    loading="lazy"
                                    className={`w-full rounded-lg border object-contain ${
                                        safeMode === 'live_proyektor'
                                            ? 'max-h-[70vh] border-zinc-700'
                                            : 'border-zinc-200'
                                    }`}
                                />
                            ))}
                        </div>
                    ) : (
                        <div
                            className={`flex aspect-video items-center justify-center rounded-lg border border-dashed text-xs ${
                                safeMode === 'live_proyektor'
                                    ? 'border-zinc-700 text-zinc-500'
                                    : 'border-zinc-200 text-zinc-400'
                            }`}
                        >
                            Belum ada gambar slide.
                        </div>
                    )}
                    {data.caption && (
                        <figcaption
                            className={`mt-2 text-center ${
                                safeMode === 'live_proyektor' ? 'text-lg text-zinc-400' : 'text-xs text-zinc-500'
                            }`}
                        >
                            {data.caption}
                        </figcaption>
                    )}
                </figure>
            );
            break;
        }

        case 'soal_mcq':
            inner = (
                <McqBlock
                    data={data}
                    mode={safeMode}
                    points={points}
                    reveal={showAnswer}
                    onSubmitAnswer={onSubmitAnswer}
                    initialAnswer={initialAnswer}
                    initialCorrect={initialCorrect}
                />
            );
            break;

        case 'soal_truefalse':
            inner = (
                <TrueFalseBlock
                    data={data}
                    mode={safeMode}
                    points={points}
                    reveal={showAnswer}
                    onSubmitAnswer={onSubmitAnswer}
                    initialAnswer={initialAnswer}
                    initialCorrect={initialCorrect}
                />
            );
            break;

        case 'soal_fillblank':
            inner = (
                <FillBlankBlock
                    data={data}
                    mode={safeMode}
                    points={points}
                    reveal={showAnswer}
                    onSubmitAnswer={onSubmitAnswer}
                    initialAnswer={initialAnswer}
                    initialCorrect={initialCorrect}
                />
            );
            break;

        case 'soal_sequencing':
            inner = (
                <SequencingBlock
                    data={data}
                    mode={safeMode}
                    points={points}
                    reveal={showAnswer}
                    onSubmitAnswer={onSubmitAnswer}
                    initialAnswer={initialAnswer}
                    initialCorrect={initialCorrect}
                />
            );
            break;

        case 'soal_matching':
            inner = (
                <MatchingBlock
                    data={data}
                    mode={safeMode}
                    points={points}
                    reveal={showAnswer}
                    onSubmitAnswer={onSubmitAnswer}
                    initialAnswer={initialAnswer}
                    initialCorrect={initialCorrect}
                />
            );
            break;

        case 'soal_essay_ai':
            inner = (
                <EssayBlock
                    data={data}
                    mode={safeMode}
                    points={points}
                    rubric={block?.ai_rubric}
                    onSubmitAnswer={onSubmitAnswer}
                    initialAnswer={initialAnswer}
                />
            );
            break;

        case 'soal_hotspot':
            inner = (
                <HotspotBlock
                    data={data}
                    mode={safeMode}
                    points={points}
                    reveal={showAnswer}
                    onSubmitAnswer={onSubmitAnswer}
                    initialAnswer={initialAnswer}
                    initialCorrect={initialCorrect}
                />
            );
            break;

        case 'materi_video_interaktif':
            inner = (
                <InteractiveVideoBlock
                    data={data}
                    mode={safeMode}
                    onSubmitAnswer={onSubmitAnswer}
                    initialAnswer={initialAnswer}
                />
            );
            break;

        case 'polling':
            inner = (
                <PollingBlock
                    data={data}
                    mode={safeMode}
                    onSubmitAnswer={onSubmitAnswer}
                    initialAnswer={initialAnswer}
                    pollResults={pollResults}
                />
            );
            break;

        case 'praktik_checklist':
            inner = (
                <ChecklistBlock
                    data={data}
                    mode={safeMode}
                    onSubmitAnswer={onSubmitAnswer}
                    initialAnswer={initialAnswer}
                    studentUploadUrl={studentUploadUrl}
                />
            );
            break;

        case 'tugas_upload':
            inner = (
                <TugasUploadBlock
                    data={data}
                    mode={safeMode}
                    points={points}
                    onSubmitAssignment={onSubmitAssignment}
                    submission={submission}
                    studentUploadUrl={studentUploadUrl}
                />
            );
            break;

        default:
            inner = (
                <p className="text-xs text-zinc-500">
                    Tipe blok <span className="font-mono">{type}</span> belum didukung renderer.
                </p>
            );
    }

    return (
        <div className={className}>
            {(safeMode === 'live_proyektor' || safeMode === 'editor_guru') && index !== null && (
                <div
                    className={`mb-3 font-mono text-[10px] uppercase tracking-widest ${
                        safeMode === 'live_proyektor' ? 'text-zinc-500' : 'text-zinc-400'
                    }`}
                >
                    {String(index + 1).padStart(2, '0')}
                    {total ? ` / ${String(total).padStart(2, '0')}` : ''} · {BLOCK_LABELS[type] ?? type}
                </div>
            )}
            {type === 'section_heading' ? inner : <Shell mode={safeMode}>{inner}</Shell>}
        </div>
    );
}

export { BLOCK_LABELS, MODES };
