<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use App\Http\Requests\UploadStudentFileRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Unggahan berkas oleh siswa (foto bukti checklist, berkas tugas).
 * Berkas disimpan per siswa: student-uploads/{user_id}/{uuid}.{ext} —
 * pemisahan folder ini juga dipakai untuk memvalidasi kepemilikan berkas
 * saat siswa mengumpulkan tugas.
 */
class UploadController extends Controller
{
    public function store(UploadStudentFileRequest $request): JsonResponse
    {
        $file = $request->file('file');

        $path = $file->storeAs(
            'student-uploads/'.$request->user()->id,
            Str::uuid().'.'.strtolower($file->getClientOriginalExtension()),
            'public',
        );

        return response()->json([
            'url' => Storage::disk('public')->url($path),
            'name' => $file->getClientOriginalName(),
            'size' => $file->getSize(),
        ]);
    }
}
