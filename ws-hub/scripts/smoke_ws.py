"""Smoke test ws-hub: healthz + guru/siswa join + state + student_answer.

Usage (against a locally running hub in dev degraded validation):
    python3 ws-hub/scripts/smoke_ws.py ws://127.0.0.1:8081 123456
"""
import asyncio
import json
import os
import sys
import urllib.request

import websockets


async def expect(ws, wanted, label, predicate=None):
    while True:
        raw = await asyncio.wait_for(ws.recv(), 5)
        payload = json.loads(raw)
        if payload.get("type") == wanted and (predicate is None or predicate(payload)):
            print(f"{label}: {json.dumps(payload, sort_keys=True)}")
            return payload


async def main(base, pin):
    http_base = base.replace("ws://", "http://").replace("wss://", "https://").rstrip("/")
    health = json.loads(urllib.request.urlopen(f"{http_base}/healthz").read())
    print("healthz:", json.dumps(health, sort_keys=True))

    url = base.rstrip("/") + "/ws/connect"

    token = os.environ.get("WS_CONTROL_TOKEN", "dev")

    async with websockets.connect(url) as teacher:
        await teacher.send(json.dumps({
            "type": "join", "pin": pin, "role": "teacher",
            "name": "Guru Smoke", "control_token": token,
        }))
        await expect(teacher, "joined", "teacher joined")

        async with websockets.connect(url) as student:
            await student.send(json.dumps({
                "type": "join", "pin": pin, "role": "student", "name": "Siswa Smoke",
            }))
            await expect(student, "joined", "student joined")
            await expect(teacher, "presence", "teacher presence", lambda p: p.get("count", 0) >= 1)

            await teacher.send(json.dumps({
                "type": "state", "current_block_id": "11111111-1111-1111-1111-111111111111",
                "status": "active",
            }))
            await expect(student, "state", "student state")
            await expect(teacher, "state", "teacher state echo")

            await student.send(json.dumps({
                "type": "student_answer",
                "block_id": "11111111-1111-1111-1111-111111111111",
                "answer": {"option_index": 1},
            }))
            await expect(teacher, "student_answer", "teacher received answer")

            await teacher.send(json.dumps({"type": "end"}))
            await expect(student, "state", "student ended state")
            await expect(student, "ended", "student ended")

            await student.send(json.dumps({"type": "state", "status": "active"}))
            await expect(student, "error", "student blocked from state")


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else "ws://127.0.0.1:8081"
    pin = sys.argv[2] if len(sys.argv) > 2 else "123456"
    asyncio.run(main(base, pin))
