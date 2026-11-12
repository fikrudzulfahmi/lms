// Command ws-hub is a small WebSocket fan-out hub for LMS SMK live
// classroom sessions. Rooms are keyed by the 6 digit session PIN.
//
// Protocol summary (full version in README.md):
//
//	client -> hub  {"type":"join","pin":"123456","role":"teacher|student","name":"...","control_token":"..."}
//	client -> hub  {"type":"state","current_block_id":"uuid|null","status":"waiting|active"}   (teacher)
//	client -> hub  {"type":"student_answer","block_id":"uuid","answer":{...}}                  (student)
//	client -> hub  {"type":"pointer","x":0.4,"y":0.5}                                          (teacher)
//	client -> hub  {"type":"end"}                                                              (teacher)
//	hub -> client  {"type":"joined","session":{...},"presence":N,"state":{...},"module":{...}}
//	hub -> client  {"type":"state","state":{...}}
//	hub -> client  {"type":"presence","count":N}
//	hub -> guru    {"type":"student_answer","student_name":"...","block_id":"...","answer":{...}}  (hanya guru)
//	hub -> client  {"type":"error","message":"..."}
//
// Teacher joins are authorised by a per-session HMAC control token that only
// the owning teacher receives from Laravel. Every join is checked against the
// Laravel internal validation endpoint; see README.md.
package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

var buildVersion = "dev"

const (
	roleTeacher = "teacher"
	roleStudent = "student"

	statusWaiting = "waiting"
	statusActive  = "active"
	statusEnded   = "ended"

	writeWait      = 10 * time.Second
	pongWait       = 90 * time.Second
	pingPeriod     = 30 * time.Second
	maxMessageSize = 64 << 10
	sendBuffer     = 32
)

type config struct {
	port           string
	internalAPIURL string
	internalSecret string
	validatePath   string
	allowedOrigins []string
}

func loadConfig() config {
	cfg := config{
		port:           env("PORT", "8081"),
		internalAPIURL: strings.TrimRight(env("INTERNAL_API_URL", ""), "/"),
		internalSecret: env("INTERNAL_API_SECRET", ""),
		validatePath:   env("LIVE_VALIDATE_PATH", "/internal/live-sessions/validate"),
	}

	if raw := env("ALLOWED_ORIGINS", ""); raw != "" {
		for _, origin := range strings.Split(raw, ",") {
			if trimmed := strings.TrimSpace(origin); trimmed != "" {
				cfg.allowedOrigins = append(cfg.allowedOrigins, trimmed)
			}
		}
	}

	return cfg
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}

	return fallback
}

type sessionInfo struct {
	ID             string          `json:"id"`
	PIN            string          `json:"pin"`
	Status         string          `json:"status"`
	ModuleID       int64           `json:"module_id"`
	ModuleTitle    string          `json:"module_title"`
	CurrentBlockID *string         `json:"current_block_id"`
	Module         json.RawMessage `json:"module,omitempty"`
}

type validateResponse struct {
	OK      bool        `json:"ok"`
	Session sessionInfo `json:"session"`
	Message string      `json:"message"`
}

type roomState struct {
	SessionID      string  `json:"session_id"`
	CurrentBlockID *string `json:"current_block_id"`
	Status         string  `json:"status"`
	ModuleID       int64   `json:"module_id"`
	ModuleTitle    string  `json:"module_title"`
}

type joinRequest struct {
	Type         string `json:"type"`
	PIN          string `json:"pin"`
	Role         string `json:"role"`
	Name         string `json:"name"`
	ControlToken string `json:"control_token"`
	SessionID    string `json:"session_id"`
}

type inboundMessage struct {
	Type           string          `json:"type"`
	CurrentBlockID *string         `json:"current_block_id"`
	Status         string          `json:"status"`
	BlockID        string          `json:"block_id"`
	Answer         json.RawMessage `json:"answer"`
	X              *float64        `json:"x"`
	Y              *float64        `json:"y"`
}

