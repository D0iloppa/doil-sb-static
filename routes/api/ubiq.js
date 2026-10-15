// ubiq 기기 승인 대행 — 관리자 콘솔(HOME-HUB)의 PIN 등록.
//
// ubiq 은 "웹에 관리 엔드포인트를 두지 않는다"가 원칙이라(devicectl.py 가 유일한
// 관리 경로) 승인 API 를 공개 표면에 올리지 않는다. 그래서 브라우저는 여기로만
// 요청하고, 토큰을 든 서버가 dev-net 내부(http://ubiq:8610)로 대신 부른다.
// 토큰(UBIQ_ADMIN_TOKEN)은 브라우저로 절대 내려가지 않는다.
//
// 루트 관리자 전용이다 — 기기 승인은 집 IoT 제어권을 넘기는 행위라서 sub 관리자에게
// 열지 않는다.
const express = require('express');
const http = require('http');
const { requireRoot } = require('../../auth');

const router = express.Router();

const UBIQ_HOST = process.env.UBIQ_INTERNAL_HOST || 'ubiq';
const UBIQ_PORT = Number(process.env.UBIQ_INTERNAL_PORT || 8610);
const UBIQ_PATH = process.env.UBIQ_BASE_PATH || '/d_tools/ubiq';
// ubiq 은 Host 헤더 화이트리스트(UBIQ_ALLOWED_HOSTS)를 스스로 한 번 더 본다. 내부
// 이름(ubiq:8610)으로 부르면 'bad host' 400 이 되므로 공개 이름을 Host 로 보낸다.
// fetch(undici)는 Host 헤더를 무시해서 못 쓴다 — 그래서 http.request 를 직접 쓴다.
const UBIQ_SEND_HOST = process.env.UBIQ_SEND_HOST || 'doil.me';
const TOKEN = process.env.UBIQ_ADMIN_TOKEN || '';

// dev-net 내부 POST 하나. JSON 을 보내고 { status, body } 를 돌려준다.
function postJson(path, payload, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      host: UBIQ_HOST, port: UBIQ_PORT, path, method: 'POST',
      headers: Object.assign({
        'Host': UBIQ_SEND_HOST,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      }, headers || {}),
      timeout: 10000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let body = {};
        try { body = buf ? JSON.parse(buf) : {}; } catch (e) { body = { detail: buf }; }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(data);
  });
}

router.post('/approve', requireRoot, async (req, res) => {
  if (!TOKEN) return res.status(503).json({ error: 'not configured', message: 'UBIQ_ADMIN_TOKEN 미설정' });
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return res.status(400).json({ error: 'bad code', message: '승인 코드를 확인하세요.' });
  const label = String((req.body || {}).label || '').slice(0, 40);
  try {
    const { status, body } = await postJson(
      UBIQ_PATH + '/admin/approve',
      { code, label: label || `admin:${req.admin.username}` },
      { 'Authorization': 'Bearer ' + TOKEN },
    );
    if (status < 200 || status >= 300) {
      return res.status(status).json({ error: 'ubiq', message: body.detail || ('HTTP ' + status) });
    }
    console.log('[ubiq] approve by %s → %s', req.admin.username, body.device_id);
    res.json(body);
  } catch (e) {
    console.error('[ubiq] approve error:', e.message);
    res.status(502).json({ error: 'upstream', message: 'ubiq 에 연결할 수 없습니다.' });
  }
});

module.exports = router;
