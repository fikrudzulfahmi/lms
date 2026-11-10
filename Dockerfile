# Runtime staging LMS SMK — kode di-mount dari host (./:/app), aset Vite dibangun di host.
# Image dasar sudah berisi PHP 8.4 + ekstensi (pdo_mysql, gd, intl, zip, opcache, bcmath, pcntl) + composer.
FROM backupmate/laravel-frankenphp:8.4

WORKDIR /app
ENV SERVER_NAME=":80"
ENV CADDY_GLOBAL_OPTIONS="auto_https off"
EXPOSE 80
