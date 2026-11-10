import { useEffect, useRef, useState } from 'react';

let pdfjsPromise = null;

/**
 * pdf.js dimuat lazy agar bundle utama studio tetap ringan.
 */
async function loadPdfJs() {
    if (pdfjsPromise) return pdfjsPromise;

    pdfjsPromise = (async () => {
        // pdf.js 4.x memakai Promise.withResolvers (ES2024); polyfill ringan untuk browser lama.
        if (typeof Promise.withResolvers !== 'function') {
            Promise.withResolvers = function withResolvers() {
                let resolve;
                let reject;
                const promise = new Promise((res, rej) => {
                    resolve = res;
                    reject = rej;
                });
                return { promise, resolve, reject };
            };
        }

        const [pdfjsLib, workerModule] = await Promise.all([
            import('pdfjs-dist'),
            import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);

        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;

        return pdfjsLib;
    })();

    return pdfjsPromise;
}

export const PDF_SLIDE_MAX_PAGES = 60;
export const PDF_SLIDE_MAX_WIDTH = 1280;
const WEBP_QUALITY = 0.8;
const UPLOAD_CHUNK = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function friendlyPdfError(error) {
    const name = error?.name ?? '';

    if (name === 'PasswordException') {
        return 'PDF terenkripsi / dikunci kata sandi. Buka proteksinya lalu ekspor ulang sebagai PDF.';
    }

    if (name === 'InvalidPDFException') {
        return 'Berkas PDF rusak atau bukan PDF yang valid. Coba ekspor ulang dari PowerPoint/Word.';
    }

    if (name === 'MissingPDFException') {
        return 'Berkas PDF tidak ditemukan atau kosong.';
    }

    return error?.message || 'Gagal memproses PDF.';
}

async function renderPageToDataUrl(pdf, pageNumber) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.5, PDF_SLIDE_MAX_WIDTH / Math.max(base.width, 1));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const context = canvas.getContext('2d', { alpha: false });

    if (!context) {
        throw new Error('Canvas 2D tidak tersedia di browser ini.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    let dataUrl = canvas.toDataURL('image/webp', WEBP_QUALITY);

    if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/png');
    }

    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;

    return dataUrl;
}

export default function PdfSlideImporter({ endpoint, csrfToken, onImported, disabled = false }) {
    const [busy, setBusy] = useState(false);
    const [phase, setPhase] = useState('idle');
    const [status, setStatus] = useState('');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const [results, setResults] = useState([]);

    const cancelRef = useRef(false);
    const abortRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        return () => {
            cancelRef.current = true;
            abortRef.current?.abort();
        };
    }, []);

    function cancel() {
        cancelRef.current = true;
        abortRef.current?.abort();
        setStatus('Dibatalkan.');
        setPhase('idle');
        setBusy(false);
    }

    async function handleFile(event) {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) return;

        if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
            setError('Pilih berkas PDF (hasil ekspor PowerPoint/Word).');
            return;
        }

        cancelRef.current = false;
        abortRef.current = new AbortController();
        setBusy(true);
        setError(null);
        setResults([]);
        setProgress(0);
        setPhase('render');
        setStatus('Membaca PDF...');

        let pdf = null;

        try {
            setStatus('Menyiapkan mesin PDF...');
            const pdfjsLib = await loadPdfJs();
            const buffer = await file.arrayBuffer();

            pdf = await pdfjsLib.getDocument({
                data: new Uint8Array(buffer),
                isEvalSupported: false,
            }).promise;

            const totalPages = pdf.numPages;
            const total = Math.min(totalPages, PDF_SLIDE_MAX_PAGES);
            const truncated = totalPages > PDF_SLIDE_MAX_PAGES;
            const images = [];

            for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
                if (cancelRef.current) return;

                setStatus(`Render halaman ${pageNumber}/${total}`);
                setProgress(Math.round(((pageNumber - 1) / total) * 60));

                images.push(await renderPageToDataUrl(pdf, pageNumber));
            }

            pdf.destroy();
            pdf = null;

            if (cancelRef.current) return;

            setPhase('upload');

            const uploaded = [];

            for (let offset = 0; offset < images.length; offset += UPLOAD_CHUNK) {
                if (cancelRef.current) return;

                const chunk = images.slice(offset, offset + UPLOAD_CHUNK);
                const oversized = chunk.find((dataUrl) => dataUrl.length * 0.75 > MAX_IMAGE_BYTES);

                if (oversized) {
                    throw new Error('Ada halaman yang lebih dari 4 MB setelah dikonversi. Kurangi resolusi PDF.');
                }

                setStatus(`Mengunggah halaman ${offset + 1}-${offset + chunk.length} dari ${images.length}`);
                setProgress(60 + Math.round((offset / images.length) * 40));

                const response = await fetch(endpoint, {
                    method: 'POST',
                    credentials: 'same-origin',
                    signal: abortRef.current.signal,
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-TOKEN': csrfToken ?? '',
                    },
                    body: JSON.stringify({
                        source_name: file.name,
                        images: chunk,
                    }),
                });

                const payload = await response.json().catch(() => ({}));

                if (!response.ok) {
                    const firstError = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
                    throw new Error(firstError || payload?.message || `Gagal mengunggah slide (${response.status}).`);
                }

                uploaded.push(...(payload.slides ?? []));
            }

            if (cancelRef.current) return;

            setProgress(100);
            setPhase('done');
            setStatus(
                `Selesai: ${uploaded.length} halaman${truncated ? ` (dibatasi ${PDF_SLIDE_MAX_PAGES} dari ${totalPages})` : ''}.`,
            );
            setResults(uploaded);
            onImported?.(uploaded, { sourceName: file.name, totalPages, truncated });
        } catch (caught) {
            if (caught?.name === 'AbortError' || cancelRef.current) {
                return;
            }

            setError(friendlyPdfError(caught));
            setPhase('error');
            setStatus('');
        } finally {
            if (pdf) pdf.destroy();
            setBusy(false);
        }
    }

    const percent = Math.max(0, Math.min(100, progress));

    return (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
                <input
                    ref={inputRef}
                    id="pdf-slide-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={handleFile}
                    disabled={disabled || busy}
                />
                <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => inputRef.current?.click()}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {busy ? 'Memproses...' : 'Pilih PDF & Impor'}
                </button>
                {busy && (
                    <button
                        type="button"
                        onClick={cancel}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                        Batalkan
                    </button>
                )}
                <span className="text-[11px] text-zinc-500">
                    Maks {PDF_SLIDE_MAX_PAGES} halaman · WebP ≤ {PDF_SLIDE_MAX_WIDTH}px
                </span>
            </div>

            {(busy || phase === 'done') && (
                <div className="space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                        <div
                            className={`h-full rounded-full transition-all ${phase === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                    <p className="font-mono text-[11px] text-zinc-500">
                        {status} {phase === 'render' ? '· render di browser' : ''}
                    </p>
                </div>
            )}

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                    <button type="button" onClick={() => setError(null)} className="ml-2 underline">
                        tutup
                    </button>
                </div>
            )}

            {!error && results.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {results.map((slide) => (
                        <img
                            key={slide.path}
                            src={slide.url}
                            alt={slide.name}
                            title={slide.name}
                            className="h-10 w-16 rounded border border-zinc-200 object-cover"
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
