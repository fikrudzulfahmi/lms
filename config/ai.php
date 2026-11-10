<?php

return [

    /*
    |--------------------------------------------------------------------------
    | AI Gateway (OpenAI-compatible)
    |--------------------------------------------------------------------------
    |
    | Semua nilai diambil dari environment. Jangan pernah menaruh API key
    | langsung di repository. Gateway Jev/9router memakai format /v1.
    |
    */

    'base_url' => rtrim((string) env('AI_BASE_URL', 'http://127.0.0.1:20130/v1'), '/'),

    'api_key' => env('AI_API_KEY'),

    'model' => env('AI_MODEL', 'ds/deepseek-flash'),

    'timeout' => (int) env('AI_TIMEOUT', 90),

    'max_tokens' => (int) env('AI_MAX_TOKENS', 3500),

];
