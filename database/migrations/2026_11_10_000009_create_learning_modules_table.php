<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('learning_modules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teaching_assignment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('learning_objective_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->enum('assessment_type', ['formatif', 'sumatif_lingkup_materi', 'sumatif_akhir_semester'])->default('formatif');
            $table->unsignedInteger('kktp_score')->default(75);
            $table->unsignedInteger('max_attempts')->default(1);
            $table->enum('status', ['draft', 'published'])->default('draft');
            $table->json('settings')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('learning_modules');
    }
};
