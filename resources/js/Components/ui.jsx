export function Card({ children, className = '', as: Tag = 'div', ...props }) {
    return (
        <Tag
            {...props}
            className={`rounded-[20px] border border-zinc-200/80 bg-white p-6 shadow-card ring-1 ring-zinc-900/[0.03] ${className}`}
        >
            {children}
        </Tag>
    );
}

export function CardHeader({ title, subtitle, actions = null, eyebrow = null }) {
    return (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
                {eyebrow && (
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brass-700">{eyebrow}</div>
                )}
                <h2 className="font-display text-[17px] font-bold tracking-tight text-zinc-900">{title}</h2>
                {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
        </div>
    );
}

export function PageHeader({ title, subtitle = null, actions = null, eyebrow = null }) {
    return (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
                {eyebrow && (
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brass-700">{eyebrow}</div>
                )}
                <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-zinc-900">{title}</h1>
                {subtitle && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function Badge({ children, tone = 'zinc', dot = false }) {
    const tones = {
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        zinc: 'border-zinc-200 bg-zinc-50 text-zinc-600',
        red: 'border-red-200 bg-red-50 text-red-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-700',
        slate: 'border-zinc-300 bg-white text-zinc-700',
        brass: 'border-brass-200 bg-brass-50 text-brass-700',
        ink: 'border-ink-200 bg-ink-50 text-ink-700',
    };
    const dots = {
        emerald: 'bg-emerald-500',
        zinc: 'bg-zinc-400',
        red: 'bg-red-500',
        amber: 'bg-amber-500',
        slate: 'bg-zinc-500',
        brass: 'bg-brass-500',
        ink: 'bg-ink-600',
    };
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5 ${
                tones[tone] ?? tones.zinc
            }`}
        >
            {dot && <span className={`h-1.5 w-1.5 rounded-full ${dots[tone] ?? dots.zinc}`} />}
            {children}
        </span>
    );
}

export function Spinner({ className = 'h-3.5 w-3.5' }) {
    return (
        <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
        </svg>
    );
}

export function Button({
    children,
    variant = 'primary',
    size = 'md',
    className = '',
    type = 'button',
    loading = false,
    icon = null,
    ...props
}) {
    const variants = {
        primary:
            'bg-ink-900 text-white shadow-sm hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50',
        soft: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50',
        outline:
            'border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:border-brass-400 hover:bg-brass-50 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-50',
        danger:
            'border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50',
        ghost:
            'bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50',
    };
    const sizes = {
        xs: 'px-2 py-1 text-[11px]',
        sm: 'px-2.5 py-1.5 text-xs',
        md: 'px-3.5 py-2 text-sm',
    };
    return (
        <button
            {...props}
            type={type}
            disabled={props.disabled || loading}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-500/40 ${
                sizes[size] ?? sizes.md
            } ${variants[variant] ?? variants.primary} ${className}`}
        >
            {loading ? <Spinner /> : icon}
            {children}
        </button>
    );
}

export function Label({ children, htmlFor }) {
    return (
        <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-zinc-700">
            {children}
        </label>
    );
}

export const inputClass =
    'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-[inset_0_1px_1px_rgba(15,32,64,0.04)] placeholder:text-zinc-400 transition-colors focus:border-brass-500 focus:outline-none focus:ring-2 focus:ring-brass-500/20 disabled:bg-zinc-50 disabled:text-zinc-400';

export const selectClass = inputClass;

export function Field({ label, error, children, hint = null }) {
    return (
        <div>
            {label && <Label>{label}</Label>}
            {children}
            {hint && !error && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
            {error && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                    <span className="inline-block h-1 w-1 rounded-full bg-red-500" />
                    {error}
                </p>
            )}
        </div>
    );
}

export function Alert({ tone = 'info', title = null, children = null, onClose = null }) {
    const tones = {
        info: 'border-sky-200 bg-sky-50 text-sky-800',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        warning: 'border-amber-200 bg-amber-50 text-amber-800',
        error: 'border-red-200 bg-red-50 text-red-800',
    };
    return (
        <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${tones[tone] ?? tones.info}`}>
            <div>
                {title && <div className="font-semibold">{title}</div>}
                {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
            </div>
            {onClose && (
                <button type="button" onClick={onClose} aria-label="Tutup" className="shrink-0 opacity-60 hover:opacity-100">
                    ✕
                </button>
            )}
        </div>
    );
}

export function EmptyState({ title, description = null, action = null, icon = null }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-gradient-to-b from-zinc-50/80 to-white px-5 py-10 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-brass-100 bg-brass-50 text-brass-700">
                {icon ?? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                    </svg>
                )}
            </div>
            <p className="font-display text-sm font-bold text-zinc-800">{title}</p>
            {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-500">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

export function StatCard({ label, value, hint = null, accent = false, onClick = null, active = false, icon = null }) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={`group relative flex h-full flex-col overflow-hidden rounded-[20px] border bg-white p-4 text-left transition-all ${
                active
                    ? 'border-brass-400 ring-2 ring-brass-100'
                    : 'border-zinc-200/80 shadow-card'
            } ${onClick ? 'hover:-translate-y-0.5 hover:border-brass-400 hover:shadow-raised' : ''}`}
        >
            {accent && <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-ink-900 via-ink-600 to-brass-500" />}
            <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
                {icon && (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brass-50 text-brass-700">
                        {icon}
                    </span>
                )}
            </div>
            <div className="mt-2 font-display text-[32px] font-bold leading-none tabular-nums text-zinc-900">{value}</div>
            {hint && <div className="mt-1.5 text-xs text-zinc-500">{hint}</div>}
        </Tag>
    );
}

export function Toggle({ on, onChange, label = '', disabled = false }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            disabled={disabled}
            onClick={onChange}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                on ? 'bg-emerald-600' : 'bg-zinc-200'
            }`}
        >
            <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    on ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
        </button>
    );
}

export function Modal({ open, title, subtitle = null, onClose, children, footer = null, wide = false }) {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-4 backdrop-blur-sm sm:items-center"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose?.();
            }}
        >
            <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-[20px] border border-zinc-200 bg-white shadow-raised`}>
                <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
                    <div>
                        <h3 className="font-display text-base font-bold tracking-tight text-zinc-900">{title}</h3>
                        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup"
                        className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                    >
                        ✕
                    </button>
                </div>
                <div className="px-5 py-4">{children}</div>
                {footer && <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3">{footer}</div>}
            </div>
        </div>
    );
}

export function Toolbar({ children }) {
    return (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-[20px] border border-zinc-200/80 bg-white p-3 shadow-card">
            {children}
        </div>
    );
}
