<?php

return [
    /*
    |--------------------------------------------------------------------------
    | KKTP (Kriteria Ketercapaian Tujuan Pembelajaran)
    |--------------------------------------------------------------------------
    | Ambang batas default ketika modul tidak menetapkan `kktp_score` sendiri.
    */
    'kktp' => [
        'default' => (int) env('LMS_KKTP_DEFAULT', 75),
    ],

    /*
    |--------------------------------------------------------------------------
    | Bobot Nilai Akhir per Jenis Asesmen
    |--------------------------------------------------------------------------
    | Bobot dijumlahkan lalu dinormalisasi ulang terhadap jenis asesmen yang
    | benar-benar dimiliki siswa, sehingga mapel tanpa sumatif akhir semester
    | tetap menghasilkan nilai akhir 0-100 yang wajar.
    */
    'weights' => [
        'formatif' => (float) env('LMS_WEIGHT_FORMATIF', 0.30),
        'sumatif_lingkup_materi' => (float) env('LMS_WEIGHT_SUMATIF_LINGKUP', 0.30),
        'sumatif_akhir_semester' => (float) env('LMS_WEIGHT_SUMATIF_AKHIR', 0.40),
    ],
];
