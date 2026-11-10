<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('learning_modules', function (Blueprint $table) {
            $table->string('ai_status')->nullable()->after('settings');
            $table->text('ai_error')->nullable()->after('ai_status');
            $table->timestamp('ai_generated_at')->nullable()->after('ai_error');
        });
    }

    public function down(): void
    {
        Schema::table('learning_modules', function (Blueprint $table) {
            $table->dropColumn(['ai_status', 'ai_error', 'ai_generated_at']);
        });
    }
};