type client struct {
	hub       *hub
	room      *room
	conn      *websocket.Conn
	role      string
	name      string
	sessionID string
	send      chan []byte
	closeOnce sync.Once
}

type room struct {
	pin     string
	mu      sync.Mutex
	clients map[*client]struct{}
	teacher *client
	state   roomState
}

type hub struct {
	mu      sync.RWMutex
	rooms   map[string]*room
	started time.Time
	cfg     config
	http    *http.Client
}

func newHub(cfg config) *hub {
	return &hub{
		rooms:   make(map[string]*room),
		started: time.Now(),
		cfg:     cfg,
		http:    &http.Client{Timeout: 4 * time.Second},
	}
}

func (h *hub) roomFor(pin string) *room {
	h.mu.Lock()
	defer h.mu.Unlock()

	if existing, ok := h.rooms[pin]; ok {
		return existing
	}

	created := &room{pin: pin, clients: make(map[*client]struct{})}
	h.rooms[pin] = created

	return created
}

func (h *hub) dropRoomIfEmpty(pin string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	existing, ok := h.rooms[pin]
	if !ok {
		return
	}

	existing.mu.Lock()
	empty := len(existing.clients) == 0
	existing.mu.Unlock()

	if empty {
		delete(h.rooms, pin)
	}
}

func (h *hub) stats() (rooms, clients int) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, current := range h.rooms {
		current.mu.Lock()
		clients += len(current.clients)
		current.mu.Unlock()
		rooms++
	}

	return rooms, clients
}

func (h *hub) broadcast(pin, event string, payload any) int {
	h.mu.RLock()
	target, ok := h.rooms[pin]
	h.mu.RUnlock()

	if !ok {
		return 0
	}

	frame, err := json.Marshal(payload)
	if err != nil {
		log.Printf("broadcast marshal error: %v", err)
		return 0
	}

	return target.broadcastFrame(frame)
}

func (r *room) broadcastFrame(frame []byte) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	delivered := 0
	for member := range r.clients {
		select {
		case member.send <- frame:
			delivered++
		default:
			// Slow client: drop this frame instead of blocking the room.
		}
	}

	return delivered
}

// broadcastToTeachers mengirim frame hanya ke klien guru. Dipakai untuk
// jawaban siswa: isinya nama + jawaban lengkap, tidak boleh diterima
// siswa lain di room yang sama.
func (r *room) broadcastToTeachers(frame []byte) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	delivered := 0
	for member := range r.clients {
		if member.role != roleTeacher {
			continue
		}
		select {
		case member.send <- frame:
			delivered++
		default:
			// Slow client: drop this frame instead of blocking the room.
		}
	}

	return delivered
}

func (r *room) presence() int {
	r.mu.Lock()
	defer r.mu.Unlock()

	count := 0
	for member := range r.clients {
		if member.role == roleStudent {
			count++
		}
	}

	return count
}

func (r *room) broadcastState() {
	r.mu.Lock()
	state := r.state
	r.mu.Unlock()

	frame, err := json.Marshal(map[string]any{"type": "state", "state": state})
	if err != nil {
		return
	}

	r.broadcastFrame(frame)
}

func (r *room) broadcastPresence() {
	count := r.presence()
	frame, err := json.Marshal(map[string]any{"type": "presence", "count": count})
	if err != nil {
		return
	}

	r.broadcastFrame(frame)
}

func (c *client) write(message []byte) {
	select {
	case c.send <- message:
	default:
	}
}

