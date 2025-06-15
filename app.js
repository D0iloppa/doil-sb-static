const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// 메인 라우트
app.get('/', (req, res) => {
    res.send(`
        <h1>🏖️ doil-sb Sandbox</h1>
        <p><a href="./health">Health Check</a></p>
    `);
});

// 헬스체크
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`doil-sb running on port ${PORT}`);
});
