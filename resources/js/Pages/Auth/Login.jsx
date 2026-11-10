import { useEffect } from 'react';
import { useForm, usePage } from '@inertiajs/react';
import AuthLayout from '@/Layouts/AuthLayout';
import { Button, Label, inputClass } from '@/Components/ui';

export default function Login() {
    const { flash } = usePage().props;
    const { data, setData, post, processing, errors } = useForm({
        username: '',
        password: '',
    });

    useEffect(() => {
        if (flash?.error) {
            // keep message visible on next submit
        }
    }, [flash?.error]);

    function submit() {
        post('/login');
    }

    return (
        <AuthLayout>
            <h1 className="font-display text-lg font-bold text-zinc-900">Masuk</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
                Gunakan username &amp; password akun Anda.
            </p>

            {(flash?.error || errors.username || errors.password) && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {flash?.error || errors.username || errors.password}
                </div>
            )}

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
                className="mt-4 space-y-3"
            >
                <div>
                    <Label>Username</Label>
                    <input
                        className={inputClass}
                        value={data.username}
                        placeholder="admin"
                        autoComplete="username"
                        onChange={(e) => setData('username', e.target.value)}
                    />
                </div>
                <div>
                    <Label>Password</Label>
                    <input
                        type="password"
                        className={inputClass}
                        value={data.password}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        onChange={(e) => setData('password', e.target.value)}
                    />
                </div>
                <Button type="submit" className="w-full" disabled={processing}>
                    {processing ? 'Memproses…' : 'Masuk'}
                </Button>
            </form>
        </AuthLayout>
    );
}
