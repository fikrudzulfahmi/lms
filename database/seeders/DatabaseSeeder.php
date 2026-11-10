<?php

namespace Database\Seeders;

use App\Models\AcademicYear;
use App\Models\Classroom;
use App\Models\ClassroomStudent;
use App\Models\Department;
use App\Models\LearningObjective;
use App\Models\Subject;
use App\Models\TeachingAssignment;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database (idempotent: aman dijalankan ulang).
     */
    public function run(): void
    {
        // 1. Admin (Administrator / Waka Kurikulum)
        User::firstOrCreate(
            ['username' => 'admin'],
            [
                'name' => 'Administrator LMS',
                'email' => 'admin@smk.sch.id',
                'password' => Hash::make('password'),
                'role' => User::ROLE_ADMIN,
                'is_active' => true,
            ],
        );

        // 2. Tahun Pelajaran aktif: 2026/2027 Ganjil
        $academicYear = AcademicYear::firstOrCreate(
            ['name' => '2026/2027', 'semester' => 'ganjil'],
            ['is_active' => true],
        );

        // Hanya boleh 1 baris aktif
        AcademicYear::where('id', '!=', $academicYear->id)
            ->where('is_active', true)
            ->update(['is_active' => false]);

        // 3. Jurusan TSM
        $tsm = Department::firstOrCreate(
            ['code' => 'TSM'],
            ['name' => 'Teknik Sepeda Motor'],
        );

        // 4. Kelas XI TSM 1
        $classroom = Classroom::firstOrCreate(
            ['name' => 'XI TSM 1'],
            [
                'department_id' => $tsm->id,
                'grade_level' => 'XI',
            ],
        );

        // 5. Guru
        $teacher = User::firstOrCreate(
            ['username' => '198501012010011001'],
            [
                'name' => 'Budi Santoso, S.Pd.',
                'email' => 'budi.santoso@smk.sch.id',
                'password' => Hash::make('password'),
                'role' => User::ROLE_TEACHER,
                'is_active' => true,
            ],
        );

        // 6. Siswa
        $student = User::firstOrCreate(
            ['username' => 'NISN0001234501'],
            [
                'name' => 'Rizky Pratama',
                'email' => 'rizky.pratama@student.sch.id',
                'password' => Hash::make('password'),
                'role' => User::ROLE_STUDENT,
                'is_active' => true,
            ],
        );

        // 7. Penempatan siswa di kelas (unique: academic_year + student)
        ClassroomStudent::firstOrCreate([
            'academic_year_id' => $academicYear->id,
            'classroom_id' => $classroom->id,
            'student_id' => $student->id,
        ]);

        // 8. Mata Pelajaran kejuruan TSM
        $subject = Subject::firstOrCreate(
            ['code' => 'PLPK-TSM'],
            [
                'department_id' => $tsm->id,
                'name' => 'Pemeliharaan Kelistrikan Sepeda Motor',
                'category' => Subject::CATEGORY_KEJURUAN,
            ],
        );

        // 9. Tujuan Pembelajaran (Bank TP)
        LearningObjective::firstOrCreate(
            ['code' => 'TP-1.2', 'subject_id' => $subject->id],
            [
                'teacher_id' => $teacher->id,
                'grade_level' => 'XI',
                'description' => 'Mendiagnosis gangguan komponen sensor sistem injeksi PGM-FI sesuai SOP.',
            ],
        );

        // 10. Ploting mengajar: guru + mapel + kelas pada tahun aktif
        TeachingAssignment::firstOrCreate([
            'academic_year_id' => $academicYear->id,
            'teacher_id' => $teacher->id,
            'subject_id' => $subject->id,
            'classroom_id' => $classroom->id,
        ]);
    }
}