func (c *client) sendError(message string) {
	frame, err := json.Marshal(map[string]string{"type": "error", "message": message})
	if err == nil {
		c.write(frame)
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *client) close() {
	c.closeOnce.Do(func() {
		close(c.send)
	})
}

func (h *hub) handleConnect(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 4096,
		CheckOrigin:     h.originAllowed,
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		// Upgrade already wrote an HTTP error.
		return
	}

	conn.SetReadLimit(maxMessageSize)
	_ = conn.SetReadDeadline(time.Now().Add(15 * time.Second))

	var join joinRequest
	if err := conn.ReadJSON(&join); err != nil {
		_ = conn.WriteJSON(map[string]string{"type": "error", "message": "Pesan join tidak terbaca."})
		_ = conn.Close()
		return
	}

	if err := validateJoinShape(join); err != nil {
		_ = conn.WriteJSON(map[string]string{"type": "error", "message": err.Error()})
		_ = conn.Close()
		return
	}

	info, err := h.validateSession(join)
	if err != nil {
		log.Printf("join rejected pin=%s role=%s: %v", join.PIN, join.Role, err)
		_ = conn.WriteJSON(map[string]string{"type": "error", "message": err.Error()})
		_ = conn.Close()
		return
	}

	if info.Status == statusEnded {
		_ = conn.WriteJSON(map[string]string{"type": "error", "message": "Sesi sudah berakhir."})
		_ = conn.Close()
		return
	}

	name := strings.TrimSpace(join.Name)
	if name == "" {
		name = "Siswa"
	}
	if len([]rune(name)) > 60 {
		name = string([]rune(name)[:60])
	}

	target := h.roomFor(join.PIN)

	registered := &client{
		hub:       h,
		room:      target,
		conn:      conn,
		role:      join.Role,
		name:      name,
		sessionID: info.ID,
		send:      make(chan []byte, sendBuffer),
	}

	if join.Role == roleTeacher {
		target.mu.Lock()
		if target.teacher != nil {
			target.mu.Unlock()
			_ = conn.WriteJSON(map[string]string{"type": "error", "message": "Sesi ini sudah dibuka guru lain."})
			_ = conn.Close()
			return
		}
		target.teacher = registered
		target.state = roomState{
			SessionID:      info.ID,
			CurrentBlockID: info.CurrentBlockID,
			Status:         info.Status,
			ModuleID:       info.ModuleID,
			ModuleTitle:    info.ModuleTitle,
		}
		target.mu.Unlock()
	}

	target.mu.Lock()
	target.clients[registered] = struct{}{}
	state := target.state
	target.mu.Unlock()

	go registered.writePump()

	// Session view sengaja tanpa payload module: module hanya dikirim sekali
	// (top-level) agar frame joined siswa tidak menggandakan seluruh blok.
	sessionView := map[string]any{
		"id":               info.ID,
		"pin":              info.PIN,
		"status":           info.Status,
		"module_id":        info.ModuleID,
		"module_title":     info.ModuleTitle,
		"current_block_id": info.CurrentBlockID,
	}

	joined := map[string]any{
		"type":     "joined",
		"session":  sessionView,
		"state":    state,
		"presence": target.presence(),
		"role":     join.Role,
	}
	if join.Role == roleStudent && len(info.Module) > 0 {
		joined["module"] = json.RawMessage(info.Module)
	}

	if frame, err := json.Marshal(joined); err == nil {
		registered.write(frame)
	}

	target.broadcastPresence()
	log.Printf("join ok pin=%s role=%s name=%q clients=%d", join.PIN, join.Role, name, target.presence())

	target.readLoop(registered)
}

func validateJoinShape(join joinRequest) error {
	if join.Type != "" && join.Type != "join" {
		return errors.New("Pesan pertama harus join.")
	}
	if len(join.PIN) != 6 {
		return errors.New("PIN harus 6 digit.")
	}
	for _, char := range join.PIN {
		if char < '0' || char > '9' {
			return errors.New("PIN harus 6 digit angka.")
		}
	}
	if join.Role != roleTeacher && join.Role != roleStudent {
		return errors.New("Role harus teacher atau student.")
	}

	return nil
}

