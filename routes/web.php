<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\Internal\LiveSessionValidationController;
use App\Http\Controllers\Student\GradeController;
use App\Http\Controllers\Student\HomeController as StudentHomeController;
use App\Http\Controllers\Student\LiveController;
use App\Http\Controllers\Student\PracticeController;
use App\Http\Controllers\SubjectController;
use App\Http\Controllers\Teacher\AiCurriculumController;
use App\Http\Controllers\Teacher\GradebookController;
use App\Http\Controllers\Teacher\LiveSessionController;
use App\Http\Controllers\Teacher\ModuleBlockController;
use App\Http\Controllers\Teacher\ModuleController;
use App\Http\Controllers\Teacher\ModuleSlideController;
use App\Http\Controllers\Teacher\ObjectiveController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', function (Request $request) {
    if ($request->user() === null) {
        return redirect()->route('login');
    }

    return redirect(app(\App\Http\Controllers\AuthController::class)->homeFor($request->user()));
});

Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
});

if (app()->environment(['local', 'staging'])) {
    Route::get('/dev/login', [AuthController::class, 'devLogin'])->name('dev.login');
}

// Internal service-to-service (ws-hub). Auth: X-Internal-Secret, CSRF-exempt.
Route::post('/internal/live-sessions/validate', [LiveSessionValidationController::class, 'validateSession'])
    ->middleware('throttle:120,1')
    ->name('internal.live.validate');

