import { Link } from '@inertiajs/react';

export default function AuthLayout({ children }) {
    return (
        <div className="flex min-h-full items-center justify-center bg-zinc-50 p-6">
            <div className="w-full max-w-sm">
                <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 font-display text-sm font-bold text-white">
                        LMS
                    </div>
                    <div>
                        <div className="font-display text-base font-bold text-zinc-900">
                            LMS SMK
                        </div>
                        <div className="text-xs text-zinc-500">
                            Platform Belajar Kurikulum Merdeka
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-6">
                    {children}
                </div>
                <p className="mt-4 text-center text-xs text-zinc-400">
                    Staging ·{' '}
                    <Link
                        href="/dev/login"
                        className="text-emerald-700 hover:underline"
                    >
                        masuk cepat admin
                    </Link>
                </p>
            </div>
        </div>
    );
}
