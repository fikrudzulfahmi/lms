import { Head, Link, useForm } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import TeacherLayout from '@/Layouts/TeacherLayout';
import { Badge, Button, EmptyState, Field, Modal, PageHeader, StatCard, inputClass, selectClass } from '@/Components/ui';

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
                title="Modul Ajar"
                subtitle="Susun materi, SOP praktikum, dan soal interaktif dengan block studio."
                actions={
                    <Button onClick={() => setOpen(true)} disabled={assignments.length === 0}>
                        + Modul Baru
                    </Button>
                }
            />

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Total Modul" value={stats.total} accent />
                <StatCard label="Draft" value={stats.draft} />
                <StatCard label="Terbit" value={stats.published} />
                <StatCard label="Total Blok" value={stats.blocks} />
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3">
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Cari judul, mapel, atau kelas..."
                    className={`${inputClass} max-w-sm`}
                />
                <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className={`${selectClass} max-w-[160px]`}
                >
                    <option value="all">Semua status</option>
                    <option value="draft">Draft</option>
                    <option value="published">Terbit</option>
                </select>
                <span className="ml-auto font-mono text-xs text-zinc-400">
                    {filtered.length} / {modules.length} modul
                </span>
            </div>

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
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Modul</th>
                                    <th className="px-4 py-3 font-medium">Mapel & Kelas</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                    <th className="px-4 py-3 text-right font-medium">Blok</th>
                                    <th className="px-4 py-3 font-medium">Diperbarui</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                                {filtered.map((module) => (
                                    <tr key={module.id} className="hover:bg-zinc-50/70">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-zinc-900">{module.title}</div>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                                                <span>{ASSESSMENT_LABELS[module.assessment_type]}</span>
                                                <span className="text-zinc-300">·</span>
                                                <span>KKTP {module.kktp_score}</span>
                                                {module.objective_code && (
                                                    <>
                                                        <span className="text-zinc-300">·</span>
                                                        <span className="font-mono text-emerald-700">
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
                                            <Badge tone={module.status === 'published' ? 'emerald' : 'zinc'}>
                                                {module.status === 'published' ? 'Terbit' : 'Draft'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-xs text-zinc-600">
                                            {module.blocks_count}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-zinc-500">
                                            {formatDate(module.updated_at)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Link
                                                href={`/teacher/modules/${module.id}/edit`}
                                                className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                                            >
                                                Buka Studio →
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