func (r *room) readLoop(c *client) {
	defer r.removeClient(c)

	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	c.conn.SetPingHandler(func(payload string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
		return c.conn.WriteMessage(websocket.PongMessage, []byte(payload))
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return
		}

		var message inboundMessage
		if err := json.Unmarshal(raw, &message); err != nil {
			c.sendError("Format pesan tidak valid.")
			continue
		}

		switch message.Type {
		case "ping":
			c.write([]byte(`{"type":"pong"}`))
		case "state":
			if c.role != roleTeacher {
				c.sendError("Hanya guru yang boleh mengubah state.")
				continue
			}
			r.applyState(c, message)
		case "end":
			if c.role != roleTeacher {
				c.sendError("Hanya guru yang boleh mengakhiri sesi.")
				continue
			}
			r.mu.Lock()
			r.state.Status = statusEnded
			r.mu.Unlock()
			r.broadcastState()
			r.broadcastFrame([]byte(`{"type":"ended"}`))
		case "student_answer":
			if c.role != roleStudent {
				c.sendError("Hanya siswa yang boleh mengirim jawaban.")
				continue
			}
			r.relayAnswer(c, message)
		case "pointer":
			if c.role != roleTeacher {
				continue
			}
			if message.X == nil || message.Y == nil {
				continue
			}
			if *message.X < 0 || *message.X > 1 || *message.Y < 0 || *message.Y > 1 {
				continue
			}
			frame, err := json.Marshal(map[string]any{
				"type": "pointer",
				"x":    *message.X,
				"y":    *message.Y,
			})
			if err == nil {
				r.broadcastFrame(frame)
			}
		default:
			c.sendError("Tipe pesan tidak dikenal.")
		}
	}
}

func (r *room) applyState(c *client, message inboundMessage) {
	status := message.Status
	if status == "" {
		r.mu.Lock()
		status = r.state.Status
		r.mu.Unlock()
	}
	if status != statusWaiting && status != statusActive && status != statusEnded {
		c.sendError("Status state tidak valid.")
		return
	}

	r.mu.Lock()
	r.state.Status = status
	r.state.CurrentBlockID = message.CurrentBlockID
	if r.state.SessionID == "" {
		r.state.SessionID = c.sessionID
	}
	state := r.state
	r.mu.Unlock()

	frame, err := json.Marshal(map[string]any{"type": "state", "state": state})
	if err == nil {
		r.broadcastFrame(frame)
	}
}

func (r *room) relayAnswer(c *client, message inboundMessage) {
	if message.BlockID == "" || len(message.BlockID) > 64 {
		c.sendError("block_id wajib diisi.")
		return
	}
	if len(message.Answer) == 0 || len(message.Answer) > 8<<10 {
		c.sendError("Jawaban kosong atau terlalu besar.")
		return
	}
	if !json.Valid(message.Answer) {
		c.sendError("Jawaban bukan JSON valid.")
		return
	}

	frame, err := json.Marshal(map[string]any{
		"type":         "student_answer",
		"student_name": c.name,
		"block_id":     message.BlockID,
		"answer":       json.RawMessage(message.Answer),
		"at":           time.Now().UTC().Format(time.RFC3339),
	})
	if err == nil {
		// Hanya guru yang boleh menerima jawaban siswa lain. Sebelumnya
		// frame ini di-broadcast ke semua klien termasuk siswa lain.
		r.broadcastToTeachers(frame)
	}
}

func (r *room) removeClient(c *client) {
	r.mu.Lock()
	if _, ok := r.clients[c]; !ok {
		r.mu.Unlock()
		return
	}
	delete(r.clients, c)
	if r.teacher == c {
		r.teacher = nil
	}
	r.mu.Unlock()

	c.close()
	_ = c.conn.Close()

	r.broadcastPresence()
	c.hub.dropRoomIfEmpty(r.pin)
	log.Printf("leave pin=%s role=%s name=%q", r.pin, c.role, c.name)
}

func (h *hub) originAllowed(request *http.Request) bool {
	if len(h.cfg.allowedOrigins) == 0 {
		return true
	}

	origin := request.Header.Get("Origin")
	if origin == "" {
		return true
	}
	for _, allowed := range h.cfg.allowedOrigins {
		if strings.EqualFold(strings.TrimRight(allowed, "/"), strings.TrimRight(origin, "/")) {
			return true
		}
	}

	return false
}

