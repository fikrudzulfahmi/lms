import { createInertiaApp } from '@inertiajs/react';

createInertiaApp({
    title: (title) => (title ? `${title} — LMS SMK` : 'LMS SMK'),
    resolve: (name) => {
        const pages = import.meta.glob('./Pages/**/*.jsx', { eager: true });
        return pages[`./Pages/${name}.jsx`];
    },
    // Inertia v3 memasang aplikasi otomatis ke elemen dengan id ini.
    // (Opsi `el` dari v1/v2 tidak dikenal di v3 dan diabaikan.)
    id: 'app',
    progress: {
        color: '#0E6B52',
        show: true,
        delay: 150,
    },
});
