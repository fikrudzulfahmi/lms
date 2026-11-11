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
    };
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

async function submitAndMark(onSubmitAnswer, payload, setSubmitted, setSending) {
    if (!onSubmitAnswer) return;

    setSending(true);
    try {
        const ok = await onSubmitAnswer(payload);
        // Kontrak: parent mengembalikan false bila server gagal menyimpan.
        if (ok !== false) setSubmitted(true);
    } finally {
        setSending(false);
    }
}

function McqBlock({ data, mode, points, reveal, onSubmitAnswer, initialAnswer = null }) {
    const [selected, setSelected] = useState(() =>
        Number.isInteger(initialAnswer?.option_index) ? initialAnswer.option_index : null,
    );
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(() => initialAnswer != null);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        setSelected(Number.isInteger(initialAnswer?.option_index) ? initialAnswer.option_index : null);
        setChecked(false);
        setSubmitted(initialAnswer != null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.question, data.options.length]);

    const interactive = mode !== 'editor_guru' && mode !== 'live_proyektor';
    const showKey = mode === 'editor_guru' || reveal;

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
                                    )
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {sending ? 'Mengirim...' : submitted ? 'Kirim Ulang Jawaban' : 'Kirim Jawaban'}
                            </button>
                            {submitted && (
                                <span className="text-xs font-medium text-emerald-700">Jawaban terkirim.</span>
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

function SequencingBlock({ data, mode, points, reveal, onSubmitAnswer, initialAnswer = null }) {
    const [order, setOrder] = useState(
        () => orderFromSaved(data.steps, initialAnswer?.order) ?? shuffledSteps(data.steps, mode === 'live_proyektor'),
    );
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(() => initialAnswer != null);
    const [sending, setSending] = useState(false);

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

function MatchingBlock({ data, mode, points, reveal, onSubmitAnswer, initialAnswer = null }) {
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

    useEffect(() => {
        setAnswers(answersFromSaved(data.pairs, initialAnswer?.matching));
        setChecked(false);
        setSubmitted(initialAnswer != null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.pairs.map((p) => `${p.left}:${p.right}`).join('|')]);

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

function TrueFalseBlock({ data, mode, points, reveal, onSubmitAnswer, initialAnswer = null }) {
    const [selected, setSelected] = useState(() =>
        typeof initialAnswer?.value === 'boolean' ? initialAnswer.value : null,
    );
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(() => initialAnswer != null);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        setSelected(typeof initialAnswer?.value === 'boolean' ? initialAnswer.value : null);
        setChecked(false);
        setSubmitted(initialAnswer != null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.question]);

    const interactive = mode !== 'editor_guru' && mode !== 'live_proyektor';
    const showKey = mode === 'editor_guru' || reveal;
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
                                    )
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {sending ? 'Mengirim...' : submitted ? 'Kirim Ulang Jawaban' : 'Kirim Jawaban'}
                            </button>
                            {submitted && (
                                <span className="text-xs font-medium text-emerald-700">Jawaban terkirim.</span>
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

function FillBlankBlock({ data, mode, points, reveal, onSubmitAnswer, initialAnswer = null }) {
    const [answer, setAnswer] = useState(() => (typeof initialAnswer?.text === 'string' ? initialAnswer.text : ''));
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(() => initialAnswer != null);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        setAnswer(typeof initialAnswer?.text === 'string' ? initialAnswer.text : '');
        setChecked(false);
        setSubmitted(initialAnswer != null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.question]);

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
                                        )
                                    }
                                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {sending ? 'Mengirim...' : submitted ? 'Kirim Ulang Jawaban' : 'Kirim Jawaban'}
                                </button>
                                {submitted && (
                                    <span className="text-xs font-medium text-emerald-700">Jawaban terkirim.</span>
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

export default function DynamicBlockRenderer({
    block,
    mode = 'editor_guru',
    index = null,
    total = null,
    showAnswer = false,
    onSubmitAnswer = null,
    initialAnswer = null,
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
            inner = (
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
