// 모든 게임 엔진이 구현하는 베이스 인터페이스.
// 새 게임을 추가하려면 이 클래스를 상속해 메서드를 채우고 registry.js에 등록하면 된다.
class GameEngine {
  constructor(room) {
    this.room = room;
  }

  // 게임 시작 (호스트 요청). room.phase를 'lobby'가 아닌 값으로 전환해야 한다.
  start(/* requesterId */) {
    throw new Error('start() not implemented');
  }

  // 플레이어 행동. action = { kind, ...payload }
  onAction(/* playerId, action */) {}

  // 직렬화 시 각 플레이어의 공개 필드 (viewer 시점). 기본은 빈 객체.
  playerView(/* player, viewerId */) { return {}; }

  // viewer 전용 게임 데이터(내 역할, 내 보드 등). 기본은 빈 객체.
  viewFor(/* viewerId */) { return {}; }
}

module.exports = { GameEngine };
