import { useEffect, useMemo, useState } from 'react';

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
    materi_teks: 'Teks Materi',
    materi_accordion: 'Accordion SOP',
    materi_flashcard: 'Flashcard',
    slide_image: 'Slide Gambar',
    soal_mcq: 'Pilihan Ganda',
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
    };
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

function McqBlock({ data, mode, points, reveal, onSubmitAnswer }) {
    const [selected, setSelected] = useState(null);
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        setSelected(null);
        setChecked(false);
        setSubmitted(false);
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
                                disabled={selected === null}
                                onClick={() => {
                                    setSubmitted(true);
                                    onSubmitAnswer({ option_index: selected });
                                }}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Kirim Jawaban
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

function SequencingBlock({ data, mode, points, reveal, onSubmitAnswer }) {
    const [order, setOrder] = useState(() => shuffledSteps(data.steps, mode === 'live_proyektor'));
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        setOrder(shuffledSteps(data.steps, mode === 'live_proyektor'));
        setChecked(false);
        setSubmitted(false);
    }, [data.steps.join('|'), mode]);

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
                                onClick={() => {
                                    setSubmitted(true);
                                    onSubmitAnswer({ order: order.map((item) => item.step) });
                                }}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                                Kirim Urutan
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

function MatchingBlock({ data, mode, points, reveal, onSubmitAnswer }) {
    const rights = useMemo(
        () =>
            data.rights.length > 0
                ? data.rights
                : data.pairs.map((pair) => pair.right).slice().sort((a, b) => a.localeCompare(b)),
        [data.rights.join('|'), data.pairs.map((p) => p.right).join('|')],
    );
    const [answers, setAnswers] = useState({});
    const [checked, setChecked] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        setAnswers({});
        setChecked(false);
        setSubmitted(false);
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
                                disabled={Object.keys(answers).length < data.pairs.length}
                                onClick={() => {
                                    setSubmitted(true);
                                    onSubmitAnswer({
                                        matching: Object.fromEntries(
                                            data.pairs.map((pair, index) => [pair.left, answers[index] ?? '']),
                                        ),
                                    });
                                }}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Kirim Pasangan
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

function EssayBlock({ data, mode, points, rubric, onSubmitAnswer }) {
    const [answer, setAnswer] = useState('');
    const [savedNote, setSavedNote] = useState(false);
    const interactive = mode !== 'editor_guru' && mode !== 'live_proyektor';

    useEffect(() => {
        setAnswer('');
        setSavedNote(false);
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
                            disabled={answer.trim().length === 0}
                            onClick={() => {
                                setSavedNote(true);
                                onSubmitAnswer?.({ text: answer });
                            }}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {onSubmitAnswer ? 'Kirim Jawaban' : 'Simpan Jawaban'}
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

export default function DynamicBlockRenderer({
    block,
    mode = 'editor_guru',
    index = null,
    total = null,
    showAnswer = false,
    onSubmitAnswer = null,
    className = '',
}) {
    const safeMode = MODES.includes(mode) ? mode : 'editor_guru';
    const content = block?.content ?? {};
    const data = normalize(content);
    const type = block?.block_type ?? 'materi_teks';
    const points = Number(block?.points ?? 0);

    let inner = null;

    switch (type) {
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
            <Shell mode={safeMode}>{inner}</Shell>
        </div>
    );
}

export { BLOCK_LABELS, MODES };
