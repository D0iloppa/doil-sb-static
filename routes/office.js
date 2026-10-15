// ONLYOFFICE Docs 통합 라우터 — MS Office(docx/xlsx/pptx) 웹 편집기.
// - 런처: 문서 목록 + 업로드 + 편집기 임베드
// - DS(onlyoffice-ds)는 dev-net 내부로 문서 서빙(/file)·저장 콜백(/callback) 호출
// - JWT(HS256)는 node crypto 로 직접 서명/검증(의존성 추가 없음)
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const router = express.Router();

const DOCS_DIR = process.env.OFFICE_DOCS || '/app/office-docs';
const JWT_SECRET = process.env.ONLYOFFICE_JWT_SECRET || '';
// DS 가 doil-sb 를 부를 내부 주소(dev-net) — 문서 다운로드/콜백용
const INTERNAL_BASE = process.env.OFFICE_INTERNAL_BASE || 'http://doil-sb:3000';

const TYPE_MAP = {
  // 확장자 → ONLYOFFICE documentType
  docx: 'word', doc: 'word', odt: 'word', rtf: 'word', txt: 'word',
  xlsx: 'cell', xls: 'cell', ods: 'cell', csv: 'cell',
  pptx: 'slide', ppt: 'slide', odp: 'slide',
};

// ── JWT(HS256) 최소 구현 ──────────────────────────────────────────────
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function jwtSign(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}
function jwtVerify(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expect = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest());
  if (!crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(parts[2]))) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')); } catch { return null; }
}

// ── 경로 안전 해석(루트 밖 차단) ──────────────────────────────────────
function safeFile(name) {
  const full = path.resolve(DOCS_DIR, name);
  if (full !== path.resolve(DOCS_DIR, path.basename(name)) || path.dirname(full) !== path.resolve(DOCS_DIR)) {
    throw new Error('invalid file name');
  }
  return full;
}
function extOf(name) { return (name.split('.').pop() || '').toLowerCase(); }
function docType(name) { return TYPE_MAP[extOf(name)] || 'word'; }
// 문서 버전 key(≤20자, 편집 반영 위해 mtime 포함)
function docKey(name) {
  let mt = 0;
  try { mt = Math.floor(fs.statSync(safeFile(name)).mtimeMs); } catch {}
  return crypto.createHash('md5').update(name + ':' + mt).digest('hex').slice(0, 20);
}

// ── 런처: 문서 목록 + 업로드 ─────────────────────────────────────────
router.get('/', (req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(DOCS_DIR)
      .filter(f => TYPE_MAP[extOf(f)])
      .map(f => {
        const st = fs.statSync(path.join(DOCS_DIR, f));
        return { name: f, size: st.size, mtime: st.mtime, type: docType(f) };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch (e) {}
  res.render('office/launcher', { layout: false, files });
});

const upload = multer({ dest: '/tmp' });
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/office-app/');
  const name = path.basename(req.file.originalname);
  if (!TYPE_MAP[extOf(name)]) { fs.unlinkSync(req.file.path); return res.status(400).send('지원하지 않는 형식'); }
  fs.copyFileSync(req.file.path, safeFile(name));
  fs.unlinkSync(req.file.path);
  res.redirect('/office-app/edit/' + encodeURIComponent(name));
});

// ── 편집기 페이지 ────────────────────────────────────────────────────
router.get('/edit/:name', (req, res) => {
  const name = req.params.name;
  let full;
  try { full = safeFile(name); } catch { return res.status(400).send('bad name'); }
  if (!fs.existsSync(full)) return res.status(404).send('파일 없음: ' + name);

  const ft = jwtSign({ name, purpose: 'file', exp: Math.floor(Date.now() / 1000) + 3600 });
  const config = {
    document: {
      fileType: extOf(name),
      key: docKey(name),
      title: name,
      url: `${INTERNAL_BASE}/office-app/file/${encodeURIComponent(name)}?t=${ft}`,
    },
    documentType: docType(name),
    editorConfig: {
      mode: 'edit',
      lang: 'ko',
      callbackUrl: `${INTERNAL_BASE}/office-app/callback/${encodeURIComponent(name)}?t=${ft}`,
      user: { id: 'doil', name: 'doil' },
      customization: { forcesave: true },
    },
  };
  config.token = jwtSign(config);
  res.render('office/editor', { layout: false, name, config: JSON.stringify(config) });
});

// ── DS 가 문서를 가져가는 엔드포인트(내부 호출) ──────────────────────
router.get('/file/:name', (req, res) => {
  const payload = jwtVerify(req.query.t);
  if (!payload || payload.name !== req.params.name) return res.status(403).send('forbidden');
  let full;
  try { full = safeFile(req.params.name); } catch { return res.status(400).send('bad name'); }
  if (!fs.existsSync(full)) return res.status(404).send('not found');
  res.download(full, req.params.name);
});

// ── DS 저장 콜백(내부 호출) ─────────────────────────────────────────
// status: 2=저장 준비 완료, 6=강제저장. body.url 에서 편집본을 받아 원본에 덮어씀.
router.post('/callback/:name', async (req, res) => {
  const payload = jwtVerify(req.query.t);
  if (!payload || payload.name !== req.params.name) return res.json({ error: 1 });
  const body = req.body || {};
  // JWT 활성 시 body.token 검증(설정과 무관하게 방어적으로)
  if (body.token && !jwtVerify(body.token)) return res.json({ error: 1 });
  try {
    if ((body.status === 2 || body.status === 6) && body.url) {
      const r = await fetch(body.url);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(safeFile(req.params.name), buf);
    }
    res.json({ error: 0 });
  } catch (e) {
    res.json({ error: 1 });
  }
});

module.exports = router;
