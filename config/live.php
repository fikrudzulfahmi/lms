<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Live Classroom (ws-hub)
    |--------------------------------------------------------------------------
    |
    | public_ws_url : URL WebSocket yang dikirim ke browser (guru & siswa).
    | internal_secret : shared secret antara Laravel dan ws-hub. Dipakai untuk
    |                   header X-Internal-Secret dan HMAC control token guru.
    |                   Fallback ke APP_KEY agar tidak pernah kosong.
    |
    */

    'public_ws_url' => env('LIVE_WS_PUBLIC_URL', 'ws://127.0.0.1:8081/ws/connect'),

    'internal_secret' => env('LIVE_INTERNAL_SECRET') ?: env('APP_KEY'),

    'internal_api_url' => rtrim((string) env('LIVE_INTERNAL_URL', env('APP_URL', '')), '/'),

    'internal_validate_path' => '/internal/live-sessions/validate',

    'pin_length' => 6,

    'max_answer_bytes' => 16384,

];
