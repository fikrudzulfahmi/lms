export function Card({ children, className = '', as: Tag = 'div', ...props }) {
    return (
        <Tag
            {...props}
            className={`rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04)] ${className}`}
        >
            {children}
        </Tag>
    );
}

export function CardHeader({ title, subtitle, actions = null }) {
    return (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
                <h2 className="font-display text-base font-bold text-zinc-900">
                    {title}
                </h2>
                {subtitle && (
                    <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>
                )}
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
        </div>
    );
}

export function PageHeader({ title, subtitle, actions = null }) {
    return (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
                <h1 className="font-display text-xl font-bold tracking-tight text-zinc-900">
                    {title}
                </h1>
                {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
            </div>
            {actions && (
                <div className="flex flex-wrap items-center gap-2">{actions}</div>
            )}
        </div>
    );
}

export function Badge({ children, tone = 'zinc' }) {
    const tones = {
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        zinc: 'border-zinc-200 bg-zinc-50 text-zinc-600',
        red: 'border-red-200 bg-red-50 text-red-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-700',
        slate: 'border-zinc-300 bg-white text-zinc-700',
    };
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs ${tones[tone] ?? tones.zinc}`}
        >
            {children}
        </span>
    );
}

export function Button({ children, variant = 'primary', size = 'md', className = '', type = 'button', ...props }) {
    const variants = {
        primary:
            'bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50',
        outline:
            'border border-zinc-200 bg-white text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50',
        danger:
            'border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50',
        ghost:
            'bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50',
    };
    const sizes = {
        sm: 'px-2.5 py-1 text-xs',
        md: 'px-3.5 py-2 text-sm',
    };
    return (
        <button
            {...props}
            type={type}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors ${sizes[size] ?? sizes.md} ${variants[variant] ?? variants.primary} ${className}`}
        >
            {children}
        </button>
    );
}

export function Label({ children, htmlFor }) {
    return (
        <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-zinc-600">
            {children}
        </label>
    );
}

export const inputClass =
    'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-zinc-50 disabled:text-zinc-400';

export const selectClass = inputClass;

export function Field({ label, error, children, hint = null }) {
    return (
        <div>
            {label && <Label>{label}</Label>}
            {children}
            {hint && !error && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
}

export function EmptyState({ title, description = null, action = null }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-8 text-center">
            <p className="text-sm font-medium text-zinc-700">{title}</p>
            {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
            {action && <div className="mt-3">{action}</div>}
        </div>
    );
}

export function StatCard({ label, value, hint = null, accent = false, onClick = null, active = false }) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={`rounded-xl border bg-white p-4 text-left transition-colors ${
                active
                    ? 'border-emerald-300 ring-1 ring-emerald-200'
                    : 'border-zinc-200'
            } ${onClick ? 'hover:border-emerald-300' : ''}`}
        >
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {label}
                </span>
                {accent && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </div>
            <div className="mt-1.5 font-display text-2xl font-bold tabular-nums text-zinc-900">
                {value}
            </div>
            {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/30 p-4 sm:items-center">
            <div
                className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-xl border border-zinc-200 bg-white shadow-xl`}
            >
                <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
                    <div>
                        <h3 className="font-display text-base font-bold text-zinc-900">{title}</h3>
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
                {footer && (
                    <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

export function Toolbar({ children }) {
    return (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 bg-white p-3">
            {children}
        </div>
    );
}
