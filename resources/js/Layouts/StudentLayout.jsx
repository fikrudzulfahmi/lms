import { Link, usePage } from '@inertiajs/react';

const icons = {
    home: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 10.5 12 3l9 7.5M5.25 9.75V20.25h4.5v-5.25h4.5v5.25h4.5V9.75"
        />
    ),
    live: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 8.25h10.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5v-6a1.5 1.5 0 0 1 1.5-1.5Zm3 9.75v1.5m4.5-1.5v1.5M9 8.25V6.75a3 3 0 0 1 6 0v1.5"
        />
    ),
    grades: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.5 4.5h6.75L18 8.25v11.25H7.5a1.5 1.5 0 0 1-1.5-1.5V6a1.5 1.5 0 0 1 1.5-1.5Zm6.75 0V8.25H18M9.75 12h4.5m-4.5 3.75h4.5"
        />
    ),
};

const navItems = [
    { label: 'Beranda', href: '/student', exact: true, icon: 'home' },
    { label: 'Live Kelas', href: '/live', exact: false, icon: 'live' },
    { label: 'Nilai Saya', href: '/student/grades', exact: false, icon: 'grades' },
];

function isActive(url, item) {
    const path = (url || '').split('?')[0];
    return item.exact ? path === item.href : path.startsWith(item.href);
}

function NavIcon({ name, className = 'h-4 w-4' }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
            {icons[name]}
        </svg>
    );
}

export default function StudentLayout({ children }) {
    const page = usePage();
    const { auth, appName, active_year } = page.props;
    const url = page.url;

    return (
        <div className="flex min-h-screen bg-zinc-50">
            <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink-950 md:flex">
                <Link href="/student" className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brass-500 font-display text-sm font-bold text-white">
                        LMS
                    </div>
                    <div className="min-w-0">
                        <div className="truncate font-display text-sm font-bold text-white">
                            {appName ?? 'LMS SMK'}
                        </div>
                        <div className="text-xs text-white/50">Ruang Siswa</div>
                    </div>
                </Link>

                <nav className="flex-1 space-y-1 px-3 py-4">
                    {navItems.map((item) => {
                        const active = isActive(url, item);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                preserveScroll
                                className={
                                    'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
                                    (active
                                        ? 'bg-white/10 text-white'
                                        : 'text-zinc-300 hover:bg-white/5 hover:text-white')
                                }
                            >
                                <NavIcon name={item.icon} className={'h-4 w-4 ' + (active ? 'text-brass-300' : 'text-white/40')} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="border-t border-white/10 p-3">
                    <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass-500 text-xs font-semibold text-white">
                            {(auth?.user?.name ?? '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white">{auth?.user?.name}</div>
                            <div className="truncate text-xs text-white/50">
                                {active_year ? `TP ${active_year.name} ${active_year.semester}` : 'Siswa'}
                            </div>
                        </div>
                    </div>
                    <Link
                        href="/logout"
                        method="post"
                        as="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white"
                    >
                        Keluar
                    </Link>
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur sm:px-6 md:h-16">
                    <div className="flex items-center gap-1 overflow-x-auto md:hidden">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={
                                    'flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium ' +
                                    (isActive(url, item)
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'text-zinc-600 hover:bg-zinc-100')
                                }
                            >
                                <NavIcon name={item.icon} className="h-3.5 w-3.5" />
                                {item.label}
                            </Link>
                        ))}
                    </div>
                    <div className="hidden text-sm font-medium text-zinc-500 md:block">
                        {active_year ? `Tahun Pelajaran ${active_year.name} · ${active_year.semester}` : 'Ruang Siswa'}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-sm font-medium text-zinc-700 sm:block">{auth?.user?.name}</span>
                        <Link
                            href="/logout"
                            method="post"
                            as="button"
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                        >
                            Keluar
                        </Link>
                    </div>
                </header>

                <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">{children}</main>
            </div>
        </div>
    );
}
