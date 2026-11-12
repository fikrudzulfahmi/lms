<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Bersihkan duplikat lama (satu blok + satu siswa seharusnya hanya
        // punya satu jawaban; updateOrCreate mengandalkan itu). Simpan
        // baris terbaru per pasangan.
        $duplicates = DB::table('student_responses')
            ->select('module_block_id', 'student_id')
            ->groupBy('module_block_id', 'student_id')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($duplicates as $pair) {
            $ids = DB::table('student_responses')
                ->where('module_block_id', $pair->module_block_id)
                ->where('student_id', $pair->student_id)
                ->orderByDesc('id')
                ->pluck('id')
                ->all();

            $keep = array_shift($ids);

            if ($ids !== []) {
                DB::table('student_responses')->whereIn('id', $ids)->delete();
            }
        }

        Schema::table('student_responses', function (Blueprint $table) {
            $table->unique(['module_block_id', 'student_id']);
        });
    }

    public function down(): void
    {
        Schema::table('student_responses', function (Blueprint $table) {
            $table->dropUnique(['module_block_id', 'student_id']);
        });
    }
};
