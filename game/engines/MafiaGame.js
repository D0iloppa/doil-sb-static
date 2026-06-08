// 마피아 — 서버가 사회자. 밤(마피아/의사/경찰 행동) → 낮(투표) 반복.
const { GameEngine } = require('./GameEngine');

const ROLES = { MAFIA: 'mafia', DOCTOR: 'doctor', POLICE: 'police', CITIZEN: 'citizen' };
const NIGHT_SECONDS = 40;
const DAY_SECONDS = 60;

function mafiaCount(n) {
  if (n >= 9) return 3;
  if (n >= 6) return 2;
  return 1;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class MafiaGame extends GameEngine {
  static meta = { type: 'mafia', label: '🎭 마피아', minPlayers: 4, maxPlayers: 12 };

  constructor(room) {
    super(room);
    this.round = 0;
    this.nightActions = {};
    this.votes = new Map();
    this.log = [];
    this.policeResults = {}; // playerId -> { name, isMafia }
    this.winner = null;
  }

  start(requesterId) {
    if (!this.room.isHost(requesterId)) throw new Error('호스트만 시작할 수 있습니다.');
    if (this.room.phase !== 'lobby') throw new Error('이미 시작된 게임입니다.');
    const players = this.room.list();
    if (players.length < 4) throw new Error('최소 4명이 필요합니다.');

    const nMafia = mafiaCount(players.length);
    const roles = [];
    for (let i = 0; i < nMafia; i++) roles.push(ROLES.MAFIA);
    roles.push(ROLES.DOCTOR, ROLES.POLICE);
    while (roles.length < players.length) roles.push(ROLES.CITIZEN);
    const shuffled = shuffle(roles);
    players.forEach((p, i) => { p.role = shuffled[i]; p.alive = true; });

    this.round = 1;
    this.log.push(`게임 시작 — 마피아 ${nMafia}명. 밤이 되었습니다.`);
    this._startNight();
  }

  _alive() { return this.room.list().filter((p) => p.alive); }
  _aliveMafia() { return this._alive().filter((p) => p.role === ROLES.MAFIA); }
  _hasAlive(role) { return this._alive().some((p) => p.role === role); }

  _startNight() {
    this.room.phase = 'night';
    this.nightActions = {};
    this.room.startTimer(NIGHT_SECONDS, () => this._resolveNight());
  }

  _allNightIn() {
    const a = this.nightActions;
    const mafia = this._aliveMafia().length === 0 || a.mafiaTarget != null;
    const doctor = !this._hasAlive(ROLES.DOCTOR) || a.doctorTarget != null;
    const police = !this._hasAlive(ROLES.POLICE) || a.policeTarget != null;
    return mafia && doctor && police;
  }

  _resolveNight() {
    this.room.clearTimer();
    const a = this.nightActions;
    let killed = null;
    if (a.mafiaTarget && a.mafiaTarget !== a.doctorTarget) {
      const v = this.room.player(a.mafiaTarget);
      if (v && v.alive) { v.alive = false; killed = v.name; }
    }
    this.log.push(killed ? `밤 사이 ${killed} 님이 사망했습니다.` : '밤이 지났지만 아무도 죽지 않았습니다.');
    if (this._checkWin()) return;
    this._startDay();
  }

  _startDay() {
    this.room.phase = 'day';
    this.votes = new Map();
    this.log.push('낮이 되었습니다. 토론 후 투표하세요.');
    this.room.startTimer(DAY_SECONDS, () => this._resolveVote());
  }

  _resolveVote() {
    this.room.clearTimer();
    const tally = new Map();
    for (const t of this.votes.values()) tally.set(t, (tally.get(t) || 0) + 1);
    let top = null, topN = 0, tie = false;
    for (const [id, n] of tally) {
      if (n > topN) { top = id; topN = n; tie = false; }
      else if (n === topN) tie = true;
    }
    if (top && !tie) {
      const e = this.room.player(top);
      e.alive = false;
      this.log.push(`투표 결과 ${e.name} 님이 처형되었습니다.`);
    } else {
      this.log.push('투표가 동률/무효라 아무도 처형되지 않았습니다.');
    }
    if (this._checkWin()) return;
    this.round += 1;
    this.log.push(`${this.round}일차 밤이 되었습니다.`);
    this._startNight();
  }

  _checkWin() {
    const mafia = this._aliveMafia().length;
    const others = this._alive().length - mafia;
    if (mafia === 0) { this._end('citizen', '마피아가 모두 제거되었습니다. 시민 승리!'); return true; }
    if (mafia >= others) { this._end('mafia', '마피아 수가 시민 이상이 되었습니다. 마피아 승리!'); return true; }
    return false;
  }
  _end(winner, msg) {
    this.room.clearTimer();
    this.room.phase = 'ended';
    this.winner = winner;
    this.log.push(msg);
  }

  onAction(playerId, action) {
    const actor = this.room.player(playerId);
    if (!actor || !actor.alive) throw new Error('행동할 수 없습니다.');

    if (action.kind === 'night') {
      if (this.room.phase !== 'night') throw new Error('지금은 밤이 아닙니다.');
      const target = this.room.player(action.targetId);
      if (!target || !target.alive) throw new Error('대상이 올바르지 않습니다.');
      if (actor.role === ROLES.MAFIA) this.nightActions.mafiaTarget = action.targetId;
      else if (actor.role === ROLES.DOCTOR) this.nightActions.doctorTarget = action.targetId;
      else if (actor.role === ROLES.POLICE) {
        this.nightActions.policeTarget = action.targetId;
        this.policeResults[playerId] = { name: target.name, isMafia: target.role === ROLES.MAFIA };
      } else throw new Error('밤에 행동할 수 있는 역할이 아닙니다.');
      if (this._allNightIn()) this._resolveNight();
    } else if (action.kind === 'vote') {
      if (this.room.phase !== 'day') throw new Error('지금은 투표 시간이 아닙니다.');
      const target = this.room.player(action.targetId);
      if (!target || !target.alive) throw new Error('대상이 올바르지 않습니다.');
      this.votes.set(playerId, action.targetId);
      if (this.votes.size >= this._alive().length) this._resolveVote();
    }
  }

  playerView(p, viewerId) {
    const viewer = this.room.player(viewerId);
    let role;
    if (this.room.phase === 'ended') role = p.role; // 종료 후 전체 공개
    else if (viewer && viewer.role === ROLES.MAFIA && p.role === ROLES.MAFIA) role = ROLES.MAFIA; // 동료 식별
    return { alive: p.alive !== false, role };
  }

  viewFor(viewerId) {
    const me = this.room.player(viewerId);
    return {
      myRole: me ? me.role : null,
      round: this.round,
      log: this.log.slice(-30),
      winner: this.winner,
      policeResult: this.policeResults[viewerId] || null,
    };
  }
}

module.exports = { MafiaGame, ROLES };
