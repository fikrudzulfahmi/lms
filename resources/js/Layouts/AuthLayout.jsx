const highlights = [
    'Modul ajar block-based sesuai Kurikulum Merdeka',
    'Sesi live kelas dengan PIN dan panggung proyektor',
    'Buku nilai otomatis: formatif, sumatif, KKTP',
];

export default function AuthLayout({ children }) {
    return (
        <div className="flex min-h-screen bg-zinc-50">
            <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-10 text-white lg:flex">
                <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />

                <div className="relative flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 font-display text-sm font-bold backdrop-blur-sm">
                        LMS
                    </div>
                    <div>
                        <div className="font-display text-base font-bold">LMS SMK</div>
                        <div className="text-xs text-emerald-100/80">Platform Belajar Kurikulum Merdeka</div>
                    </div>
                </div>

                <div className="relative max-w-md">
                    <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">
                        Belajar terstruktur,
                        <br />
                        penilaian transparan.
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-emerald-50/90">
                        Satu tempat untuk guru menyusun asesmen dan siswa mengikuti pembelajaran live di kelas.
                    </p>
                    <ul className="mt-7 space-y-3">
                        {highlights.map((item) => (
                            <li key={item} className="flex items-start gap-2.5 text-sm text-emerald-50/95">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                    </svg>
                                </span>
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative text-xs text-emerald-100/70">© {new Date().getFullYear()} LMS SMK · Staging</p>
            </div>

            <div className="flex w-full flex-col items-center justify-center p-6 lg:w-1/2">
                <div className="w-full max-w-sm">
                    <div className="mb-6 flex items-center gap-3 lg:hidden">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 font-display text-sm font-bold text-white shadow-sm">
                            LMS
                        </div>
                        <div>
                            <div className="font-display text-base font-bold text-zinc-900">LMS SMK</div>
                            <div className="text-xs text-zinc-500">Platform Belajar Kurikulum Merdeka</div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_16px_40px_-24px_rgba(24,24,27,0.25)]">
                        {children}
                    </div>

                    <p className="mt-4 text-center text-xs text-zinc-400">
                        LMS SMK · Staging · v1.0
                    </p>
                </div>
            </div>
        </div>
    );
}
