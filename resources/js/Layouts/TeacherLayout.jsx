import { Link, usePage } from '@inertiajs/react';

const navItems = [
    { label: 'Modul Ajar', href: '/teacher/modules', exact: false },
    { label: 'Buku Nilai', href: '/teacher/gradebook', exact: false },
];

function isActive(url, item) {
    const path = (url || '').split('?')[0];
    return item.exact ? path === item.href : path.startsWith(item.href);
}

export default function TeacherLayout({ children }) {
    const { url, flash, auth, active_year, appName } = usePage().props;
    const isAdmin = auth?.user?.role === 'admin';

    return (
        <div className="flex min-h-full">
            <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex">
                <Link href="/teacher/modules" className="flex h-16 items-center gap-2.5 border-b border-zinc-200 px-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 font-display text-sm font-bold text-white">
                        LMS
                    </div>
                    <div className="min-w-0">
                        <div className="truncate font-display text-sm font-bold text-zinc-900">
                            {appName ?? 'LMS SMK'}
                        </div>
                        <div className="text-xs text-zinc-500">Studio Guru</div>
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
                                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
                                    (active
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900')
                                }
                            >
                                <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                        active ? 'bg-emerald-500' : 'bg-zinc-300'
                                    }`}
                                />
                                {item.label}
                            </Link>
                        );
                    })}

                    {isAdmin && (
                        <Link
                            href="/admin"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                            Kembali ke Admin
                        </Link>
                    )}
                </nav>

                <div className="border-t border-zinc-200 px-5 py-4">
                    {active_year ? (
                        <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs text-emerald-700">
                            TP {active_year.name} {active_year.semester}
                        </span>
                    ) : (
                        <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-mono text-xs text-zinc-500">
                            Tidak ada TP aktif
                        </span>
                    )}
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 sm:px-6">
                    <div className="flex gap-1 overflow-x-auto md:hidden">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={
                                    'whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium ' +
                                    (isActive(url, item)
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'text-zinc-600 hover:bg-zinc-100')
                                }
                            >
                                {item.label}
                            </Link>
                        ))}
                    </div>
                    <div className="hidden text-sm font-medium text-zinc-500 md:block">
                        Studio Editor · Block-Based Learning
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                        <div className="hidden text-right sm:block">
                            <div className="text-sm font-medium text-zinc-900">{auth?.user?.name}</div>
                            <div className="text-xs capitalize text-zinc-500">{auth?.user?.role}</div>
                        </div>
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

                {flash?.success && (
                    <div className="mx-4 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 sm:mx-6">
                        {flash.success}
                    </div>
                )}
                {flash?.error && (
                    <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 sm:mx-6">
                        {flash.error}
                    </div>
                )}

                <main className="flex-1 p-4 sm:p-6">
                    <div className="mx-auto w-full max-w-[1500px]">{children}</div>
                </main>
            </div>
        </div>
    );
}
