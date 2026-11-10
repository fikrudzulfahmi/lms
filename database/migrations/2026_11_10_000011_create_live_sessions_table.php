<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('live_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('module_id')->constrained('learning_modules')->cascadeOnDelete();
            $table->string('pin_code', 6)->index();
            $table->uuid('current_block_id')->nullable();
            $table->enum('status', ['waiting', 'active', 'ended'])->default('waiting');
            $table->timestamps();

            $table->foreign('current_block_id')
                ->references('id')->on('module_blocks')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('live_sessions');
    }
};
