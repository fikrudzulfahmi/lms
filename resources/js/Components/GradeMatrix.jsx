const STATUS_STYLES = {
    tuntas: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    belum: 'border-amber-200 bg-amber-50 text-amber-700',
    belum_ada_nilai: 'border-zinc-200 bg-zinc-50 text-zinc-500',
};

const STATUS_LABELS = {
    tuntas: 'Tuntas',
    belum: 'Belum Tuntas',
    belum_ada_nilai: 'Belum Ada Nilai',
};

export function ScorePill({ score, passed, className = '' }) {
    if (score === null || score === undefined) {
        return (
            <span className={`inline-flex min-w-[3.25rem] justify-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-xs text-zinc-400 ${className}`}>
                —
            </span>
        );
    }

    const tone =
        passed === null
            ? 'border-zinc-200 bg-zinc-50 text-zinc-600'
            : passed
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-700';

    return (
        <span className={`inline-flex min-w-[3.25rem] justify-center rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums ${tone} ${className}`}>
            {Number(score).toFixed(1)}
        </span>
    );
}

export function StatusBadge({ status }) {
    return (
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.belum_ada_nilai}`}>
            {STATUS_LABELS[status] ?? 'Belum Ada Nilai'}
        </span>
    );
}

export default function GradeMatrix({ matrix, onCellClick = null, emptyLabel = 'Belum ada data nilai.' }) {
    if (!matrix || matrix.students.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-8 text-center text-sm text-zinc-500">
                {emptyLabel}
            </div>
        );
    }

    const { columns, students, summary } = matrix;

    return (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
                <div className="text-sm text-zinc-600">
                    <span className="font-medium text-zinc-900">{summary.students}</span> siswa ·{' '}
                    <span className="font-medium text-emerald-700">{summary.tuntas}</span> tuntas ·{' '}
                    <span className="font-medium text-amber-700">{summary.belum}</span> belum tuntas
                </div>
                <div className="font-mono text-xs text-zinc-500">
                    Rata-rata kelas: {summary.average === null ? '—' : Number(summary.average).toFixed(2)} · KKTP {summary.kktp}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-zinc-50 text-left">
                            <th className="sticky left-0 z-10 min-w-[15rem] border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Siswa
                            </th>
                            {columns.map((column) => (
                                <th
                                    key={column.key}
                                    className="min-w-[9rem] border-b border-l border-zinc-200 px-3 py-2.5 align-top"
                                    title={column.description}
                                >
                                    <div className="font-mono text-[11px] font-semibold text-emerald-700">{column.code}</div>
                                    <div className="mt-0.5 line-clamp-2 max-w-[11rem] text-[11px] font-normal leading-snug text-zinc-500">
                                        {column.description}
                                    </div>
                                    <div className="mt-1 font-mono text-[10px] text-zinc-400">KKTP {column.kktp}</div>
                                </th>
                            ))}
                            <th className="min-w-[7rem] border-b border-l border-zinc-200 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Nilai Akhir
                            </th>
                            <th className="min-w-[8rem] border-b border-l border-zinc-200 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Status KKTP
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((student) => (
                            <tr key={student.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/70">
                                <td className="sticky left-0 z-10 bg-white px-4 py-2.5">
                                    <div className="font-medium text-zinc-900">{student.name}</div>
                                    <div className="font-mono text-[11px] text-zinc-400">{student.nisn ?? student.username}</div>
                                </td>
                                {columns.map((column) => {
                                    const cell = student.cells[column.key];

                                    return (
                                        <td key={column.key} className="border-l border-zinc-100 px-3 py-2.5">
                                            {onCellClick ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onCellClick(student, column)}
                                                    className="group inline-flex items-center gap-1.5 rounded-md hover:opacity-80"
                                                    title="Buka detail & override"
                                                >
                                                    <ScorePill score={cell?.score ?? null} passed={cell?.passed ?? null} />
                                                    {cell?.has_override && (
                                                        <span className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[10px] text-amber-700">
                                                            OVR
                                                        </span>
                                                    )}
                                                </button>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <ScorePill score={cell?.score ?? null} passed={cell?.passed ?? null} />
                                                    {cell?.has_override && (
                                                        <span className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[10px] text-amber-700">
                                                            OVR
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                        </td>
                                    );
                                })}
                                <td className="border-l border-zinc-100 px-3 py-2.5">
                                    <ScorePill score={student.final_score} passed={student.is_passed} />
                                </td>
                                <td className="border-l border-zinc-100 px-3 py-2.5">
                                    <StatusBadge status={student.status} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
