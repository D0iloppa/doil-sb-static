// 게임 타입 레지스트리 — 새 게임은 여기에 한 줄 등록하면 방 생성/로비에 노출된다.
const { MafiaGame } = require('./engines/MafiaGame');
const { LiarGame } = require('./engines/LiarGame');
const { WordleGame } = require('./engines/WordleGame');

const ENGINES = [MafiaGame, LiarGame, WordleGame];

const registry = {};
for (const Engine of ENGINES) registry[Engine.meta.type] = Engine;

// 클라이언트 로비에 내려줄 게임 목록(메타)
const gameList = ENGINES.map((E) => ({ ...E.meta }));

module.exports = { registry, gameList };
