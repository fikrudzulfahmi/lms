import { Link, usePage } from '@inertiajs/react';

const icons = {
    modules: 'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25',
    gradebook: 'M3.75 6.75A2.25 2.25 0 0 1 6 4.5h9.75L20.25 9v10.5a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6.75Zm9.75-2.25V9h4.5M8.25 13.5h7.5m-7.5 3.75h5.25',
    admin: 'M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25',
    objectives: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
};

const navItems = [
    { label: 'Modul Ajar', href: '/teacher/modules', exact: false, icon: 'modules' },
    { label: 'Bank TP', href: '/teacher/objectives', exact: false, icon: 'objectives' },
    { label: 'Buku Nilai', href: '/teacher/gradebook', exact: false, icon: 'gradebook' },
];

function isActive(url, item) {
    const path = (url || '').split('?')[0];
    return item.exact ? path === item.href : path.startsWith(item.href);
}

function NavIcon({ name, className = 'h-4 w-4' }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={icons[name]} />
        </svg>
    );
}

export default function TeacherLayout({ children }) {
    const page = usePage();
    const { flash, auth, active_year, appName } = page.props;
    const url = page.url;
    const isAdmin = auth?.user?.role === 'admin';

    return (
        <div className="flex min-h-screen bg-zinc-50/80">
            <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink-950 md:flex">
                <Link href="/teacher/modules" className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brass-500 font-display text-[13px] font-bold text-white shadow-sm">
                        LMS
                    </div>
                    <div className="min-w-0">
                        <div className="truncate font-display text-sm font-bold text-white">{appName ?? 'LMS SMK'}</div>
                        <div className="text-[11px] font-medium uppercase tracking-wider text-white/50">Studio Guru</div>
                    </div>
                </Link>

                <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                    <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">Mengajar</div>
                    {navItems.map((item) => {
                        const active = isActive(url, item);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                preserveScroll
                                className={
                                    'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ' +
                                    (active
                                        ? 'bg-white/10 text-white'
                                        : 'text-zinc-300 hover:bg-white/5 hover:text-white')
                                }
                            >
                                {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brass-500" />}
                                <NavIcon
                                    name={item.icon}
                                    className={'h-4 w-4 ' + (active ? 'text-brass-300' : 'text-white/40 group-hover:text-white/70')}
                                />
                                {item.label}
                            </Link>
                        );
                    })}

                    {isAdmin && (
                        <>
                            <div className="px-3 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-widest text-white/40">Administrasi</div>
                            <Link
                                href="/admin"
                                className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                            >
                                <NavIcon name="admin" className="h-4 w-4 text-white/40 group-hover:text-white/70" />
                                Kembali ke Admin
                            </Link>
                        </>
                    )}
                </nav>

                <div className="space-y-2 border-t border-white/10 p-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase leading-4 tracking-wider text-brass-300/90">Tahun Aktif</div>
                        <div className="mt-1 truncate font-mono text-xs font-semibold leading-4 text-white">
                            {active_year ? `${active_year.name} ${active_year.semester}` : '—'}
                        </div>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass-500 text-xs font-semibold text-white">
                            {(auth?.user?.name ?? '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-white">{auth?.user?.name}</div>
                            <div className="text-[11px] capitalize text-white/50">{auth?.user?.role}</div>
                        </div>
                        <Link
                            href="/logout"
                            method="post"
                            as="button"
                            className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                            title="Keluar"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H3" />
                            </svg>
                        </Link>
                    </div>
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-zinc-200/80 bg-white/90 px-4 backdrop-blur sm:px-6 md:h-16">
                    <div className="flex gap-1 overflow-x-auto md:hidden">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={
                                    'flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium ' +
                                    (isActive(url, item) ? 'bg-emerald-50 text-emerald-700' : 'text-zinc-600 hover:bg-zinc-100')
                                }
                            >
                                <NavIcon name={item.icon} className="h-3.5 w-3.5" />
                                {item.label}
                            </Link>
                        ))}
                    </div>
                    <div className="hidden items-center gap-2 md:flex">
                        <span className="text-sm font-semibold text-zinc-900">Studio Editor</span>
                        <span className="text-xs text-zinc-400">/</span>
                        <span className="text-xs text-zinc-500">Block-Based Learning</span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-sm font-medium text-zinc-700 sm:block">{auth?.user?.name}</span>
                        <Link
                            href="/logout"
                            method="post"
                            as="button"
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                        >
                            Keluar
                        </Link>
                    </div>
                </header>

                {(flash?.success || flash?.error) && (
                    <div className="mx-4 mt-4 space-y-2 sm:mx-6">
                        {flash?.success && (
                            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
                                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                                <span>{flash.success}</span>
                            </div>
                        )}
                        {flash?.error && (
                            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
                                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 3.5h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                                </svg>
                                <span>{flash.error}</span>
                            </div>
                        )}
                    </div>
                )}

                <main className="flex-1 p-4 sm:p-6">
                    <div className="mx-auto w-full max-w-[1500px]">{children}</div>
                </main>
            </div>
        </div>
    );
}
