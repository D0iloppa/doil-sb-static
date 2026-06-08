// Socket.IO 게임 네임스페이스(/games) — 게임 종류와 무관한 공통 핸들링.
// 방 생성(type 지정)/입장/재접속/채팅/행동/시작을 처리하고, 행동은 엔진에 위임한다.
const { Room } = require('./Room');
const { registry, gameList } = require('./registry');

const rooms = new Map(); // code -> Room

function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function registerGameSocket(io) {
  const nsp = io.of('/games');

  // 방의 모든 연결된 플레이어에게 각자 시점 상태를 전송
  function broadcast(room) {
    for (const p of room.list()) {
      if (p.connected && p.socketId) nsp.to(p.socketId).emit('state', room.serialize(p.playerId));
    }
  }
  function bind(room) { room.onChange = () => broadcast(room); }

  nsp.on('connection', (socket) => {
    socket.emit('games', gameList);
    let pid = null;     // 이 소켓의 playerId
    let room = null;

    const fail = (cb, msg) => { cb && cb({ ok: false, error: msg }); socket.emit('errorMsg', msg); };

    socket.on('createRoom', ({ type, name, playerId }, cb) => {
      const Engine = registry[type];
      if (!Engine) return fail(cb, '알 수 없는 게임 타입입니다.');
      if (!playerId) return fail(cb, 'playerId가 필요합니다.');
      const code = genCode();
      room = new Room(code, type, Engine);
      bind(room);
      room.addPlayer(playerId, name, socket.id);
      rooms.set(code, room);
      pid = playerId;
      cb && cb({ ok: true, code });
      broadcast(room);
    });

    socket.on('joinRoom', ({ code, name, playerId }, cb) => {
      const r = rooms.get((code || '').toUpperCase());
      if (!r) return fail(cb, '방을 찾을 수 없습니다.');
      if (!playerId) return fail(cb, 'playerId가 필요합니다.');
      if (!r.addPlayer(playerId, name, socket.id)) return fail(cb, '이미 시작된 게임입니다.');
      room = r; pid = playerId;
      cb && cb({ ok: true, code: r.code });
      broadcast(r);
    });

    // 새로고침/재연결 복구
    socket.on('rejoin', ({ code, playerId }, cb) => {
      const r = rooms.get((code || '').toUpperCase());
      if (!r || !r.rejoin(playerId, socket.id)) return cb && cb({ ok: false });
      room = r; pid = playerId;
      cb && cb({ ok: true, code: r.code });
      broadcast(r);
    });

    socket.on('start', () => {
      if (!room || !pid) return;
      try { room.game.start(pid); broadcast(room); }
      catch (e) { socket.emit('errorMsg', e.message); }
    });

    socket.on('action', (action) => {
      if (!room || !pid || !action) return;
      try { room.game.onAction(pid, action); broadcast(room); }
      catch (e) { socket.emit('errorMsg', e.message); }
    });

    socket.on('chat', ({ text }) => {
      if (!room || !pid) return;
      room.addChat(pid, text);
      broadcast(room);
    });

    socket.on('disconnect', () => {
      if (!room) return;
      room.disconnectSocket(socket.id);
      if (room.connected().length === 0 && room.phase === 'lobby') {
        rooms.delete(room.code);
      } else {
        broadcast(room);
      }
    });
  });
}

module.exports = { registerGameSocket };
