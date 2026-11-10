import { Head, Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';

export default function Join() {
    const { flash, auth } = usePage().props;
    const [pin, setPin] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    function submit(event) {
        event.preventDefault();

        if (!/^\d{6}$/.test(pin)) {
            setError('Masukkan 6 digit PIN dari layar proyektor.');
            return;
        }

        setError(null);
        setSubmitting(true);
        router.get(`/live/${pin}`, {}, {
            onFinish: () => setSubmitting(false),
        });
    }

    return (
        <div className="flex min-h-screen flex-col bg-zinc-50">
            <Head title="Gabung Sesi Live" />

            <header className="border-b border-zinc-200 bg-white">
                <div className="mx-auto flex h-16 w-full max-w-sm items-center justify-between px-4">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 font-display text-sm font-bold text-white">
                            LMS
                        </div>
                        <div>
                            <div className="font-display text-sm font-bold text-zinc-900">Live Kelas</div>
                            <div className="text-xs text-zinc-500">{auth?.user?.name}</div>
                        </div>
                    </div>
                    <Link
                        href="/logout"
                        method="post"
                        as="button"
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                        Keluar
                    </Link>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
                    <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-700">
                        Sesi live
                    </div>
                    <h1 className="mt-1 font-display text-xl font-bold text-zinc-900">Masukkan PIN</h1>
                    <p className="mt-1 text-sm text-zinc-500">
                        PIN 6 digit tampil di layar proyektor guru.
                    </p>

                    <form onSubmit={submit} className="mt-5 space-y-3">
                        <label htmlFor="pin" className="block text-xs font-medium text-zinc-600">
                            PIN kelas
                        </label>
                        <input
                            id="pin"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            autoFocus
                            maxLength={6}
                            value={pin}
                            onChange={(event) => {
                                setPin(event.target.value.replace(/\D/g, '').slice(0, 6));
                                setError(null);
                            }}
                            placeholder="000000"
                            aria-label="PIN kelas 6 digit"
                            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center font-mono text-3xl tracking-[0.4em] text-zinc-900 placeholder:text-zinc-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />

                        {(error || flash?.error) && (
                            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                {error ?? flash.error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={pin.length !== 6 || submitting}
                            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {submitting ? 'Menghubungkan...' : 'Gabung Sesi'}
                        </button>
                    </form>
                </div>

                <p className="mt-4 text-center text-xs text-zinc-400">
                    Slide akan mengikuti layar guru secara otomatis. Tidak perlu refresh.
                </p>
            </main>
        </div>
    );
}
