import { createInertiaApp } from '@inertiajs/react';

createInertiaApp({
    title: (title) => (title ? `${title} — LMS SMK` : 'LMS SMK'),
    resolve: (name) => {
        const pages = import.meta.glob('./Pages/**/*.jsx', { eager: true });
        return pages[`./Pages/${name}.jsx`];
    },
    el: 'app',
    progress: {
        color: '#059669',
        show: true,
        delay: 150,
    },
});
