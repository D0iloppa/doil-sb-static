const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');

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
        name: 'Canvas Drawing', 
        status: 'active', 
        path: 'canvas',
        description: 'HTML5 Canvas experiments and drawing tools'
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
    }
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

// =========================
// Router 마운트
// =========================
app.use('/api', apiRouter);      // API는 context 체크 없음
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
// 서버 시작
// =========================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 doil-sb running on port ${PORT}`);
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
});

module.exports = app;