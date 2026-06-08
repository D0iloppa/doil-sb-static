// 라이어게임 — 라이어만 제시어를 모른 채 토론.
// describe(토론·채팅) → vote(라이어 지목) → 적중 시 liarGuess(라이어가 제시어 추리) → ended.
const { GameEngine } = require('./GameEngine');
const { LIAR_WORDS } = require('../data/words');

const DESCRIBE_SECONDS = 90;
const VOTE_SECONDS = 45;
const GUESS_SECONDS = 30;

class LiarGame extends GameEngine {
  static meta = { type: 'liar', label: '🤥 라이어게임', minPlayers: 3, maxPlayers: 10 };

  constructor(room) {
    super(room);
    this.category = null;
    this.word = null;
    this.liarId = null;
    this.votes = new Map();
    this.accusedId = null;
    this.log = [];
    this.winner = null; // 'liar' | 'citizen'
  }

  start(requesterId) {
    if (!this.room.isHost(requesterId)) throw new Error('호스트만 시작할 수 있습니다.');
    if (this.room.phase !== 'lobby') throw new Error('이미 시작된 게임입니다.');
    const players = this.room.list();
    if (players.length < 3) throw new Error('최소 3명이 필요합니다.');

    const pick = LIAR_WORDS[Math.floor(Math.random() * LIAR_WORDS.length)];
    this.category = pick.category;
    this.word = pick.word;
    this.liarId = players[Math.floor(Math.random() * players.length)].playerId;

    this.room.phase = 'describe';
    this.log.push(`주제: [${this.category}]. 한 명씩 제시어를 설명하세요. (라이어 1명 포함)`);
    this.room.startTimer(DESCRIBE_SECONDS, () => this._startVote());
  }

  _startVote() {
    this.room.clearTimer();
    this.room.phase = 'vote';
    this.votes = new Map();
    this.log.push('투표: 라이어로 의심되는 사람을 지목하세요.');
    this.room.startTimer(VOTE_SECONDS, () => this._resolveVote());
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
    this.accusedId = top && !tie ? top : null;
    const accusedName = this.accusedId ? this.room.player(this.accusedId).name : null;

    if (this.accusedId === this.liarId) {
      this.log.push(`${accusedName} 님이 라이어로 지목되었습니다! 라이어는 제시어를 맞혀 역전을 노리세요.`);
      this.room.phase = 'liarGuess';
      this.room.startTimer(GUESS_SECONDS, () => this._end('citizen', '라이어가 제시어를 맞히지 못했습니다. 시민 승리!'));
    } else {
      const who = accusedName ? `${accusedName} 님(시민)이 지목됨` : '지목 실패(동률)';
      this._end('liar', `${who}. 라이어가 들키지 않았습니다. 라이어 승리!`);
    }
  }

  _end(winner, msg) {
    this.room.clearTimer();
    this.room.phase = 'ended';
    this.winner = winner;
    this.log.push(msg);
  }

  onAction(playerId, action) {
    if (action.kind === 'next') {
      // 호스트가 토론을 조기 종료하고 투표로 넘어감
      if (this.room.phase !== 'describe') throw new Error('지금은 토론 단계가 아닙니다.');
      if (!this.room.isHost(playerId)) throw new Error('호스트만 진행할 수 있습니다.');
      return this._startVote();
    }
    if (action.kind === 'vote') {
      if (this.room.phase !== 'vote') throw new Error('지금은 투표 시간이 아닙니다.');
      if (!this.room.player(action.targetId)) throw new Error('대상이 올바르지 않습니다.');
      this.votes.set(playerId, action.targetId);
      if (this.votes.size >= this.room.list().length) this._resolveVote();
    } else if (action.kind === 'liarGuess') {
      if (this.room.phase !== 'liarGuess') throw new Error('지금은 추리 시간이 아닙니다.');
      if (playerId !== this.liarId) throw new Error('라이어만 추리할 수 있습니다.');
      const guess = String(action.word || '').replace(/\s/g, '');
      if (guess === this.word.replace(/\s/g, '')) {
        this._end('liar', `라이어가 제시어 "${this.word}"를 맞혔습니다! 역전, 라이어 승리!`);
      } else {
        this._end('citizen', `라이어의 추리 "${guess}"는 틀렸습니다. 시민 승리!`);
      }
    }
  }

  playerView(p, viewerId) {
    if (this.room.phase === 'ended') {
      return { isLiar: p.playerId === this.liarId };
    }
    return {};
  }

  viewFor(viewerId) {
    const isLiar = viewerId === this.liarId;
    const base = {
      category: this.category,
      role: isLiar ? 'liar' : 'citizen',
      log: this.log.slice(-30),
      winner: this.winner,
    };
    // 라이어는 제시어를 모른다. 시민만 단어를 본다. 종료 후엔 모두 공개.
    if (!isLiar || this.room.phase === 'ended') base.word = this.word;
    if (this.room.phase === 'ended') base.liarName = this.liarId ? this.room.player(this.liarId)?.name : null;
    return base;
  }
}

module.exports = { LiarGame };
