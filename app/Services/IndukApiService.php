<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Client for the school's data-induk (master data) API.
 *
 * Endpoints used:
 *   GET /apiSiswa/kelas  -> list of classrooms with active student counts
 *   GET /apiSiswa/siswa  -> list of students (nisn, nama, kelas)
 *
 * Authentication: X-API-KEY header from services.induk.key.
 */
class IndukApiService
{
    public function configured(): bool
    {
        return (string) config('services.induk.base') !== ''
            && (string) config('services.induk.key') !== '';
    }

    /**
     * Classrooms from the master app, ordered by grade then name.
     *
     * @return array<int, array{id:int|string, kelas:string, tingkat:string, jumlah_siswa:int}>
     */
    public function classrooms(): array
    {
        $json = $this->get('/apiSiswa/kelas');

        $rows = is_array($json['data'] ?? null) ? $json['data'] : [];

        return array_values(array_map(fn (array $row) => [
            'id' => $row['id'] ?? null,
            'kelas' => (string) ($row['kelas'] ?? ''),
            'tingkat' => (string) ($row['tingkat'] ?? ''),
            'jumlah_siswa' => (int) ($row['jumlah_siswa'] ?? 0),
        ], array_filter($rows, fn ($row) => is_array($row) && ($row['kelas'] ?? '') !== '')));
    }

    /**
     * Every active student of one classroom, following pagination.
     *
     * @return array<int, array{nisn:string, nama:string, kelas:string}>
     */
    public function students(string $kelas, string $status = 'aktif', int $perPage = 500): array
    {
        $students = [];
        $page = 1;

        do {
            $json = $this->get('/apiSiswa/siswa', [
                'kelas' => $kelas,
                'status' => $status,
                'page' => $page,
                'per_page' => $perPage,
            ]);

            $rows = is_array($json['data'] ?? null) ? $json['data'] : [];

            foreach ($rows as $row) {
                if (! is_array($row) || (string) ($row['nisn'] ?? '') === '') {
                    continue;
                }

                $students[] = [
                    'nisn' => (string) $row['nisn'],
                    'nama' => trim((string) ($row['nama'] ?? '')),
                    'kelas' => (string) ($row['kelas'] ?? $kelas),
                ];
            }

            $totalPages = (int) ($json['meta']['total_halaman'] ?? 1);
            $page++;
        } while ($page <= $totalPages && $rows !== []);

        return $students;
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     */
    protected function get(string $path, array $query = []): array
    {
        if (! $this->configured()) {
            throw new RuntimeException('API data induk belum dikonfigurasi (INDUK_API_BASE / INDUK_API_KEY).');
        }

        try {
            $response = Http::withHeaders([
                'X-API-KEY' => (string) config('services.induk.key'),
                'Accept' => 'application/json',
            ])
                ->timeout((int) config('services.induk.timeout', 15))
                ->get(rtrim((string) config('services.induk.base'), '/').$path, $query);
        } catch (ConnectionException $e) {
            throw new RuntimeException('Tidak bisa menghubungi API data induk: '.$e->getMessage(), 0, $e);
        }

        if (! $response->successful()) {
            throw new RuntimeException(
                'API data induk menolak permintaan (HTTP '.$response->status().'). '
                .(string) ($response->json('message') ?? 'Periksa kunci API.'),
                $response->status(),
            );
        }

        $json = $response->json();

        return is_array($json) ? $json : [];
    }
}
