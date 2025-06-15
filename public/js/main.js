// 동적 base path 처리
let basePath = '';

// API 호출 함수
async function fetchAPI(endpoint) {
    try {
        const response = await fetch(`${basePath}/api${endpoint}`);
        return await response.json();
    } catch (error) {
        console.error('API 호출 실패:', error);
        return null;
    }
}

// 페이지 로드 시 환경 정보 업데이트
document.addEventListener('DOMContentLoaded', async () => {
    // 현재 경로에서 base path 추출
    const currentPath = window.location.pathname;
    const matches = currentPath.match(/^(.*\/sb)/);
    if (matches) {
        basePath = matches[1];
    }

    // 환경 정보 API 호출
    const healthData = await fetchAPI('/health');
    if (healthData) {
        updateEnvironmentInfo(healthData);
    }

    // 네비게이션 링크 업데이트
    updateNavigationLinks();
});

// 환경 정보 업데이트
function updateEnvironmentInfo(data) {
    const envInfo = document.getElementById('env-info');
    if (envInfo) {
        envInfo.innerHTML = `
            <h3>🚀 Environment Info</h3>
            <p><strong>Base Path:</strong> <code>${data.basePath || basePath || '/'}</code></p>
            <p><strong>Node.js:</strong> ${data.version || 'Unknown'}</p>
            <p><strong>Status:</strong> ${data.status}</p>
            <p><strong>Uptime:</strong> ${Math.floor(data.uptime || 0)}s</p>
        `;
    }
}

// 네비게이션 링크 업데이트
function updateNavigationLinks() {
    const links = document.querySelectorAll('.nav-link[data-path]');
    links.forEach(link => {
        const path = link.getAttribute('data-path');
        link.href = `${basePath}${path}`;
    });
}
