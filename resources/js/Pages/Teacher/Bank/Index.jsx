import { Head, router } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import TeacherLayout from '@/Layouts/TeacherLayout';
import { Badge, Button, Card, EmptyState, PageHeader, inputClass } from '@/Components/ui';

export default function BankIndex({ items = [] }) {
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('');

    const types = useMemo(
        () => [...new Set(items.map((item) => item.block_type))],
        [items],
    );

    const visible = items.filter((item) => {
        if (typeFilter && item.block_type !== typeFilter) return false;
        if (!query) return true;
        const needle = query.toLowerCase();
        return (
            item.snippet.toLowerCase().includes(needle) ||
            (item.topic ?? '').toLowerCase().includes(needle)
        );
    });

    function remove(item) {
        if (!window.confirm(`Hapus soal ini dari Bank Soal?\n\n“${item.snippet}”`)) return;
        router.delete(`/teacher/question-bank/${item.id}`, { preserveScroll: true });
    }

    return (
        <TeacherLayout>
            <Head title="Bank Soal" />

            <PageHeader
                title="Bank Soal"
                subtitle="Soal-soal simpananmu untuk dipakai ulang di modul mana pun. Simpan soal dari Studio lewat tombol “Ke Bank Soal” pada blok soal."
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Cari soal atau topik..."
                    className={`${inputClass} max-w-xs`}
                />
                <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                    className={`${inputClass} max-w-56`}
                >
                    <option value="">Semua tipe</option>
                    {types.map((type) => (
                        <option key={type} value={type}>
                            {items.find((item) => item.block_type === type)?.label ?? type}
                        </option>
                    ))}
                </select>
                <span className="font-mono text-xs text-zinc-400">{visible.length} soal</span>
            </div>

            {items.length === 0 ? (
                <EmptyState
                    title="Bank Soal masih kosong"
                    description="Buka sebuah modul di Studio, pilih blok soal, lalu klik “Ke Bank Soal” untuk menyimpan soal ke sini."
                />
            ) : visible.length === 0 ? (
                <EmptyState title="Tidak ada soal yang cocok" description="Coba kata kunci atau filter lain." />
            ) : (
                <div className="grid gap-3 md:grid-cols-2">
                    {visible.map((item) => (
                        <Card key={item.id} className="p-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Badge tone="emerald">{item.label}</Badge>
                                <span className="font-mono text-[11px] text-zinc-400">{item.points} poin</span>
                                {item.topic && (
                                    <span className="truncate text-[11px] text-zinc-400">· {item.topic}</span>
                                )}
                            </div>
                            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-zinc-700">
                                {item.snippet}
                            </p>
                            <div className="mt-3 flex items-center justify-between">
                                <span className="text-[11px] text-zinc-400">
                                    {item.created_at
                                        ? new Date(item.created_at).toLocaleDateString('id-ID', {
                                              day: 'numeric',
                                              month: 'short',
                                              year: 'numeric',
                                          })
                                        : ''}
                                </span>
                                <Button size="sm" variant="ghost" onClick={() => remove(item)}>
                                    Hapus
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </TeacherLayout>
    );
}
