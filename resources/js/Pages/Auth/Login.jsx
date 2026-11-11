import { useForm, usePage } from '@inertiajs/react';
import AuthLayout from '@/Layouts/AuthLayout';
import { Button, Field, Label, inputClass } from '@/Components/ui';

export default function Login() {
    const { flash } = usePage().props;
    const { data, setData, post, processing, errors } = useForm({
        username: '',
        password: '',
    });

    function submit(event) {
        event.preventDefault();
        post('/login');
    }

    const message = flash?.error || errors.username || errors.password;

    return (
        <AuthLayout>
            <h1 className="font-display text-xl font-bold tracking-tight text-zinc-900">Masuk</h1>
            <p className="mt-1 text-sm text-zinc-500">Gunakan username &amp; password akun Anda.</p>

            {message && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 3.5h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                    </svg>
                    <span>{message}</span>
                </div>
            )}

            <form onSubmit={submit} className="mt-5 space-y-4">
                <Field label="Username" error={errors.username}>
                    <input
                        className={inputClass}
                        value={data.username}
                        placeholder="Masukkan username"
                        autoComplete="username"
                        autoFocus
                        onChange={(event) => setData('username', event.target.value)}
                    />
                </Field>

                <div>
                    <Label>Password</Label>
                    <input
                        type="password"
                        className={inputClass}
                        value={data.password}
                        placeholder="Password Anda"
                        autoComplete="current-password"
                        onChange={(event) => setData('password', event.target.value)}
                    />
                    {errors.password && <p className="mt-1 text-xs font-medium text-red-600">{errors.password}</p>}
                </div>

                <Button type="submit" className="w-full py-2.5" loading={processing}>
                    {processing ? 'Memproses…' : 'Masuk'}
                </Button>
            </form>

            <p className="mt-5 border-t border-zinc-100 pt-4 text-center text-xs leading-relaxed text-zinc-400">
                Siswa memakai username yang diberikan wali kelas.
                <br />
                Lupa password? Hubungi admin sekolah.
            </p>
        </AuthLayout>
    );
}
