<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('question_bank_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('teacher_id')->constrained('users')->cascadeOnDelete();
            $table->string('block_type', 60);
            $table->unsignedInteger('points')->default(10);
            $table->json('content');
            $table->text('ai_rubric')->nullable();
            $table->string('topic')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_bank_items');
    }
};
