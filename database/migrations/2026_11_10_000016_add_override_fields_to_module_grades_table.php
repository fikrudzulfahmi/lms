<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('module_grades', function (Blueprint $table) {
            $table->decimal('override_score', 5, 2)->nullable()->after('final_score');
            $table->text('override_reason')->nullable()->after('override_score');
            $table->foreignId('overridden_by')->nullable()->after('override_reason')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('overridden_at')->nullable()->after('overridden_by');

            // Satu baris rekap per siswa per modul: dasar upsert idempoten.
            $table->unique(['module_id', 'student_id'], 'module_grades_module_student_unique');
        });
    }

    public function down(): void
    {
        Schema::table('module_grades', function (Blueprint $table) {
            $table->dropUnique('module_grades_module_student_unique');
            $table->dropConstrainedForeignId('overridden_by');
            $table->dropColumn(['override_score', 'override_reason', 'overridden_at']);
        });
    }
};