// validateSession asks Laravel whether the PIN is a live session and whether
// the join is allowed. When INTERNAL_API_URL is empty the hub runs in a
// documented dev-only degraded mode (PIN shape + role only) used by local
// smoke tests; never deploy it that way.
func (h *hub) validateSession(join joinRequest) (sessionInfo, error) {
	if h.cfg.internalAPIURL == "" {
		log.Printf("WARNING: INTERNAL_API_URL empty, dev degraded validation for pin=%s", join.PIN)
		return sessionInfo{
			ID:             "dev-" + join.PIN,
			PIN:            join.PIN,
			Status:         statusActive,
			CurrentBlockID: nil,
		}, nil
	}

	body, err := json.Marshal(map[string]any{
		"pin":           join.PIN,
		"role":          join.Role,
		"control_token": join.ControlToken,
	})
	if err != nil {
		return sessionInfo{}, errors.New("Gagal menyiapkan validasi sesi.")
	}

	endpoint := h.cfg.internalAPIURL + h.cfg.validatePath
	request, err := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(string(body)))
	if err != nil {
		return sessionInfo{}, errors.New("Endpoint validasi tidak valid.")
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-Internal-Secret", h.cfg.internalSecret)

	response, err := h.http.Do(request)
	if err != nil {
		log.Printf("validate call failed: %v", err)
		return sessionInfo{}, errors.New("Layanan sesi tidak dapat dihubungi.")
	}
	defer response.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return sessionInfo{}, errors.New("Respons validasi tidak terbaca.")
	}

	var decoded validateResponse
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return sessionInfo{}, errors.New("Respons validasi tidak valid.")
	}

	if response.StatusCode != http.StatusOK || !decoded.OK {
		message := decoded.Message
		if message == "" {
			message = "PIN tidak valid atau sesi tidak aktif."
		}
		return sessionInfo{}, errors.New(message)
	}

	return decoded.Session, nil
}

func (h *hub) handleBroadcast(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	if h.cfg.internalSecret == "" || subtle.ConstantTimeCompare(
		[]byte(r.Header.Get("X-Internal-Secret")),
		[]byte(h.cfg.internalSecret),
	) != 1 {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload struct {
		Room  string          `json:"room"`
		Event string          `json:"event"`
		Data  json.RawMessage `json:"data"`
	}

	decoder := json.NewDecoder(io.LimitReader(r.Body, 256<<10))
	if err := decoder.Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if len(payload.Room) != 6 || payload.Event == "" || len(payload.Event) > 64 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid room or event"})
		return
	}

	frame, err := json.Marshal(map[string]any{
		"type": payload.Event,
		"data": json.RawMessage(payload.Data),
	})
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid data"})
		return
	}

	delivered := 0
	h.mu.RLock()
	target, ok := h.rooms[payload.Room]
	h.mu.RUnlock()
	if ok {
		delivered = target.broadcastFrame(frame)
		if payload.Event == "state" && len(payload.Data) > 0 {
			var next roomState
			if json.Unmarshal(payload.Data, &next) == nil {
				target.mu.Lock()
				target.state = next
				target.mu.Unlock()
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "delivered": delivered})
}

func (h *hub) handleHealth(w http.ResponseWriter, r *http.Request) {
	rooms, clients := h.stats()
	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "ok",
		"rooms":        rooms,
		"clients":      clients,
		"uptime_sec":   int64(time.Since(h.started).Seconds()),
		"validation":   h.cfg.internalAPIURL != "",
		"service":      "lms-smk-ws-hub",
		"server_time":  time.Now().UTC().Format(time.RFC3339),
		"version":      buildVersion,
		"protocol_ver": 1,
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func main() {
	cfg := loadConfig()
	app := newHub(cfg)

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/connect", app.handleConnect)
	mux.HandleFunc("/healthz", app.handleHealth)
	mux.HandleFunc("/internal/broadcast", app.handleBroadcast)

	server := &http.Server{
		Addr:              "0.0.0.0:" + cfg.port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()

	log.Printf("ws-hub listening on :%s (validation=%t)", cfg.port, cfg.internalAPIURL != "")
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("ws-hub stopped: %v", err)
	}
	fmt.Println("ws-hub shutdown complete")
}
