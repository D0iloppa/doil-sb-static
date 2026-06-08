// 워들(한글) — 같은 2글자 정답을 두고 멀티 레이스.
// 각자 6번 추측, 자모(초/중/종성) 단위 색 피드백. 먼저 맞히면 승리.
const { GameEngine } = require('./GameEngine');
const { WORDLE_WORDS } = require('../data/words');
const { isValidWord, scoreGuess } = require('../util/hangul');

const MAX_TRIES = 6;
const WORD_LEN = 2;
const PLAY_SECONDS = 300; // 5분 제한

class WordleGame extends GameEngine {
  static meta = { type: 'wordle', label: '🟩 워들 (한글)', minPlayers: 1, maxPlayers: 12 };

  constructor(room) {
    super(room);
    this.answer = null;
    this.log = [];
    this.winnerId = null;
  }

  start(requesterId) {
    if (!this.room.isHost(requesterId)) throw new Error('호스트만 시작할 수 있습니다.');
    if (this.room.phase !== 'lobby') throw new Error('이미 시작된 게임입니다.');

    this.answer = WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)];
    this.room.list().forEach((p) => { p.board = []; p.solved = false; p.done = false; });
    this.room.phase = 'playing';
    this.log.push(`${WORD_LEN}글자 단어 맞히기 시작! 각자 ${MAX_TRIES}번 기회.`);
    this.room.startTimer(PLAY_SECONDS, () => this._end('시간 초과로 종료되었습니다.'));
  }

  _allDone() { return this.room.list().every((p) => p.done); }

  _end(msg) {
    this.room.clearTimer();
    this.room.phase = 'ended';
    if (msg) this.log.push(msg);
  }

  onAction(playerId, action) {
    if (action.kind !== 'guess') return;
    if (this.room.phase !== 'playing') throw new Error('지금은 진행 중이 아닙니다.');
    const p = this.room.player(playerId);
    if (!p || p.done) throw new Error('더 이상 추측할 수 없습니다.');

    const guess = String(action.word || '').replace(/\s/g, '');
    if (!isValidWord(guess, WORD_LEN)) throw new Error(`완성된 한글 ${WORD_LEN}글자를 입력하세요.`);

    const scored = scoreGuess(this.answer, guess);
    p.board.push({ word: guess, syllables: scored.syllables, solved: scored.solved });

    if (scored.solved) {
      p.solved = true;
      p.done = true;
      this.log.push(`${p.name} 님이 정답을 맞혔습니다!`);
      if (!this.winnerId) {
        this.winnerId = playerId;
        this._end(`🏆 ${p.name} 님 승리! 정답은 "${this.answer}"`);
        return;
      }
    } else if (p.board.length >= MAX_TRIES) {
      p.done = true;
      this.log.push(`${p.name} 님이 기회를 모두 소진했습니다.`);
    }
    if (this._allDone()) this._end(`모두 종료. 정답은 "${this.answer}"`);
  }

  playerView(p, viewerId) {
    return {
      tries: p.board ? p.board.length : 0,
      solved: !!p.solved,
      done: !!p.done,
      isWinner: p.playerId === this.winnerId,
    };
  }

  viewFor(viewerId) {
    const me = this.room.player(viewerId);
    return {
      maxTries: MAX_TRIES,
      wordLen: WORD_LEN,
      myBoard: me && me.board ? me.board : [],
      myDone: me ? !!me.done : false,
      log: this.log.slice(-30),
      winnerId: this.winnerId,
      answer: this.room.phase === 'ended' ? this.answer : undefined,
    };
  }
}

module.exports = { WordleGame };
