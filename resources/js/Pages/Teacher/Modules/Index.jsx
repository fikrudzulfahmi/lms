import { Head, Link, useForm } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import TeacherLayout from '@/Layouts/TeacherLayout';
import { Badge, Button, EmptyState, Field, Modal, PageHeader, StatCard, Toolbar, inputClass, selectClass } from '@/Components/ui';

const ASSESSMENT_LABELS = {
    formatif: 'Formatif',
    sumatif_lingkup_materi: 'Sumatif Lingkup Materi',
    sumatif_akhir_semester: 'Sumatif Akhir Semester',
};

function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export default function Index({
    modules = [],
    assignments = [],
    objectives = [],
    assessment_types = [],
    stats = { total: 0, draft: 0, published: 0, blocks: 0 },
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const form = useForm({
        teaching_assignment_id: assignments[0]?.id ?? '',
        learning_objective_id: '',
        title: '',
        assessment_type: 'formatif',
        kktp_score: 75,
        max_attempts: 1,
    });

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();

        return modules.filter((module) => {
            const matchStatus = statusFilter === 'all' || module.status === statusFilter;
            const haystack = [module.title, module.subject, module.subject_code, module.classroom]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return matchStatus && (term === '' || haystack.includes(term));
        });
    }, [modules, query, statusFilter]);

    const selectedAssignment = assignments.find(
        (assignment) => String(assignment.id) === String(form.data.teaching_assignment_id),
    );

    const filteredObjectives = objectives.filter(
        (objective) =>
            !selectedAssignment || objective.subject_id === selectedAssignment.subject_id,
    );

    function submit(event) {
        event.preventDefault();

        form.post('/teacher/modules', {
            preserveScroll: true,
            onSuccess: () => {
                setOpen(false);
                form.reset('title', 'learning_objective_id');
            },
        });
    }

    return (
        <TeacherLayout>
            <Head title="Modul Ajar" />

            <PageHeader
                eyebrow="Studio Guru"
                title="Modul Ajar"
                subtitle="Susun materi, SOP praktikum, dan soal interaktif dengan block studio."
                actions={
                    <Button onClick={() => setOpen(true)} disabled={assignments.length === 0}>
                        + Modul Baru
                    </Button>
                }
            />

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Total Modul" value={stats.total} accent hint="Semua modul milik Anda" />
                <StatCard label="Draft" value={stats.draft} hint="Belum diterbitkan" />
                <StatCard label="Terbit" value={stats.published} hint="Bisa diakses siswa" />
                <StatCard label="Total Blok" value={stats.blocks} hint="Materi & soal tersusun" />
            </div>

            <Toolbar>
                <div className="relative min-w-0 flex-1 sm:max-w-sm">
                    <svg
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.75}
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
                    </svg>
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Cari judul, mapel, atau kelas..."
                        className={`${inputClass} pl-9`}
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className={`${selectClass} !w-auto min-w-[9.5rem] shrink-0`}
                >
                    <option value="all">Semua status</option>
                    <option value="draft">Draft</option>
                    <option value="published">Terbit</option>
                </select>
                <span className="ml-auto rounded-md bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-500">
                    {filtered.length} / {modules.length} modul
                </span>
            </Toolbar>

            {assignments.length === 0 ? (
                <EmptyState
                    title="Belum ada ploting mengajar"
                    description="Minta admin memploting Anda ke mata pelajaran dan kelas pada tahun pelajaran aktif."
                />
            ) : filtered.length === 0 ? (
                <EmptyState
                    title={modules.length === 0 ? 'Belum ada modul' : 'Tidak ada modul yang cocok'}
                    description={
                        modules.length === 0
                            ? 'Mulai dengan membuat modul pertama, lalu susun blok materi dan soal.'
                            : 'Ubah kata kunci atau filter status.'
                    }
                    action={
                        modules.length === 0 ? (
                            <Button onClick={() => setOpen(true)}>+ Modul Baru</Button>
                        ) : null
                    }
                />
            ) : (
                <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-zinc-100 bg-zinc-50/80 text-[11px] uppercase tracking-wider text-zinc-500">
                                <tr>
                                    <th className="px-4 py-2.5 font-semibold">Modul</th>
                                    <th className="px-4 py-2.5 font-semibold">Mapel &amp; Kelas</th>
                                    <th className="px-4 py-2.5 font-semibold">Status</th>
                                    <th className="px-4 py-2.5 text-right font-semibold">Blok</th>
                                    <th className="px-4 py-2.5 font-semibold">Diperbarui</th>
                                    <th className="px-4 py-2.5" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                                {filtered.map((module) => (
                                    <tr key={module.id} className="group transition-colors hover:bg-emerald-50/30">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-zinc-900 group-hover:text-emerald-800">{module.title}</div>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                                                <span>{ASSESSMENT_LABELS[module.assessment_type]}</span>
                                                <span className="text-zinc-300">·</span>
                                                <span>KKTP {module.kktp_score}</span>
                                                {module.objective_code && (
                                                    <>
                                                        <span className="text-zinc-300">·</span>
                                                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700">
                                                            {module.objective_code}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-zinc-800">{module.subject}</div>
                                            <div className="mt-0.5 text-xs text-zinc-500">
                                                {module.classroom} · {module.year} {module.semester}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge tone={module.status === 'published' ? 'emerald' : 'zinc'} dot>
                                                {module.status === 'published' ? 'Terbit' : 'Draft'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="inline-flex min-w-[1.75rem] justify-center rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700">
                                                {module.blocks_count}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-zinc-500">{formatDate(module.updated_at)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <Link
                                                href={`/teacher/modules/${module.id}/edit`}
                                                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors group-hover:border-emerald-300 group-hover:text-emerald-700 hover:bg-emerald-50"
                                            >
                                                Buka Studio
                                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                                                </svg>
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <Modal
                open={open}
                title="Modul baru"
                subtitle="Pilih kelas yang diampu, lalu tentukan jenis asesmen."
                onClose={() => setOpen(false)}
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setOpen(false)}>
                            Batal
                        </Button>
                        <Button onClick={submit} disabled={form.processing}>
                            {form.processing ? 'Menyimpan...' : 'Buat & Buka Studio'}
                        </Button>
                    </>
                }
            >
                <form onSubmit={submit} className="space-y-3">
                    <Field label="Kelas & mata pelajaran" error={form.errors.teaching_assignment_id}>
                        <select
                            value={form.data.teaching_assignment_id}
                            onChange={(event) => {
                                form.setData('teaching_assignment_id', event.target.value);
                                form.setData('learning_objective_id', '');
                            }}
                            className={selectClass}
                        >
                            {assignments.map((assignment) => (
                                <option key={assignment.id} value={assignment.id}>
                                    {assignment.subject_code} · {assignment.subject} — {assignment.classroom}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Judul modul" error={form.errors.title}>
                        <input
                            value={form.data.title}
                            onChange={(event) => form.setData('title', event.target.value)}
                            className={inputClass}
                            placeholder="Contoh: Diagnosa Sistem Injeksi PGM-FI"
                            maxLength={180}
                        />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Jenis asesmen" error={form.errors.assessment_type}>
                            <select
                                value={form.data.assessment_type}
                                onChange={(event) => form.setData('assessment_type', event.target.value)}
                                className={selectClass}
                            >
                                {assessment_types.map((type) => (
                                    <option key={type.value} value={type.value}>
                                        {type.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="KKTP" error={form.errors.kktp_score}>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={form.data.kktp_score}
                                onChange={(event) => form.setData('kktp_score', event.target.value)}
                                className={`${inputClass} font-mono`}
                            />
                        </Field>
                    </div>

                    <Field
                        label="Tujuan pembelajaran (opsional)"
                        error={form.errors.learning_objective_id}
                        hint={
                            filteredObjectives.length === 0
                                ? 'Belum ada TP untuk mapel ini.'
                                : 'TP tersimpan pada modul untuk pemetaan capaian.'
                        }
                    >
                        <select
                            value={form.data.learning_objective_id}
                            onChange={(event) => form.setData('learning_objective_id', event.target.value)}
                            className={selectClass}
                        >
                            <option value="">— tanpa TP —</option>
                            {filteredObjectives.map((objective) => (
                                <option key={objective.id} value={objective.id}>
                                    {objective.code} — {objective.description.slice(0, 90)}
                                </option>
                            ))}
                        </select>
                    </Field>
                </form>
            </Modal>
        </TeacherLayout>
    );
}
