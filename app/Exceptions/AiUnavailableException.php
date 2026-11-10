<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Kegagalan domain saat gateway AI tidak bisa dipakai atau balasannya
 * tidak bisa dipercaya. Pesan teknis untuk log, userMessage untuk guru.
 */
class AiUnavailableException extends RuntimeException
{
    public function __construct(
        string $message,
        private readonly string $userMessage = 'Layanan AI sedang tidak dapat dihubungi. Coba lagi beberapa saat.',
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }

    public function userMessage(): string
    {
        return $this->userMessage;
    }

    public static function unreachable(string $detail, ?\Throwable $previous = null): self
    {
        return new self(
            'Gateway AI tidak dapat dihubungi: '.$detail,
            'Layanan AI sedang tidak dapat dihubungi. Periksa koneksi gateway lalu coba lagi.',
            $previous,
        );
    }

    public static function badResponse(string $detail): self
    {
        return new self(
            'Respons AI tidak valid: '.$detail,
            'AI mengirim balasan yang tidak bisa dibaca. Coba generate ulang.',
        );
    }
}
