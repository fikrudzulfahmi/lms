<?php

return [

    /*
    |--------------------------------------------------------------------------
    | SSR
    |--------------------------------------------------------------------------
    | No Node SSR runtime in this deployment: pages are rendered client-side.
    */

    'ssr' => [
        'enabled' => false,
    ],

    /*
    |--------------------------------------------------------------------------
    | Pages
    |--------------------------------------------------------------------------
    | The React pages live in resources/js/Pages (capital P), which is not the
    | framework default (resources/js/pages).
    */

    'pages' => [
        'ensure_pages_exist' => true,
        'paths' => [
            resource_path('js/Pages'),
        ],
        'extensions' => [
            'jsx',
            'js',
        ],
    ],

    'testing' => [
        'ensure_pages_exist' => true,
    ],

];
