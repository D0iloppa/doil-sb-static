// 게임 공통 방(Room) — 게임 종류와 무관한 인프라를 담당한다.
// 플레이어 식별/재접속, 채팅, 페이즈 타이머, 상태 직렬화(역할별 필터는 엔진에 위임).
// 게임별 규칙은 this.game (GameEngine 구현체)이 담당한다.

class Room {
  constructor(code, type, EngineClass) {
    this.code = code;
    this.type = type;
    this.players = new Map(); // playerId -> { playerId, name, socketId, connected, ...게임필드 }
    this.hostId = null;
    this.chat = [];
    this.phase = 'lobby';
    this.timerEndsAt = null;
    this._timer = null;
    this.onChange = () => {}; // socket 레이어가 broadcast를 연결
    this.game = new EngineClass(this);
  }

  player(id) { return this.players.get(id); }
  list() { return [...this.players.values()]; }
  connected() { return this.list().filter((p) => p.connected); }

  // ---------- 플레이어 식별 / 재접속 ----------
  // playerId는 클라이언트가 localStorage에 보관하는 안정적 식별자.
  addPlayer(playerId, name, socketId) {
    if (this.players.has(playerId)) {
      // 같은 사람이 다시 들어옴(로비 재진입/재접속)
      const p = this.players.get(playerId);
      p.socketId = socketId;
      p.connected = true;
      if (name) p.name = name;
      return true;
    }
    if (this.phase !== 'lobby') return false; // 진행 중엔 신규 입장 불가
    this.players.set(playerId, { playerId, name: name || '익명', socketId, connected: true });
    if (!this.hostId) this.hostId = playerId;
    return true;
  }

  rejoin(playerId, socketId) {
    const p = this.players.get(playerId);
    if (!p) return false;
    p.socketId = socketId;
    p.connected = true;
    return true;
  }

  disconnectSocket(socketId) {
    for (const p of this.players.values()) {
      if (p.socketId !== socketId) continue;
      p.connected = false;
      if (this.phase === 'lobby') this.players.delete(p.playerId);
      if (this.hostId === p.playerId) {
        const next = this.connected()[0];
        this.hostId = next ? next.playerId : this.hostId;
      }
      return p;
    }
    return null;
  }

  isHost(playerId) { return this.hostId === playerId; }

  // ---------- 채팅 ----------
  addChat(playerId, text) {
    const p = this.players.get(playerId);
    if (!p || !text) return;
    this.chat.push({ name: p.name, text: String(text).slice(0, 300), ts: Date.now() });
    if (this.chat.length > 100) this.chat.shift();
  }

  // ---------- 타이머 ----------
  startTimer(seconds, cb) {
    this.clearTimer();
    this.timerEndsAt = Date.now() + seconds * 1000;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.timerEndsAt = null;
      try { cb(); } catch (e) { console.error('[timer]', e); }
      this.onChange();
    }, seconds * 1000);
  }

  clearTimer() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    this.timerEndsAt = null;
  }

  // ---------- 직렬화 (viewer 시점) ----------
  serialize(viewerId) {
    const players = this.list().map((p) => ({
      id: p.playerId,
      name: p.name,
      connected: p.connected,
      isHost: p.playerId === this.hostId,
      ...this.game.playerView(p, viewerId), // 게임별 공개 필드(역할/생존 등)
    }));
    return {
      code: this.code,
      type: this.type,
      phase: this.phase,
      hostId: this.hostId,
      myId: viewerId,
      timerEndsAt: this.timerEndsAt,
      players,
      chat: this.chat.slice(-50),
      game: this.game.viewFor(viewerId), // 게임별 viewer 전용 데이터
    };
  }
}

module.exports = { Room };
