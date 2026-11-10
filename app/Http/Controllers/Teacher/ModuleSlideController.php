<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Requests\DestroyModuleSlidesRequest;
use App\Http\Requests\StoreModuleSlidesRequest;
use App\Models\LearningModule;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ModuleSlideController
{
    private const DISK = 'public';

    public function store(StoreModuleSlidesRequest $request, LearningModule $module): JsonResponse
    {
        $data = $request->validated();
        $disk = Storage::disk(self::DISK);
        $directory = 'modules/'.$module->id;

        $disk->makeDirectory($directory);

        $existing = collect($disk->files($directory))
            ->filter(fn (string $path) => preg_match('/slide-(\d+)\.\w+$/', $path) === 1)
            ->map(fn (string $path) => (int) Str::beforeLast(Str::afterLast($path, 'slide-'), '.'))
            ->max() ?? 0;

        $slides = [];
        $index = $existing;

        foreach ($data['images'] as $offset => $dataUrl) {
            $binary = $this->decode($dataUrl);
            $index++;
            $path = $directory.'/slide-'.str_pad((string) $index, 2, '0', STR_PAD_LEFT).'.webp';

            $disk->put($path, $this->toWebp($binary));

            $slides[] = [
                'path' => $path,
                'url' => '/storage/'.$path,
                'page' => $offset + 1,
                'name' => $this->pageLabel($data['source_name'] ?? null, $index),
            ];
        }

        return response()->json([
            'slides' => $slides,
            'count' => count($slides),
            'source_name' => $data['source_name'] ?? null,
        ], 201);
    }

    public function destroy(DestroyModuleSlidesRequest $request, LearningModule $module): JsonResponse
    {
        $disk = Storage::disk(self::DISK);
        $deleted = [];

        foreach ($request->validated('paths') as $path) {
            if (! Str::startsWith($path, 'modules/'.$module->id.'/') || Str::contains($path, '..')) {
                continue;
            }

            if ($disk->exists($path)) {
                $disk->delete($path);
                $deleted[] = $path;
            }
        }

        return response()->json([
            'deleted' => $deleted,
            'count' => count($deleted),
        ]);
    }

    private function decode(string $dataUrl): string
    {
        return (string) base64_decode(substr($dataUrl, strpos($dataUrl, ',') + 1), true);
    }

    /**
     * Normalisasi semua gambar ke WebP. Bila GD tidak tersedia, simpan byte asli.
     */
    private function toWebp(string $binary): string
    {
        if (! function_exists('imagecreatefromstring') || ! function_exists('imagewebp')) {
            return $binary;
        }

        $image = @imagecreatefromstring($binary);

        if ($image === false) {
            return $binary;
        }

        ob_start();
        $encoded = imagewebp($image, null, 82);
        $output = (string) ob_get_clean();
        imagedestroy($image);

        return $encoded && $output !== '' ? $output : $binary;
    }

    private function pageLabel(?string $sourceName, int $index): string
    {
        $base = $sourceName !== null && $sourceName !== ''
            ? Str::of($sourceName)->basename()->replaceMatches('/\.pdf$/i', '')->limit(120, '')->toString()
            : 'Slide';

        return $base.' — halaman '.$index;
    }
}
