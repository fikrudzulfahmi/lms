import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useClassroomSync
 * Koneksi WebSocket ke ws-hub untuk satu sesi live (room = PIN).
 *
 * - join otomatis setelah socket terbuka; guru mengirim control token.
 * - reconnect exponential backoff (1s, 2s, 4s ... maks 15s + jitter).
 * - callback state/presence/answer stabil lewat ref, tidak memicu reconnect.
 */

const MAX_BACKOFF_MS = 15000;

function joinPayload({ pin, role, name, controlToken }) {
    return {
        type: 'join',
        pin,
        role,
        name: name ?? '',
        ...(role === 'teacher' ? { control_token: controlToken ?? '' } : {}),
    };
}

export function useClassroomSync({
    wsUrl,
    pin,
    role,
    name = '',
    controlToken = null,
    enabled = true,
    onState,
    onPresence,
    onAnswer,
    onJoined,
    onModule,
    onEnded,
    onOpen,
    onError,
}) {
    const [status, setStatus] = useState(enabled ? 'connecting' : 'idle');
    const [presence, setPresence] = useState(0);
    const [lastError, setLastError] = useState(null);

    const socketRef = useRef(null);
    const attemptsRef = useRef(0);
    const timerRef = useRef(null);
    const manualCloseRef = useRef(false);
    const callbacksRef = useRef({});

    callbacksRef.current = { onState, onPresence, onAnswer, onJoined, onModule, onEnded, onOpen, onError };

    const send = useCallback((payload) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return false;
        socket.send(JSON.stringify(payload));
        return true;
    }, []);

    const sendState = useCallback(
        (currentBlockId, nextStatus = 'active') =>
            send({ type: 'state', current_block_id: currentBlockId ?? null, status: nextStatus }),
        [send],
    );

    const sendAnswer = useCallback(
        (blockId, answer) => send({ type: 'student_answer', block_id: blockId, answer }),
        [send],
    );

    const sendPointer = useCallback((x, y) => send({ type: 'pointer', x, y }), [send]);

    const endSession = useCallback(() => send({ type: 'end' }), [send]);

    useEffect(() => {
        if (!enabled || !wsUrl) {
            setStatus('idle');
            return undefined;
        }

        manualCloseRef.current = false;

        const connect = () => {
            setStatus(attemptsRef.current === 0 ? 'connecting' : 'reconnecting');

            let socket;
            try {
                socket = new WebSocket(wsUrl);
            } catch {
                scheduleReconnect();
                return;
            }

            socketRef.current = socket;

            socket.onopen = () => {
                attemptsRef.current = 0;
                setStatus('open');
                setLastError(null);
                socket.send(JSON.stringify(joinPayload({ pin, role, name, controlToken })));
                callbacksRef.current.onOpen?.();
            };

            socket.onmessage = (event) => {
                let payload;
                try {
                    payload = JSON.parse(event.data);
                } catch {
                    return;
                }

                switch (payload.type) {
                    case 'joined':
                        setPresence(Number(payload.presence ?? 0));
                        callbacksRef.current.onPresence?.(Number(payload.presence ?? 0));
                        if (payload.module) callbacksRef.current.onModule?.(payload.module);
                        if (payload.state) callbacksRef.current.onState?.(payload.state);
                        callbacksRef.current.onJoined?.(payload);
                        break;
                    case 'state':
                        callbacksRef.current.onState?.(payload.state ?? payload.data ?? {});
                        break;
                    case 'presence':
                        setPresence(Number(payload.count ?? 0));
                        callbacksRef.current.onPresence?.(Number(payload.count ?? 0));
                        break;
                    case 'student_answer':
                        callbacksRef.current.onAnswer?.(payload);
                        break;
                    case 'ended':
                        callbacksRef.current.onEnded?.();
                        break;
                    case 'error':
                        setLastError(payload.message ?? 'Kesalahan WebSocket.');
                        callbacksRef.current.onError?.(payload.message);
                        break;
                    default:
                        break;
                }
            };

            socket.onclose = () => {
                if (socketRef.current === socket) socketRef.current = null;
                if (manualCloseRef.current) {
                    setStatus('closed');
                    return;
                }
                scheduleReconnect();
            };

            socket.onerror = () => {
                setLastError('Koneksi realtime terputus. Mencoba menyambung ulang...');
            };
        };

        const scheduleReconnect = () => {
            if (manualCloseRef.current) return;

            const attempt = attemptsRef.current;
            const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
            const jitter = Math.floor(Math.random() * 400);
            attemptsRef.current = attempt + 1;
            setStatus('reconnecting');

            timerRef.current = setTimeout(connect, backoff + jitter);
        };

        connect();

        return () => {
            manualCloseRef.current = true;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = null;
            const socket = socketRef.current;
            socketRef.current = null;
            if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
                socket.close(1000, 'component unmounted');
            }
        };
    }, [enabled, wsUrl, pin, role, name, controlToken]);

    return { status, presence, lastError, send, sendState, sendAnswer, sendPointer, endSession };
}

export default useClassroomSync;
