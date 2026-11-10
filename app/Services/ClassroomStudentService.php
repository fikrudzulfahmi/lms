<?php

namespace App\Services;

use App\Models\AcademicYear;
use App\Models\ClassroomStudent;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\HttpFoundation\File\UploadedFile;

class ClassroomStudentService
{
    /**
     * Students belonging to a classroom within the active academic year.
     */
    public function forClassroom(int $classroomId): Collection
    {
        $year = $this->activeYear();

        return ClassroomStudent::where('classroom_id', $classroomId)
            ->where('academic_year_id', $year->id)
            ->with('student')
            ->get();
    }

    /**
     * Place a student into a classroom for the active year.
     */
    public function place(int $classroomId, int $studentId): ClassroomStudent
    {
        $year = $this->activeYear();

        $student = User::where('role', User::ROLE_STUDENT)->findOrFail($studentId);

        return DB::transaction(function () use ($year, $classroomId, $student) {
            // Idempotent: re-place removes any other classroom in this year first.
            ClassroomStudent::where('academic_year_id', $year->id)
                ->where('student_id', $student->id)
                ->delete();

            return ClassroomStudent::firstOrCreate([
                'academic_year_id' => $year->id,
                'classroom_id' => $classroomId,
                'student_id' => $student->id,
            ]);
        });
    }

    /**
     * Remove a student from a classroom for the active year.
     */
    public function unplace(int $classroomId, int $studentId): void
    {
        $year = AcademicYear::active();

        ClassroomStudent::where('classroom_id', $classroomId)
            ->where('student_id', $studentId)
            ->when($year, fn ($q) => $q->where('academic_year_id', $year->id))
            ->delete();
    }

    /**
     * Import students from CSV. Expected columns (any order):
     * name, username, email, nisn.
     *
     * When $classroomId is given every imported/updated student is placed into
     * that classroom for the active academic year.
     *
     * @return array{imported: int, updated: int, skipped: int, placed: int, errors: array<int, string>}
     */
    public function importCsv(UploadedFile $file, ?int $classroomId = null): array
    {
        $result = ['imported' => 0, 'updated' => 0, 'skipped' => 0, 'placed' => 0, 'errors' => []];

        $handle = fopen($file->getPathname(), 'rb');

        if ($handle === false) {
            $result['errors'][] = 'Gagal membaca file CSV.';

            return $result;
        }

        $delimiter = $this->delimiter($file);
        $header = fgetcsv($handle, 0, $delimiter);

        if ($header === false) {
            fclose($handle);
            $result['errors'][] = 'File CSV kosong.';

            return $result;
        }

        // Strip UTF-8 BOM that Excel adds, then normalise every header cell.
        $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]);
        $columns = array_map(
            fn ($h) => strtolower(trim((string) $h, " \t\"'\r\n")),
            $header,
        );

        if (! in_array('name', $columns, true)) {
            fclose($handle);
            $result['errors'][] = 'Header CSV wajib memuat kolom "name".';

            return $result;
        }

        while (($row = fgetcsv($handle, 0, $delimiter)) !== false) {
            if ($row === [null]) {
                continue;
            }

            if (count(array_filter($row, fn ($v) => trim((string) $v) !== '')) === 0) {
                continue;
            }

            $data = array_combine($columns, array_pad($row, count($columns), ''));
            $name = trim((string) ($data['name'] ?? ''));
            $username = trim((string) ($data['username'] ?? ''));
            $email = trim((string) ($data['email'] ?? ''));
            $nisn = trim((string) ($data['nisn'] ?? ''));

            if ($name === '') {
                $result['skipped']++;
                $result['errors'][] = 'Baris tanpa kolom name: '.implode(' | ', array_filter($row));

                continue;
            }

            $student = $this->findStudent($username, $nisn, $email);
            $attributes = array_filter([
                'name' => $name,
                'username' => $username !== '' ? $username : null,
                'email' => $email !== '' ? $email : null,
                'nisn' => $nisn !== '' ? $nisn : null,
            ], fn ($v) => $v !== null);

            if ($student !== null) {
                try {
                    $student->update($attributes);
                } catch (QueryException $e) {
                    $result['skipped']++;
                    $result['errors'][] = "Baris '$name' gagal diperbarui: username/email bentrok.";

                    continue;
                }

                $result['updated']++;
            } else {
                if ($username === '' && $nisn === '' && $email === '') {
                    $result['skipped']++;
                    $result['errors'][] = "Baris '$name' dilewati: tidak ada username/nisn/email.";

                    continue;
                }

                $username = $username !== ''
                    ? $username
                    : Str::lower(Str::slug($name)).'-'.Str::lower(Str::random(6));

                try {
                    $student = User::create([
                        'name' => $name,
                        'username' => $username,
                        'email' => $email !== '' ? $email : null,
                        'nisn' => $nisn !== '' ? $nisn : null,
                        'role' => User::ROLE_STUDENT,
                        'password' => 'siswa123',
                        'is_active' => true,
                    ]);
                } catch (QueryException $e) {
                    $result['skipped']++;
                    $result['errors'][] = "Baris '$name' dilewati: username/email sudah dipakai.";

                    continue;
                }

                $result['imported']++;
            }

            if ($classroomId !== null && $this->tryPlace($classroomId, $student->id)) {
                $result['placed']++;
            }
        }

        fclose($handle);

        return $result;
    }

    /**
     * Detect the CSV delimiter (comma or semicolon) from the first line.
     */
    protected function delimiter(UploadedFile $file): string
    {
        $firstLine = (string) fgets(fopen($file->getPathname(), 'rb'));

        return substr_count($firstLine, ';') > substr_count($firstLine, ',') ? ';' : ',';
    }

    protected function findStudent(string $username, string $nisn, string $email): ?User
    {
        foreach (array_filter([
            $username !== '' ? ['username' => $username] : null,
            $nisn !== '' ? ['nisn' => $nisn] : null,
            $email !== '' ? ['email' => $email] : null,
        ]) as $criteria) {
            $student = User::where('role', User::ROLE_STUDENT)->where($criteria)->first();

            if ($student !== null) {
                return $student;
            }
        }

        return null;
    }

    /**
     * Place the student when an active year exists; never fail the whole import.
     */
    protected function tryPlace(int $classroomId, int $studentId): bool
    {
        if (AcademicYear::active() === null) {
            return false;
        }

        try {
            $this->place($classroomId, $studentId);

            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    protected function activeYear(): AcademicYear
    {
        return AcademicYear::active() ?? throw new RuntimeException('Belum ada tahun pelajaran aktif.');
    }
}
