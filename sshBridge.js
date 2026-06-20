// 관리자 콘솔 SSH 터미널 — socket.io 네임스페이스 /ssh.
// 브라우저 xterm ↔ 소켓 ↔ ssh2 로 호스트(host.docker.internal) 셸을 중계한다.
//
// 보안:
//  - 소켓 연결 시 관리자 토큰(공유 auth) 검증. 없으면 거부.
//  - 접속 자격(호스트 계정 id/pw)은 매 연결마다 클라이언트가 입력 → 그 순간 인증에만 사용, 저장 안 함.
//  - 접속 대상은 호스트로 고정(임의 호스트 피벗 차단).
//  - 세션 시작/종료를 감사 로그(logs/ssh-audit.log + stdout)에 남긴다.
const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const { validToken } = require('./auth');

const SSH_HOST = process.env.SSH_TARGET_HOST || 'host.docker.internal';
const SSH_PORT = Number(process.env.SSH_TARGET_PORT || 22);
const SSH_INITIAL_DIR = process.env.SSH_INITIAL_DIR || '/home/doil/workspace/w_dev';
const AUDIT = path.join(__dirname, 'logs', 'ssh-audit.log');

function audit(line) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log('[ssh-audit]', line);
  try {
    fs.mkdirSync(path.dirname(AUDIT), { recursive: true });
    fs.appendFileSync(AUDIT, msg + '\n');
  } catch (e) { /* 로그 실패는 무시 */ }
}

function registerSshSocket(io) {
  const nsp = io.of('/ssh');

  // 핸드셰이크에서 관리자 토큰 검증(슬라이딩 갱신 포함)
  nsp.use((socket, next) => {
    const t = socket.handshake.auth && socket.handshake.auth.token;
    if (t && validToken(t)) return next();
    next(new Error('unauthorized'));
  });

  nsp.on('connection', (socket) => {
    const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || 'unknown';
    let conn = null;     // ssh2 Client
    let stream = null;   // shell stream
    let uploadHome = null;  // SFTP realpath('.') — 업로드 기본 경로

    function cleanup(reason) {
      if (stream) { try { stream.end(); } catch {} stream = null; }
      if (conn) { try { conn.end(); } catch {} conn = null; }
      if (reason) audit(`session end (${reason}) ip=${ip}`);
    }

    socket.on('ssh:start', (opts = {}) => {
      if (conn) return; // 이미 세션 있음
      const username = String(opts.username || '').slice(0, 64);
      const password = String(opts.password || '');
      const cols = Number(opts.cols) || 80;
      const rows = Number(opts.rows) || 24;
      if (!username || !password) { socket.emit('ssh:error', 'username/password required'); return; }

      audit(`session start user=${username} -> ${SSH_HOST}:${SSH_PORT} ip=${ip}`);
      conn = new Client();
      conn
        .on('ready', () => {
          socket.emit('ssh:status', 'connected');
          conn.shell({ term: 'xterm-256color', cols, rows }, (err, s) => {
            if (err) { socket.emit('ssh:error', err.message); cleanup('shell-error'); return; }
            stream = s;
            stream.on('data', (d) => socket.emit('ssh:data', d.toString('utf8')));
            stream.on('close', () => { socket.emit('ssh:status', 'closed'); cleanup('stream-close'); });
            stream.stderr.on('data', (d) => socket.emit('ssh:data', d.toString('utf8')));
            // tmux 세션에 attach(재연결) 또는 신규 생성 — 소켓 끊겨도 host 프로세스 생존
            if (SSH_INITIAL_DIR && /^[\w./~-]+$/.test(SSH_INITIAL_DIR)) {
              stream.write(`cd ${SSH_INITIAL_DIR} && tmux attach -t admin 2>/dev/null || tmux new -s admin\n`);
            }
            // SFTP 홈 디렉토리 확인 (업로드 기본 경로)
            conn.sftp((e, sftp) => {
              if (!e) sftp.realpath('.', (e2, p) => { if (!e2) uploadHome = p; sftp.end(); });
            });
          });
        })
        .on('error', (err) => { socket.emit('ssh:error', err.message); cleanup(null); conn = null; })
        .on('close', () => { socket.emit('ssh:status', 'disconnected'); })
        .connect({ host: SSH_HOST, port: SSH_PORT, username, password, readyTimeout: 15000 });
    });

    socket.on('ssh:data', (d) => { if (stream) stream.write(d); });
    socket.on('ssh:resize', (sz = {}) => { if (stream) try { stream.setWindow(sz.rows || 24, sz.cols || 80); } catch {} });
    socket.on('ssh:end', () => cleanup('client-end'));
    socket.on('disconnect', () => cleanup('socket-disconnect'));

    // rz: 브라우저 → 서버 파일 업로드 (SFTP write)
    socket.on('ssh:upload', ({ name, data }) => {
      if (!conn || !uploadHome) { socket.emit('ssh:xfer', { op: 'up', name, ok: false, error: '연결 없음' }); return; }
      const safeName = String(name || 'upload').replace(/[/\\]/g, '_').slice(0, 255);
      const dest = uploadHome + '/' + safeName;
      conn.sftp((err, sftp) => {
        if (err) { socket.emit('ssh:xfer', { op: 'up', name, ok: false, error: err.message }); return; }
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const ws = sftp.createWriteStream(dest, { flags: 'w', mode: 0o644 });
        ws.on('close', () => { sftp.end(); socket.emit('ssh:xfer', { op: 'up', name, ok: true, dest }); });
        ws.on('error', (e) => { try { sftp.end(); } catch {} socket.emit('ssh:xfer', { op: 'up', name, ok: false, error: e.message }); });
        ws.write(buf); ws.end();
      });
    });

    // sz: 서버 → 브라우저 파일 다운로드 (SFTP read)
    socket.on('ssh:download', ({ path: filePath }) => {
      if (!conn) { socket.emit('ssh:xfer', { op: 'down', name: String(filePath), ok: false, error: '연결 없음' }); return; }
      conn.sftp((err, sftp) => {
        if (err) { socket.emit('ssh:xfer', { op: 'down', name: String(filePath), ok: false, error: err.message }); return; }
        const name = String(filePath).split('/').pop();
        const chunks = [];
        const rs = sftp.createReadStream(filePath);
        rs.on('data', (c) => chunks.push(c));
        rs.on('close', () => { sftp.end(); socket.emit('ssh:xfer', { op: 'down', name, ok: true, data: Buffer.concat(chunks) }); });
        rs.on('error', (e) => { try { sftp.end(); } catch {} socket.emit('ssh:xfer', { op: 'down', name, ok: false, error: e.message }); });
      });
    });
  });
}

module.exports = { registerSshSocket };
