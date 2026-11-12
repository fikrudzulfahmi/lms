<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('learning_modules', function (Blueprint $table) {
            $table->boolean('exam_mode')->default(false);
            $table->boolean('results_released')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('learning_modules', function (Blueprint $table) {
            $table->dropColumn(['exam_mode', 'results_released']);
        });
    }
};
