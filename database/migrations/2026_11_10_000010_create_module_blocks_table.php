<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('module_blocks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('module_id')->constrained('learning_modules')->cascadeOnDelete();
            $table->unsignedInteger('order_index');
            $table->string('block_type');
            $table->unsignedInteger('points')->default(0);
            $table->json('content');
            $table->text('ai_rubric')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('module_blocks');
    }
};
