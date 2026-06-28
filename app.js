const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { registerGameSocket } = require('./game/socket');
// sshBridge는 doil-webssh 컨테이너로 이전 — 더 이상 doil-sb에서 등록하지 않음

const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// View Engine 설정
// =========================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// Layout 설정 추가
app.use(expressLayouts);
app.set('layout', 'layout');  // layout.ejs 사용

// =========================
// 기본 미들웨어
// =========================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// Context 체크 미들웨어
// =========================
function requireContext(req, res, next) {
  const forwardedPrefix = req.headers['x-forwarded-prefix'];
  
  if (!forwardedPrefix && process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      error: 'Direct access not allowed',
      message: 'This resource must be accessed through the proper context'
    });
  }
  
  req.rootContext = forwardedPrefix || '';
  next();
}

// =========================
// 공통 데이터 미들웨어
// =========================
function addCommonData(req, res, next) {
  res.locals.rootContext = req.rootContext || '';
  res.locals.currentYear = new Date().getFullYear();
  res.locals.appName = 'doil-sb';
  res.locals.version = '1.0.0';
  res.locals.environment = process.env.NODE_ENV || 'development';
  next();
}

// =========================
// 정적 파일 서빙 (Context 체크 포함)
// =========================
app.use('/css', requireContext, express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', requireContext, express.static(path.join(__dirname, 'public', 'js')));
app.use('/images', requireContext, express.static(path.join(__dirname, 'public', 'images')));

// =========================
// API Router
// =========================
const apiRouter = express.Router();

// API 헬스체크
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    rootContext: req.rootContext,
    version: '1.0.0',
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API 정보
apiRouter.get('/info', (req, res) => {
  res.json({
    name: 'doil-sb-static',
    version: '1.0.0',
    rootContext: req.rootContext,
    message: 'Welcome to doil-sb API!',
    endpoints: [
      '/api/health',
      '/api/info', 
      '/api/projects',
      '/api/config'
    ]
  });
});

// 프로젝트 목록 API
apiRouter.get('/projects', (req, res) => {
  res.json({
    experiments: [
      {
        name: 'The Shining',
        status: 'active',
        path: 'tsh',
        description: 'Experimental web components and custom HTML elements.'
      },
      {
        name: 'Flocking Algorithm',
        status: 'active',
        path: 'fa',
        description: 'A simulation of flocking behavior using HTML5 Canvas.'
      },
      {
        name: 'The ASCII',
        status: 'active',
        path: 'tas',
        description: 'Convert media content into ASCII art representation.'
      }
    ],
    study: [
      { name: 'JavaScript Deep Dive', status: 'completed' },
      { name: 'React Learning', status: 'in-progress' },
      { name: 'Node.js Development', status: 'active' }
    ],
    portfolio: [
      { name: 'doil-sb Project', status: 'active' }
    ]
  });
});

// 개발용 설정 API
apiRouter.get('/config', (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    res.json({
      rootContext: req.rootContext,
      headers: req.headers,
      environment: process.env.NODE_ENV || 'development',
      viewsPath: path.join(__dirname, 'views'),
      publicPath: path.join(__dirname, 'public'),
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(403).json({ error: 'Forbidden in production' });
  }
});

// =========================
// Pages Router (View 렌더링)
// =========================
const pagesRouter = express.Router();

// 모든 페이지에 Context 체크 및 공통 데이터 적용
pagesRouter.use(requireContext);
pagesRouter.use(addCommonData);

// 메인 페이지
pagesRouter.get('/', (req, res) => {
  try {
    const systemInfo = {
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      status: 'Running'
    };

    const services = [
      {
        name: 'API Health Check',
        description: 'System status and monitoring',
        status: 'Online',
        action: 'Check',
        link: `${req.rootContext}/api/health`,
        className: 'api'
      },
      {
        name: 'Experiments',
        description: 'Experimental projects and prototypes', 
        status: 'Available',
        action: 'Browse',
        link: `${req.rootContext}/experiments/`,
        className: ''
      },
      {
        name: 'API Documentation',
        description: 'Available API endpoints',
        status: 'Available', 
        action: 'View',
        link: `${req.rootContext}/api/info`,
        className: ''
      }
    ];

    res.render('index', {
      title: 'doil-sb Sandbox',
      subtitle: `Literally, It's a sandbox.`,
      systemInfo: systemInfo,
      services: services
    });
  } catch (error) {
    console.error('Index page error:', error);
    res.status(500).render('error', { 
      title: 'Server Error',
      error: error.message 
    });
  }
});

// Experiments 메인 페이지
pagesRouter.get('/experiments', (req, res) => {
  const experiments = [
    {
      name: 'The Shining',
      category: 'Frontend',
      description: 'Custom HTML elements and components',
      status: 'Active',
      path: 'tsh'
    },
    {
      name: 'Flocking Algorithm',
      category: 'Frontend',
      description: 'flocking simulation using HTML5 Canvas',
      status: 'Active',
      path: 'fa'
    },
    {
      name: 'The ASCII',
      category: 'Frontend',
      description: 'Media display to ASCII art',
      status: 'Active',
      path: 'tas'
    }
  ];

  res.render('experiments/index', {
    title: 'Experiments',
    subtitle: 'Experimental projects and prototypes',
    experiments: experiments
  });
});

// Experiments 하위 페이지들 (trailing slash 포함)
pagesRouter.get('/experiments/', (req, res) => {
  res.redirect(`${req.rootContext}/experiments`);
});

// Experiments 하위 페이지들
pagesRouter.get('/experiments/:subpage', (req, res) => {
  const subpage = req.params.subpage;
  
  const experimentPages = {
    'tsh': {
      title: 'The Shining',
      subtitle: 'Custom HTML elements and components',
      icon: '⚙️',
      description: 'Experimental web components and custom HTML elements.'
    },
    'fa': {
      title: 'Flocking Algorithm',
      subtitle: 'Flocking simulation using HTML5 Canvas',
      icon: '🐦',
      description: 'A simulation of flocking behavior using HTML5 Canvas.'
    },
    'tas': {
      title: 'The ASCII',
      subtitle: 'Media display to ASCII art',
      icon: '🖼️',
      description: 'Convert media content into ASCII art representation.'
    },
  };

  const pageData = experimentPages[subpage];
  
  if (pageData) {
    try {
      res.render(`experiments/${subpage}`, {
        title: pageData.title,
        subtitle: pageData.subtitle,
        icon: pageData.icon,
        description: pageData.description,
        subpage: subpage
      });
    } catch (error) {
      console.error(`Error rendering experiments/${subpage}:`, error);
      res.status(404).render('404', {
        title: '404 - Template Not Found',
        message: `The template for ${subpage} experiment is not available yet.`
      });
    }
  } else {
    res.status(404).render('404', {
      title: '404 - Experiment Not Found', 
      message: 'The requested experiment page does not exist.'
    });
  }
});

// Portfolio 페이지
pagesRouter.get('/portfolio', (req, res) => {
  const portfolioProjects = [
    {
      name: 'doil-sb Sandbox',
      description: 'This project - Express-based development sandbox',
      status: 'Active',
      technologies: ['Node.js', 'Express', 'EJS', 'Docker']
    }
  ];

  res.render('portfolio/index', {
    title: 'Portfolio',
    subtitle: 'Personal projects and works',
    projects: portfolioProjects
  });
});

// Study 페이지
pagesRouter.get('/study', (req, res) => {
  const studyProjects = [
    {
      name: 'JavaScript Deep Dive',
      description: 'Advanced JavaScript concepts and patterns',
      status: 'Completed',
      progress: 100
    },
    {
      name: 'React Learning Path',
      description: 'Modern React development practices',
      status: 'In Progress',
      progress: 75
    },
    {
      name: 'Node.js Backend Development',
      description: 'Server-side development with Node.js',
      status: 'Active',
      progress: 60
    }
  ];

  res.render('study/index', {
    title: 'Study Projects',
    subtitle: 'Learning and practice projects',
    studies: studyProjects
  });
});

// 관리자 콘솔 (서비스 일람 CRUD) — /sb/admin. 인증은 페이지 내 토큰 로그인.
pagesRouter.get('/admin', (req, res) => {
  res.set('Cache-Control', 'no-store');   // 인라인 CSS/JS 갱신 즉시 반영(브라우저 캐시로 옛 버전 고착 방지)
  res.render('admin', { layout: false });
});

// SSH 팝업 창 — 인증은 postMessage 로 wsshSecret 수신
pagesRouter.get('/admin-ssh', (req, res) => {
  res.render('ssh-popup', { layout: false });
});

// 스케치패드 — /sketchpad 접속 시 새 UUID 캔버스로 redirect
pagesRouter.get('/sketchpad', (req, res) => {
  const { randomUUID } = require('crypto');
  res.redirect(`${req.rootContext}/sketchpad/${randomUUID()}`);
});
pagesRouter.get('/sketchpad/:id', (req, res) => {
  const canvasId = req.params.id.replace(/[^a-z0-9_\-]/gi, '').slice(0, 80) || 'default';
  res.render('sketchpad', { layout: false, canvasId, rootContext: req.rootContext });
});

// =========================
// Router 마운트
// =========================
const devRouter = require('./routes/dev');
const authRouter = require('./auth').router;
const geoChatRouter = require('./routes/api/geoChat');
const servicesRouter = require('./routes/api/services');
const settingsRouter = require('./routes/api/settings');
const { statusRouter: dobisStatusRouter } = require('./dobisBridge');
const paintRouter = require('./routes/api/paint');
const stockRouter = require('./routes/api/stock');
const { router: collectRouter } = require('./routes/api/collect');
const sketchpadRouter = require('./routes/api/sketchpad');
const graphHookRouter = require('./routes/api/graphHook');
const graphRouter = require('./routes/graph');
const jamiRouter = require('./routes/jami');
app.use('/api/dev', devRouter);        // Plane → dev_context proxy
app.use('/api/auth', authRouter);      // 공유 로그인(CHATBOT_ID/PW → 토큰)
app.use('/api/geo/chat', geoChatRouter); // geo 챗봇(인증 + 작업 큐)
app.use('/api/services', servicesRouter); // 홈페이지 서비스 일람(공개 읽기 + 관리자 CRUD)
app.use('/api/settings', settingsRouter); // 관리자 콘솔 설정(배경 등)
app.use('/api/dobis', dobisStatusRouter); // DOBIS 워커 상태(host waker 폴링)
app.use('/api/paint', paintRouter);    // PAINT 앱 — dobis/shared 저장
app.use('/api/stock', stockRouter);   // Bloomberg terminal — 주식 데이터 프록시
app.use('/api/stock', collectRouter); // market 데이터 수집 (collect, collect/status)
app.use('/api/sketchpad', sketchpadRouter); // 스케치패드 캔버스 저장/조회
app.use('/api/graph', graphHookRouter);    // 그래프 Notion 버튼 웹훅
app.use('/graph', graphRouter);            // DOYCLOPEDIA 그래프 뷰어 + 데이터 API
app.use('/jamidusu/src', express.static(path.join(__dirname, 'jamidusu/src')));
app.use('/jamidusu', jamiRouter);
app.use('/api', apiRouter);      // 기존 내부 API
app.use('/', pagesRouter);       // Pages는 view 렌더링 + context 체크

// =========================
// 에러 핸들링 미들웨어
// =========================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  if (req.path.startsWith('/api/')) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  } else {
    res.status(500).render('error', {
      title: '500 - Server Error',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// =========================
// 404 Handler
// =========================
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ 
      error: 'API endpoint not found',
      path: req.path,
      availableEndpoints: ['/api/health', '/api/info', '/api/projects', '/api/config']
    });
  } else {
   // 모든 필요한 변수들을 명시적으로 전달
    res.status(404).render('404', {
      title: '404 - Page Not Found',
      subtitle: 'Page Not Found',
      message: '요청하신 페이지를 찾을 수 없습니다.',
      rootContext: req.rootContext || '',
      currentYear: new Date().getFullYear(),
      appName: 'doil-sb',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

// =========================
// 서버 시작 (HTTP + Socket.IO)
// =========================
const server = http.createServer(app);

// nginx가 /sb/socket.io 로 업그레이드 요청을 프록시한다.
const io = new Server(server, {
  path: '/sb/socket.io',
  cors: { origin: true },
  maxHttpBufferSize: 50 * 1024 * 1024,  // 파일 전송용 50MB
});
registerGameSocket(io);
// SSH 터미널은 doil-webssh 컨테이너가 처리 (/wssh/socket.io)
require('./dobisBridge').registerDobis(io);  // DOBIS 챗봇 (/dobis ↔ /dobis-worker 중계)

// geo 챗봇 작업 큐 테이블 보장(실패해도 서버는 뜬다 — 해당 API 만 502)
require('./db/geoChat').ensureSchema()
  .then(() => console.log('🗺  geo_chat_jobs schema ready'))
  .catch((e) => console.error('[geo-chat] ensureSchema failed:', e.message));

// 서비스 일람 테이블 보장
require('./db/siteServices').ensureSchema()
  .then(() => console.log('🗂  site_services schema ready'))
  .catch((e) => console.error('[services] ensureSchema failed:', e.message));

// 관리자 설정 테이블 보장
require('./db/appSettings').ensureSchema()
  .then(() => console.log('⚙  app_settings schema ready'))
  .catch((e) => console.error('[settings] ensureSchema failed:', e.message));

// 스케치패드 테이블 보장
require('./db/sketchpad').ensureSchema()
  .then(() => console.log('🎨 sketchpad schema ready'))
  .catch((e) => console.error('[sketchpad] ensureSchema failed:', e.message));

// 관리자 계정 테이블 보장 + (비어있으면) env 에서 초기 시드
require('./db/adminUsers').ensureSchema()
  .then(() => { console.log('👤 admin_users schema ready'); return require('./auth').seedFromEnv(); })
  .then(() => require('./db/adminUsers').ensureRoot())
  .catch((e) => console.error('[admin] ensureSchema/seed failed:', e.message));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 doil-sb running on port ${PORT}`);
  console.log(`🎮 Game socket namespace: /games (path /sb/socket.io)`);
  console.log(`📁 Views directory: ${path.join(__dirname, 'views')}`);
  console.log(`🎨 View engine: EJS`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Context checking: ${process.env.NODE_ENV !== 'development' ? 'Enabled' : 'Disabled (dev mode)'}`);
  console.log(`📊 Available routes:`);
  console.log(`   GET / - Main page`);
  console.log(`   GET /experiments - Experiments index`);
  console.log(`   GET /experiments/:subpage - Individual experiments`);
  console.log(`   GET /portfolio - Portfolio page`);
  console.log(`   GET /study - Study projects`);
  console.log(`   GET /api/health - Health check`);
  console.log(`   GET /api/info - API information`);
  console.log(`   GET /api/projects - Projects data`);

  // market 데이터 수집 cron 시작 (평일 22:30 KST)
  try {
    require('./jobs/marketCollect').startCollectJob();
  } catch (e) {
    console.error('[market-collect] cron 등록 실패:', e.message);
  }
});

module.exports = app;