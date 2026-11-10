# ws-hub — Live Classroom WebSocket Hub

Microservice Go untuk Milestone 5 LMS SMK. Satu room = satu sesi live,
dikunci dengan `pin_code` 6 digit. Guru mengirim state slide, siswa menerima
state dan mengirim jawaban; hub mem-broadcast tanpa menyentuh PHP/MySQL.

- Binary: `ws-hub` (linux/amd64, `CGO_ENABLED=0`)
- Port: `PORT` (default `8081`)
- Health: `GET /healthz` → `{"status":"ok","rooms":N,"clients":N,...}`
- WS: `GET /ws/connect` (protokol JSON, pesan pertama wajib `join`)
- Internal push: `POST /internal/broadcast` (header `X-Internal-Secret`)

## Environment

| Var | Default | Keterangan |
| --- | --- | --- |
| `PORT` | `8081` | port HTTP/WS |
| `INTERNAL_API_URL` | kosong | base URL Laravel, mis. `http://lms-staging-app:8000` |
| `INTERNAL_API_SECRET` | kosong | shared secret; harus sama dengan `LIVE_INTERNAL_SECRET` Laravel |
| `LIVE_VALIDATE_PATH` | `/internal/live-sessions/validate` | path validasi sesi |
| `ALLOWED_ORIGINS` | kosong | daftar origin dipisah koma; kosong = semua (hanya untuk jaringan internal) |

## Model autentikasi (ringkas)

1. Setiap `join` divalidasi ke Laravel `POST {INTERNAL_API_URL}/internal/live-sessions/validate`
   dengan header `X-Internal-Secret`. Laravel mencari `pin_code`, memastikan
   `status != ended`, dan mengembalikan metadata sesi (+ payload modul yang
   sudah disanitasi untuk siswa).
2. Guru wajib menyertakan `control_token`: HMAC-SHA256 dari
   `live-session:{session_id}` memakai `LIVE_INTERNAL_SECRET` (fallback
   `APP_KEY`). Token hanya dikirim Laravel ke halaman Panggung guru pemilik;
   siswa tidak pernah menerimanya. Dengan begitu siswa yang tahu PIN tidak bisa
   mengirim `state`/`end`.
3. `INTERNAL_API_URL` kosong = mode dev terdegradasi (hanya cek format PIN).
   Hanya dipakai untuk smoke lokal; jangan dipakai saat deploy.

## Protokol JSON

Client → hub:

```json
{"type":"join","pin":"123456","role":"teacher","name":"Bu Rina","control_token":"<hmac>"}
{"type":"join","pin":"123456","role":"student","name":"Andi"}
{"type":"state","current_block_id":"<uuid>|null","status":"waiting|active"}
{"type":"student_answer","block_id":"<uuid>","answer":{"option_index":1}}
{"type":"pointer","x":0.45,"y":0.62}
{"type":"end"}
{"type":"ping"}
```

Hub → client:

```json
{"type":"joined","role":"student","presence":31,"state":{...},"module":{"id":1,"title":"...","blocks":[...]}}
{"type":"state","state":{"session_id":"...","current_block_id":"...","status":"active","module_id":1,"module_title":"..."}}
{"type":"presence","count":31}
{"type":"student_answer","student_name":"Andi","block_id":"...","answer":{...},"at":"2026-11-10T22:00:00Z"}
{"type":"ended"}
{"type":"error","message":"Sesi sudah berakhir."}
```

Aturan:

- Hanya satu koneksi guru per room; koneksi guru kedua ditolak.
- `state` dan `end` hanya diterima dari role `teacher`.
- `student_answer` hanya diterima dari role `student`, maksimal 8 KB.
- `presence` menghitung koneksi role `student` saja (guru tidak dihitung).
- Room dihapus saat kosong; state hidup di memori (bukan pengganti database).

## Build & jalankan

```bash
# build binary (host tanpa Go)
docker run --rm -v "$PWD/ws-hub":/src -w /src golang:1.23-alpine \
  sh -c 'CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o ws-hub .'

# image produksi
docker build -t lms-ws-hub ./ws-hub

# smoke lokal (dev degraded validation)
INTERNAL_API_URL= PORT=8081 ./ws-hub/ws-hub
curl -s http://127.0.0.1:8081/healthz
```

Jangan publish port ke host dan jangan tambahkan service ini ke compose
homelab yang live sebelum ada keputusan deploy terpisah.

## Uji manual dua client

Terminal 1 — guru:

```bash
node --input-type=module -e '
const ws = new WebSocket("ws://127.0.0.1:8081/ws/connect");
ws.onopen = () => ws.send(JSON.stringify({type:"join",pin:"123456",role:"teacher",name:"Guru",control_token:"dev"}));
ws.onmessage = (e) => console.log("TEACHER", e.data);
setTimeout(() => ws.send(JSON.stringify({type:"state",current_block_id:"b1",status:"active"})), 800);
setTimeout(() => process.exit(0), 4000);
'
```

Terminal 2 — siswa:

```bash
node --input-type=module -e '
const ws = new WebSocket("ws://127.0.0.1:8081/ws/connect");
ws.onopen = () => ws.send(JSON.stringify({type:"join",pin:"123456",role:"student",name:"Andi"}));
ws.onmessage = (e) => console.log("STUDENT", e.data);
setTimeout(() => ws.send(JSON.stringify({type:"student_answer",block_id:"b1",answer:{option_index:1}})), 1200);
setTimeout(() => process.exit(0), 4000);
'
```

Python alternative ada di `scripts/smoke_ws.py`.
