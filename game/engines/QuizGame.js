// 큐플레이식 OX 서바이벌 퀴즈.
// 출제 → 제한시간 O/X 응답 → 정답 공개 + 오답 탈락 → 최후 생존.
// 레벨 대신 IQ 스탯을 누적(정답 +, 오답 -, 생존 보너스). IQ는 DB(game_player)에 영속.
const { GameEngine } = require('./GameEngine');
const { getRandomQuestions, getOrCreatePlayer, applyResults } = require('../db');

const ANSWER_SECONDS = 12;
const REVEAL_SECONDS = 3;
const QUESTION_COUNT = 10;
const IQ_CORRECT = 3;
const IQ_WRONG = -2;
const IQ_WIN = 10;

class QuizGame extends GameEngine {
  static meta = { type: 'quiz', label: '🧠 OX 퀴즈 (큐플레이)', minPlayers: 2, maxPlayers: 30 };

  constructor(room) {
    super(room);
    this.questions = [];
    this.idx = -1;
    this.stage = null;       // 'answer' | 'reveal'
    this.log = [];
    this.persisted = false;
  }

  async start(requesterId) {
    if (!this.room.isHost(requesterId)) throw new Error('호스트만 시작할 수 있습니다.');
    if (this.room.phase !== 'lobby') throw new Error('이미 시작된 게임입니다.');
    const players = this.room.list();
    if (players.length < 2) throw new Error('최소 2명이 필요합니다.');

    this.questions = await getRandomQuestions(QUESTION_COUNT);
    if (this.questions.length === 0) throw new Error('출제할 문제가 없습니다.');

    // 플레이어 상태 초기화 + 영속 IQ 로드
    for (const p of players) {
      const rec = await getOrCreatePlayer(p.playerId, p.name);
      p.iq = rec.iq;
      p.iqDelta = 0;
      p.alive = true;
      p.answer = null;
    }
    this.room.phase = 'playing';
    this.idx = -1;
    this.log.push(`OX 서바이벌 시작! 문제 ${this.questions.length}개. 틀리면 탈락.`);
    this._nextQuestion();
  }

  _alive() { return this.room.list().filter((p) => p.alive !== false); }

  _nextQuestion() {
    this.idx += 1;
    if (this.idx >= this.questions.length) return this._end('문제 소진');
    this.stage = 'answer';
    this.room.list().forEach((p) => { p.answer = null; });
    this.room.startTimer(ANSWER_SECONDS, () => this._resolveRound());
  }

  _allAnswered() {
    const alive = this._alive();
    return alive.length > 0 && alive.every((p) => p.answer !== null);
  }

  _resolveRound() {
    this.room.clearTimer();
    const q = this.questions[this.idx];
    const alive = this._alive();

    // 정답/오답 판정 (미응답 = 오답 취급)
    const correct = [];
    const wrong = [];
    for (const p of alive) {
      if (p.answer === q.answer) correct.push(p);
      else wrong.push(p);
    }
    // 전원 오답이면 전멸 방지: 아무도 탈락시키지 않는다.
    const wipe = correct.length === 0;
    if (!wipe) {
      correct.forEach((p) => { p.iqDelta += IQ_CORRECT; });
      wrong.forEach((p) => { p.alive = false; p.iqDelta += IQ_WRONG; });
    }
    this.lastReveal = {
      question: q.question,
      answer: q.answer,
      correctNames: correct.map((p) => p.name),
      eliminatedNames: wipe ? [] : wrong.map((p) => p.name),
      wipe,
    };
    this.log.push(
      wipe
        ? `정답: ${q.answer ? 'O' : 'X'} — 전원 오답! 아무도 탈락하지 않습니다.`
        : `정답: ${q.answer ? 'O' : 'X'} — ${wrong.length}명 탈락.`
    );

    // 종료 판정
    const survivors = this._alive();
    if (survivors.length <= 1 || this.idx >= this.questions.length - 1) {
      this.stage = 'reveal';
      this.room.startTimer(REVEAL_SECONDS, () => this._end('생존자 확정'));
      return;
    }
    this.stage = 'reveal';
    this.room.startTimer(REVEAL_SECONDS, () => this._nextQuestion());
  }

  _end() {
    this.room.clearTimer();
    this.stage = null;
    this.room.phase = 'ended';
    const survivors = this._alive();
    survivors.forEach((p) => { p.iqDelta += IQ_WIN; });
    this.winnerNames = survivors.map((p) => p.name);
    this.log.push(
      survivors.length ? `🏆 생존: ${this.winnerNames.join(', ')} (+${IQ_WIN} IQ)` : '생존자 없음'
    );
    this._persist();
  }

  async _persist() {
    if (this.persisted) return;
    this.persisted = true;
    const survivorIds = new Set(this._alive().map((p) => p.playerId));
    const updates = this.room.list().map((p) => ({
      playerId: p.playerId,
      iqDelta: p.iqDelta || 0,
      won: survivorIds.has(p.playerId),
    }));
    try {
      await applyResults(updates);
      this.room.onChange(); // 갱신된 IQ 반영 위해 재방송
    } catch (e) {
      console.error('[quiz] persist 실패:', e.message);
    }
  }

  async onAction(playerId, action) {
    if (action.kind !== 'answer') return;
    if (this.room.phase !== 'playing' || this.stage !== 'answer') throw new Error('지금은 응답 시간이 아닙니다.');
    const p = this.room.player(playerId);
    if (!p || p.alive === false) throw new Error('탈락하여 응답할 수 없습니다.');
    if (p.answer !== null) return; // 이미 응답
    p.answer = action.value === true;
    if (this._allAnswered()) this._resolveRound();
  }

  playerView(p, viewerId) {
    return {
      alive: p.alive !== false,
      answered: this.stage === 'answer' ? p.answer !== null && p.answer !== undefined : undefined,
      iq: p.iq != null ? p.iq + (p.iqDelta || 0) : undefined,
    };
  }

  viewFor(viewerId) {
    const me = this.room.player(viewerId);
    const q = this.questions[this.idx];
    const v = {
      stage: this.stage,
      round: this.idx + 1,
      total: this.questions.length,
      log: this.log.slice(-30),
      myAlive: me ? me.alive !== false : false,
      myAnswer: me ? me.answer : null,
      myIq: me && me.iq != null ? me.iq + (me.iqDelta || 0) : null,
      myIqDelta: me ? me.iqDelta || 0 : 0,
    };
    if (this.stage === 'answer' && q) v.question = { category: q.category, text: q.question };
    if (this.stage === 'reveal' || this.room.phase === 'ended') v.reveal = this.lastReveal || null;
    if (this.room.phase === 'ended') v.winnerNames = this.winnerNames || [];
    return v;
  }
}

module.exports = { QuizGame };