Route::middleware('auth')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

    Route::prefix('admin')->name('admin.')->middleware('role:admin')->group(function () {
        Route::get('/', [AdminController::class, 'dashboard'])->name('dashboard');

        // Tahun Pelajaran
        Route::get('/academic-years', [AdminController::class, 'academicYears'])->name('academic-years.index');
        Route::post('/academic-years', [AdminController::class, 'storeAcademicYear'])->name('academic-years.store');
        Route::post('/academic-years/{year}/activate', [AdminController::class, 'activateAcademicYear'])->name('academic-years.activate');
        Route::delete('/academic-years/{year}', [AdminController::class, 'destroyAcademicYear'])->name('academic-years.destroy');

        // Jurusan
        Route::post('/departments', [AdminController::class, 'storeDepartment'])->name('departments.store');
        Route::put('/departments/{department}', [AdminController::class, 'updateDepartment'])->name('departments.update');
        Route::delete('/departments/{department}', [AdminController::class, 'destroyDepartment'])->name('departments.destroy');

        // Kelas & siswa
        Route::get('/classrooms', [AdminController::class, 'classrooms'])->name('classrooms.index');
        Route::post('/classrooms', [AdminController::class, 'storeClassroom'])->name('classrooms.store');
        Route::post('/classrooms/import-students', [AdminController::class, 'importStudents'])->name('classrooms.import');
        Route::get('/classrooms/induk/classes', [AdminController::class, 'indukClassrooms'])->name('classrooms.induk.classes');
        Route::post('/classrooms/induk/sync', [AdminController::class, 'syncInduk'])->name('classrooms.induk.sync');
        Route::post('/classrooms/induk/sync-all', [AdminController::class, 'syncIndukAll'])->name('classrooms.induk.sync-all');
        Route::put('/classrooms/{classroom}', [AdminController::class, 'updateClassroom'])->name('classrooms.update');
        Route::delete('/classrooms/{classroom}', [AdminController::class, 'destroyClassroom'])->name('classrooms.destroy');
        Route::post('/classrooms/{classroom}/students', [AdminController::class, 'placeStudent'])->name('classrooms.students.place');
        Route::delete('/classrooms/{classroom}/students/{studentId}', [AdminController::class, 'unplaceStudent'])->name('classrooms.students.unplace');

        // Kelola guru (akun pengguna role guru)
        Route::get('/teachers', [AdminController::class, 'teachers'])->name('teachers.index');
        Route::post('/teachers', [AdminController::class, 'storeTeacher'])->name('teachers.store');
        Route::put('/teachers/{user}', [AdminController::class, 'updateTeacher'])->name('teachers.update');
        Route::post('/teachers/{user}/toggle-active', [AdminController::class, 'toggleTeacherActive'])->name('teachers.toggle-active');
        Route::post('/teachers/{user}/reset-password', [AdminController::class, 'resetTeacherPassword'])->name('teachers.reset-password');
        Route::delete('/teachers/{user}', [AdminController::class, 'destroyTeacher'])->name('teachers.destroy');

        // Ploting mengajar
        Route::get('/ploting', [AdminController::class, 'ploting'])->name('ploting.index');
        Route::post('/ploting', [AdminController::class, 'storePloting'])->name('ploting.store');
        Route::delete('/ploting/{assignment}', [AdminController::class, 'destroyPloting'])->name('ploting.destroy');

        // Mata pelajaran
        Route::get('/subjects', [SubjectController::class, 'index'])->name('subjects.index');
        Route::post('/subjects', [SubjectController::class, 'store'])->name('subjects.store');
        Route::put('/subjects/{subject}', [SubjectController::class, 'update'])->name('subjects.update');
        Route::delete('/subjects/{subject}', [SubjectController::class, 'destroy'])->name('subjects.destroy');

        // Bank TP dipindah ke area guru (lihat grup teacher di bawah)
    });

    Route::prefix('teacher')->name('teacher.')->middleware('role:teacher,admin')->group(function () {
        Route::get('/modules', [ModuleController::class, 'index'])->name('modules.index');
        Route::post('/modules', [ModuleController::class, 'store'])->name('modules.store');
        Route::get('/modules/{module}/edit', [ModuleController::class, 'edit'])->name('modules.edit');
        Route::patch('/modules/{module}', [ModuleController::class, 'update'])->name('modules.update');

        Route::post('/modules/{module}/blocks', [ModuleBlockController::class, 'store'])->name('modules.blocks.store');
        Route::post('/modules/{module}/blocks/upload', [ModuleBlockController::class, 'uploadAsset'])->name('modules.blocks.upload');
        Route::post('/modules/{module}/slides', [ModuleSlideController::class, 'store'])->name('modules.slides.store');
        Route::delete('/modules/{module}/slides', [ModuleSlideController::class, 'destroy'])->name('modules.slides.destroy');

        // AI kurikulum (generate blok + polling + nilai esai)
        Route::post('/modules/{module}/ai/generate', [AiCurriculumController::class, 'generate'])->name('modules.ai.generate');
        Route::get('/modules/{module}/ai/status', [AiCurriculumController::class, 'status'])->name('modules.ai.status');
        Route::post('/responses/{response}/ai/grade', [AiCurriculumController::class, 'grade'])->name('responses.ai.grade');
        Route::patch('/modules/{module}/blocks/reorder', [ModuleBlockController::class, 'reorder'])->name('modules.blocks.reorder');
        Route::patch('/modules/{module}/blocks/{block}', [ModuleBlockController::class, 'update'])->name('modules.blocks.update');
        Route::delete('/modules/{module}/blocks/{block}', [ModuleBlockController::class, 'destroy'])->name('modules.blocks.destroy');

        // Bank TP (guru hanya mapel yang diampu)
        Route::get('/objectives', [ObjectiveController::class, 'index'])->name('objectives.index');
        Route::post('/objectives', [ObjectiveController::class, 'store'])->name('objectives.store');
        Route::put('/objectives/{objective}', [ObjectiveController::class, 'update'])->name('objectives.update');
        Route::delete('/objectives/{objective}', [ObjectiveController::class, 'destroy'])->name('objectives.destroy');

        // Buku Nilai (Gradebook) & ekspor CSV
        Route::get('/gradebook', [GradebookController::class, 'index'])->name('gradebook.index');
        Route::patch('/gradebook/modules/{module}/students/{student}/override', [GradebookController::class, 'override'])->name('gradebook.override');
        Route::get('/gradebook/{classroom}/{subject}', [GradebookController::class, 'show'])->name('gradebook.show');
        Route::get('/gradebook/{classroom}/{subject}/students/{student}', [GradebookController::class, 'studentDetail'])->name('gradebook.student');
        Route::get('/gradebook/{classroom}/{subject}/export', [GradebookController::class, 'export'])->name('gradebook.export');

        // Live synchronized slideshow (panggung guru)
        Route::post('/modules/{module}/live', [LiveSessionController::class, 'start'])->name('live.start');
        Route::get('/live/{session}', [LiveSessionController::class, 'show'])->name('live.show');
        Route::patch('/live/{session}', [LiveSessionController::class, 'update'])->name('live.update');
        Route::post('/live/{session}/end', [LiveSessionController::class, 'end'])->name('live.end');
    });

    Route::prefix('student')->name('student.')->middleware('role:student')->group(function () {
        Route::get('/', [StudentHomeController::class, 'index'])->name('home');
        Route::get('/grades', [GradeController::class, 'index'])->name('grades.index');
        Route::get('/live', [LiveController::class, 'joinForm'])->name('live');
        Route::get('/modules/{module}/practice', [PracticeController::class, 'show'])->name('practice.show');
        Route::post('/modules/{module}/practice/progress', [PracticeController::class, 'markProgress'])->name('practice.progress');
        Route::post('/modules/{module}/practice/answers', [PracticeController::class, 'answer'])->name('practice.answer');
    });

    Route::prefix('live')->name('student.live.')->middleware('role:student')->group(function () {
        Route::get('/', [LiveController::class, 'joinForm'])->name('join');
        Route::get('/{pin}', [LiveController::class, 'room'])->name('room');
        Route::post('/{pin}/responses', [LiveController::class, 'respond'])->name('respond');
    });
});
