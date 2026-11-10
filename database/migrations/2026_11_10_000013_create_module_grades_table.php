<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('module_grades', function (Blueprint $table) {
            $table->id();
            $table->foreignId('module_id')->constrained('learning_modules')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $table->decimal('total_earned_points', 6, 2)->default(0);
            $table->decimal('max_possible_points', 6, 2)->default(0);
            $table->decimal('final_score', 5, 2)->default(0);
            $table->boolean('is_passed')->default(false);
            $table->enum('status', ['in_progress', 'submitted', 'waiting_ai_grading', 'graded'])->default('in_progress');
            $table->json('student_notes')->nullable();
            $table->text('teacher_note')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('module_grades');
    }
};
