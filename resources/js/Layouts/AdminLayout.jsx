import { Link, usePage } from '@inertiajs/react';

const icons = {
    dashboard: 'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z',
    calendar: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
    users: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
    shuffle: 'M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
    teacher: 'M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5',
    book: 'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25',
};

export const navItems = [
    { label: 'Dashboard', href: '/admin', exact: true, icon: 'dashboard' },
    { label: 'Tahun Pelajaran', href: '/admin/academic-years', icon: 'calendar' },
    { label: 'Kelas & Siswa', href: '/admin/classrooms', icon: 'users' },
    { label: 'Kelola Guru', href: '/admin/teachers', icon: 'teacher' },
    { label: 'Mata Pelajaran', href: '/admin/subjects', icon: 'book' },
    { label: 'Ploting Mengajar', href: '/admin/ploting', icon: 'shuffle' },
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

function FlashBanners({ flash }) {
    if (!flash?.success && !flash?.error) return null;

    return (
        <div className="space-y-2">
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
    );
}

export default function AdminLayout({ children }) {
    const page = usePage();
    const { flash, auth, active_year, appName } = page.props;
    const url = page.url;
    const current = navItems.find((item) => isActive(url, item));

    return (
        <div className="flex min-h-screen bg-zinc-50/80">
            <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink-950 md:flex">
                <Link href="/admin" className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brass-500 font-display text-[13px] font-bold text-white shadow-sm">
                        LMS
                    </div>
                    <div className="min-w-0">
                        <div className="truncate font-display text-sm font-bold text-white">{appName ?? 'LMS SMK'}</div>
                        <div className="text-[11px] font-medium uppercase tracking-wider text-white/50">Admin Panel</div>
                    </div>
                </Link>

                <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                    <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">Akademik</div>
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
                </nav>

                <div className="space-y-2 border-t border-white/10 p-3">
                    {active_year ? (
                        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase leading-4 tracking-wider text-brass-300/90">Tahun Aktif</div>
                            <div className="mt-1 truncate font-mono text-xs font-semibold leading-4 text-white">{active_year.label}</div>
                        </div>
                    ) : (
                        <div className="rounded-lg bg-white/5 px-3 py-2 text-[11px] font-medium text-white/60">
                            Belum ada tahun pelajaran aktif
                        </div>
                    )}
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
                        <span className="text-sm font-semibold text-zinc-900">{current?.label ?? 'Admin'}</span>
                        <span className="text-xs text-zinc-400">/</span>
                        <span className="text-xs text-zinc-500">Manajemen Akademik</span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-sm font-medium text-zinc-700 sm:block">{auth?.user?.name}</span>
                        <Link
                            href="/logout"
                            method="post"
                            as="button"
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 md:hidden"
                        >
                            Keluar
                        </Link>
                    </div>
                </header>

                {(flash?.success || flash?.error) && (
                    <div className="mx-4 mt-4 sm:mx-6">
                        <FlashBanners flash={flash} />
                    </div>
                )}

                <main className="flex-1 p-4 sm:p-6">
                    <div className="mx-auto w-full max-w-7xl">{children}</div>
                </main>
            </div>
        </div>
    );
}
