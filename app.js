const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_PATH = process.env.BASE_PATH || '';

// 정적 파일 서빙 (public 폴더)
app.use(express.static(path.join(__dirname, 'public')));

// JSON 파싱 미들웨어
app.use(express.json());

// 동적 base path 미들웨어
app.use((req, res, next) => {
  const forwardedPrefix = req.headers['x-forwarded-prefix'] || BASE_PATH;
  res.locals.basePath = forwardedPrefix;
  req.basePath = forwardedPrefix;
  next();
});

// API 라우트들만 Express에서 처리
// 헬스체크 API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    basePath: req.basePath,
    version: '1.0.0',
    memory: process.memoryUsage()
  });
});

// 기본 정보 API
app.get('/api/info', (req, res) => {
  res.json({
    name: 'doil-sb-static',
    version: '1.0.0',
    basePath: req.basePath,
    message: 'Welcome to doil-sb API!',
    endpoints: [
      '/api/health',
      '/api/info',
      '/api/projects'
    ]
  });
});

// 프로젝트 목록 API
app.get('/api/projects', (req, res) => {
  res.json({
    portfolio: [
      { name: 'Project 1', status: 'completed' },
      { name: 'Project 2', status: 'in-progress' }
    ],
    study: [
      { name: 'JavaScript Deep Dive', status: 'completed' },
      { name: 'React Learning', status: 'in-progress' }
    ],
    experiments: [
      { name: 'WebGL Experiment', status: 'experimental' }
    ]
  });
});

// 설정 정보 API (개발용)
app.get('/api/config', (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    res.json({
      basePath: req.basePath,
      headers: req.headers,
      environment: process.env,
      publicPath: path.join(__dirname, 'public')
    });
  } else {
    res.status(403).json({ error: 'Forbidden in production' });
  }
});

// 정적 파일이 없는 경우 404 (Express가 마지막에 처리)
app.use((req, res) => {
  // API 요청인 경우
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ 
      error: 'API endpoint not found',
      path: req.path 
    });
  } else {
    // 정적 파일 요청인 경우 (public/404.html이 있다면 서빙)
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
      if (err) {
        res.status(404).send(`
          <h1>404 - Page Not Found</h1>
          <p>요청하신 페이지를 찾을 수 없습니다.</p>
          <a href="${req.basePath || '/'}">← Back to Home</a>
        `);
      }
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏖️ doil-sb running on port ${PORT}`);
  console.log(`📁 Static files served from: ${path.join(__dirname, 'public')}`);
  console.log(`🔗 Base path: ${BASE_PATH || '(dynamic from headers)'}`);
});

module.exports = app;