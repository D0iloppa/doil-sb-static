const STAR_STATUS = {
  // 14주성
  자미: {
    자: '평',
    축: '묘',
    인: '묘',
    묘: '왕',
    진: '함',
    사: '왕',
    오: '묘',
    미: '묘',
    신: '왕',
    유: '평',
    술: '한',
    해: '왕',
  },
  천기: {
    자: '묘',
    축: '함',
    인: '왕',
    묘: '왕',
    진: '묘',
    사: '평',
    오: '묘',
    미: '함',
    신: '평',
    유: '왕',
    술: '묘',
    해: '평',
  },
  태양: {
    자: '함',
    축: '함',
    인: '왕',
    묘: '묘',
    진: '왕',
    사: '왕',
    오: '묘',
    미: '평',
    신: '한',
    유: '한',
    술: '함',
    해: '함',
  },
  무곡: {
    자: '왕',
    축: '묘',
    인: '한',
    묘: '함',
    진: '묘',
    사: '평',
    오: '왕',
    미: '묘',
    신: '평',
    유: '왕',
    술: '묘',
    해: '평',
  },
  천동: {
    자: '왕',
    축: '함',
    인: '한',
    묘: '묘',
    진: '평',
    사: '묘',
    오: '함',
    미: '함',
    신: '왕',
    유: '평',
    술: '평',
    해: '묘',
  },
  염정: {
    자: '평',
    축: '왕',
    인: '묘',
    묘: '한',
    진: '왕',
    사: '함',
    오: '평',
    미: '묘',
    신: '묘',
    유: '평',
    술: '왕',
    해: '함',
  },
  천부: {
    자: '묘',
    축: '묘',
    인: '묘',
    묘: '평',
    진: '묘',
    사: '평',
    오: '왕',
    미: '묘',
    신: '평',
    유: '함',
    술: '묘',
    해: '왕',
  },
  태음: {
    자: '묘',
    축: '묘',
    인: '한',
    묘: '함',
    진: '한',
    사: '함',
    오: '함',
    미: '평',
    신: '평',
    유: '왕',
    술: '왕',
    해: '묘',
  },
  탐랑: {
    자: '왕',
    축: '묘',
    인: '평',
    묘: '한',
    진: '묘',
    사: '함',
    오: '왕',
    미: '묘',
    신: '평',
    유: '평',
    술: '묘',
    해: '함',
  },
  거문: {
    자: '왕',
    축: '왕',
    인: '묘',
    묘: '묘',
    진: '평',
    사: '평',
    오: '왕',
    미: '함',
    신: '묘',
    유: '묘',
    술: '왕',
    해: '왕',
  },
  천상: {
    자: '묘',
    축: '묘',
    인: '묘',
    묘: '함',
    진: '왕',
    사: '평',
    오: '왕',
    미: '한',
    신: '묘',
    유: '함',
    술: '한',
    해: '평',
  },
  천량: {
    자: '묘',
    축: '왕',
    인: '묘',
    묘: '묘',
    진: '왕',
    사: '함',
    오: '묘',
    미: '왕',
    신: '함',
    유: '한',
    술: '왕',
    해: '함',
  },
  칠살: {
    자: '왕',
    축: '묘',
    인: '묘',
    묘: '함',
    진: '함',
    사: '평',
    오: '왕',
    미: '왕',
    신: '묘',
    유: '한',
    술: '묘',
    해: '평',
  },
  파군: {
    자: '묘',
    축: '왕',
    인: '함',
    묘: '왕',
    진: '왕',
    사: '한',
    오: '묘',
    미: '묘',
    신: '함',
    유: '한',
    술: '왕',
    해: '평',
  },

  // 길성
  좌보: {
    자: '왕',
    축: '묘',
    인: '묘',
    묘: '함',
    진: '묘',
    사: '평',
    오: '왕',
    미: '묘',
    신: '평',
    유: '함',
    술: '묘',
    해: '한',
  },
  우필: {
    자: '묘',
    축: '묘',
    인: '왕',
    묘: '함',
    진: '묘',
    사: '평',
    오: '왕',
    미: '묘',
    신: '한',
    유: '함',
    술: '묘',
    해: '평',
  },
  문창: {
    자: '왕',
    축: '묘',
    인: '함',
    묘: '평',
    진: '왕',
    사: '묘',
    오: '함',
    미: '평',
    신: '왕',
    유: '묘',
    술: '함',
    해: '왕',
  },
  문곡: {
    자: '묘',
    축: '묘',
    인: '평',
    묘: '왕',
    진: '묘',
    사: '묘',
    오: '함',
    미: '왕',
    신: '평',
    유: '묘',
    술: '함',
    해: '왕',
  },
  천괴: {
    자: '왕',
    축: '왕',
    인: '평',
    묘: '묘',
    진: '평',
    사: '평',
    오: '묘',
    미: '평',
    신: '평',
    유: '평',
    술: '평',
    해: '왕',
  },
  천월: {
    자: '평',
    축: '평',
    인: '왕',
    묘: '평',
    진: '평',
    사: '왕',
    오: '평',
    미: '왕',
    신: '묘',
    유: '묘',
    술: '평',
    해: '평',
  },

  // 살성
  경양: {
    자: '함',
    축: '묘',
    인: '평',
    묘: '함',
    진: '묘',
    사: '평',
    오: '평',
    미: '묘',
    신: '평',
    유: '함',
    술: '묘',
    해: '평',
  },
  타라: {
    자: '평',
    축: '묘',
    인: '함',
    묘: '평',
    진: '묘',
    사: '함',
    오: '평',
    미: '묘',
    신: '함',
    유: '평',
    술: '묘',
    해: '함',
  },
  화성: {
    자: '평',
    축: '왕',
    인: '묘',
    묘: '평',
    진: '한',
    사: '왕',
    오: '묘',
    미: '한',
    신: '함',
    유: '함',
    술: '묘',
    해: '평',
  },
  영성: {
    자: '함',
    축: '함',
    인: '묘',
    묘: '묘',
    진: '왕',
    사: '왕',
    오: '묘',
    미: '왕',
    신: '왕',
    유: '함',
    술: '묘',
    해: '묘',
  },
  지공: {
    자: '평',
    축: '함',
    인: '함',
    묘: '평',
    진: '함',
    사: '묘',
    오: '묘',
    미: '평',
    신: '묘',
    유: '묘',
    술: '함',
    해: '함',
  },
  지겁: {
    자: '함',
    축: '함',
    인: '평',
    묘: '평',
    진: '함',
    사: '한',
    오: '묘',
    미: '평',
    신: '묘',
    유: '평',
    술: '평',
    해: '왕',
  },

  // 잡성 (Mwhl 추가) - User Request - Reverted (Disabled)
  // '천월(잡)': { ... }, '천상(잡)': { ... } - REMOVED
};

// ========== 삼방사정 (三方四正) 상수 ==========
const samhapGroups = [
  [10, 2, 6],
  [4, 8, 0],
  [1, 5, 9],
  [7, 11, 3],
];
const daegungPairs = [
  [11, 5],
  [0, 6],
  [1, 7],
  [2, 8],
  [3, 9],
  [4, 10],
];

// ========== 전역 인스턴스 (초기화는 DOMContentLoaded에서) ==========
let timeCorrector;
let lunarConverter;
let ziWeiDouShu;
let renderer;

// ========== 초기화 ==========
const initApp = () => {
  // 1. 입력 필드 초기화 (라이브러리 로딩 실패 시에도 입력창은 보이게 함)
  const now = new Date();
  const yearInput = document.getElementById('yearInput');
  if (yearInput && !yearInput.value) {
    // 값이 없을 때만 초기화
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    setVal('yearInput', now.getFullYear());
    setVal('monthInput', now.getMonth() + 1);
    setVal('dayInput', now.getDate());
    setVal('hourInput', now.getHours());
    setVal('minuteInput', now.getMinutes());
  }

  // 2. 이벤트 리스너 등록
  initializeEventListeners();

  // 3. 라이브러리 인스턴스 초기화 (안전하게 처리)
  try {
    renderer = new Renderer(); // Initialize Renderer
    window.renderer = renderer; // Export to window so handleCalculate and switchMode can use it

    if (typeof TimeCorrector !== 'undefined') {
      timeCorrector = new TimeCorrector();
      window.timeCorrector = timeCorrector;
    } else console.error('TimeCorrector library missing');

    if (typeof LunarConverter !== 'undefined') {
      lunarConverter = new LunarConverter();
      window.lunarConverter = lunarConverter;
    } else console.error('LunarConverter library missing');

    if (typeof ZiWeiDouShu !== 'undefined') {
      ziWeiDouShu = new ZiWeiDouShu();
      window.ziWeiDouShu = ziWeiDouShu;
    } else console.error('ZiWeiDouShu library missing');
  } catch (e) {
    console.error('Library Initialization Error:', e);
    showToast('필수 라이브러리 로딩 중 오류가 발생했습니다. 기능이 제한될 수 있습니다.');
  }

  // 4. 입력 섹션 표시 강제 (애니메이션 제거)
  const inputSection = document.querySelector('.input-section');
  if (inputSection) {
    inputSection.style.opacity = 1;
    inputSection.style.transform = 'none';
  }

  // Renderer.js에서 호출하는 함수들을 window에 노출
  window.handleAgeClick = handleAgeClick;
  window.showToast = showToast;
  window.switchMode = switchMode;
  window.selectPalace = selectPalace;

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('year')) {
    setTimeout(() => {
      handleCalculate();
    }, 100);
  }

  if (typeof appState !== 'undefined') {
    document.body.setAttribute('data-lang', appState.isKorean ? 'ko' : 'zh');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

function initializeEventListeners() {
  const calcBtn = document.getElementById('calcBtn');
  if (calcBtn) {
    calcBtn.addEventListener('click', handleCalculate);
  } else {
    console.error('[CRITICAL] calcBtn element not found!');
  }
  // langBtn: center-area 내부에 동적으로 생성되므로, 여기서 직접 이벤트 리스너를 붙이지 않고 renderChart에서 처리하거나 위임해야 함.
  // 하지만 지금은 renderFunction에서 재생성하므로 renderChart 내에서 처리함.

  // Use Event Delegation for dynamic .palace elements
  const grid = document.querySelector('.palace-grid') || document.body;
  grid.addEventListener('click', (e) => {
    const palace = e.target.closest('.palace');
    if (palace) {
      // Prevent triggering if clicked on specific children (like age buttons)
      // Note: age buttons have stopPropagation in renderChart, but lock-icon might not?
      if (
        e.target.closest('.lock-icon') ||
        e.target.closest('.daeun-age-btn') ||
        e.target.closest('.yunyeon-age-btn') ||
        e.target.closest('.sohan-age-btn') ||
        e.target.closest('.yuwol-age-btn')
      )
        return;

      const position = parseInt(palace.dataset.position);
      if (!isNaN(position)) {
        selectPalace(position);
      }
    }
  });

  // Age Button Click Delegation
  document.addEventListener('click', (e) => {
    // Mode Buttons
    if (e.target.closest('.mode-btn')) {
      const btn = e.target.closest('.mode-btn');
      const mode = btn.dataset.mode;
      switchMode(mode, btn);
      return;
    }

    // Age Buttons (Daehan, Yunyeon, Sohan, Yuwol)
    if (e.target.closest('.daeun-age-btn')) {
      const btn = e.target.closest('.daeun-age-btn');
      handleAgeClick('daehan', parseInt(btn.dataset.idx), parseInt(btn.dataset.age));
      return;
    }
    if (e.target.closest('.yunyeon-age-btn')) {
      const btn = e.target.closest('.yunyeon-age-btn');
      handleAgeClick('yunyeon', parseInt(btn.dataset.idx), parseInt(btn.dataset.age));
      return;
    }
    if (e.target.closest('.sohan-age-btn')) {
      const btn = e.target.closest('.sohan-age-btn');
      handleAgeClick('sohan', parseInt(btn.dataset.idx), parseInt(btn.dataset.age));
      return;
    }
    if (e.target.closest('.yuwol-age-btn')) {
      const btn = e.target.closest('.yuwol-age-btn');
      handleAgeClick('yuwol', parseInt(btn.dataset.idx), parseInt(btn.dataset.age));
      return;
    }

    if (e.target.closest('#langToggleCenter')) {
      toggleLanguage();
    }
  });
}

function switchMode(mode, anchorElement = null) {
  if (!appState.currentResult) return;

  if ((mode === 'yunyeon' || mode === 'sohan') && !appState.isDaehanLocked()) {
    showToast('대한나이를 먼저 선택해 주세요.', anchorElement);
    return;
  }
  if (mode === 'yuwol') {
    if (!appState.isDaehanLocked()) {
      showToast('대한나이를 먼저 선택해 주세요.', anchorElement);
      return;
    }
    if (!appState.isYunyeonLocked() && !appState.isSohanLocked()) {
      showToast('유년이나 소한 나이를 먼저 선택해 주세요.', anchorElement);
      return;
    }
  }

  appState.currentLuckMode = mode;
  selectPalace(-1);

  if (mode === 'daehan') {
    appState.resetMode('daehan');
    showToast('대한나이를 선택해 주세요.', anchorElement);
  } else if (mode === 'yunyeon') {
    appState.resetMode('yunyeon');
  } else if (mode === 'sohan') {
    appState.resetMode('sohan');
  } else if (mode === 'yuwol') {
    appState.resetMode('yuwol');
  } else {
    appState.resetAll();
  }

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    if (btn.dataset.mode === mode) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  renderer.renderChart(appState.currentResult);
}

function handleAgeClick(mode, idx, age) {
  if (!appState.currentResult) return;
  const result = appState.currentResult;
  const branches = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];

  if (mode === 'daehan') {
    if (appState.currentLuckMode === 'basic') return;

    // 유월 모드에서 대한을 변경하는 경우, 강제 초기화 전 원래 출발했던 모드(유년/소한)로 복귀
    if (appState.currentLuckMode === 'yuwol') {
      let returnMode = 'daehan';
      if (appState.isYunyeonLocked()) returnMode = 'yunyeon';
      else if (appState.isSohanLocked()) returnMode = 'sohan';

      appState.currentLuckMode = returnMode;
      document.querySelectorAll('.mode-btn').forEach((btn) => {
        if (btn.dataset.mode === returnMode) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    }

    if (appState.getDaehanIndex() === idx && appState.isDaehanLocked()) {
      appState.setDaehanIndex(-1);
      appState.unlockDaehan();
    } else {
      appState.setDaehanIndex(idx);
      appState.lockDaehan();
    }
    appState.setYunyeonAge(-1);
    appState.unlockYunyeon();
    appState.setSohanAge(-1);
    appState.unlockSohan();
    appState.setYuwolAge(-1);
    appState.unlockYuwol();
  } else if (mode === 'yunyeon') {
    if (appState.currentLuckMode !== 'yunyeon' && appState.currentLuckMode !== 'yuwol') return;
    if (appState.getYunyeonAge() === age && appState.isYunyeonLocked()) {
      appState.unlockYunyeon();
    } else {
      appState.setYunyeonAge(age);
      appState.setYunyeonPalaceIndex(idx);
      appState.lockYunyeon();
      const targetYear = result.lunarDate.year + age - 1;
      appState.setYunyeonYearZhi(branches[(targetYear - 4) % 12]);
      // 소한 동기화
      appState.setSohanAge(age);
      const sohanPalace = result.palaces.findIndex((p) => p.sohanAges && p.sohanAges.includes(age));
      if (sohanPalace >= 0) appState.setSohanPalaceIndex(sohanPalace);
    }
  } else if (mode === 'sohan') {
    if (appState.currentLuckMode !== 'sohan' && appState.currentLuckMode !== 'yuwol') return;
    if (appState.getSohanAge() === age && appState.isSohanLocked()) {
      appState.unlockSohan();
    } else {
      appState.setSohanAge(age);
      appState.setSohanPalaceIndex(idx);
      appState.lockSohan();
      // 유년 동기화
      appState.setYunyeonAge(age);
      const targetYear = result.lunarDate.year + age - 1;
      const yearZhi = branches[(targetYear - 4) % 12];
      appState.setYunyeonYearZhi(yearZhi);
      const yyPalace = result.palaces.findIndex((p) => p.branch && p.branch === yearZhi);
      if (yyPalace >= 0) appState.setYunyeonPalaceIndex(yyPalace);
    }
  } else if (mode === 'yuwol') {
    if (appState.currentLuckMode !== 'yuwol') return;
    if (appState.getYuwolAge() === age && appState.isYuwolLocked()) {
      appState.unlockYuwol();
    } else {
      appState.setYuwolAge(age);
      appState.setYuwolPalaceIndex(idx);
      appState.lockYuwol();
    }
  }

  let palaceIdxToHighlight = idx;
  if (mode === 'daehan') {
    const gIdx = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'].indexOf(
      result.lunarYearGan
    );
    const isClockwise =
      (gIdx % 2 === 0 && result.gender === 'male') || (gIdx % 2 !== 0 && result.gender !== 'male');
    palaceIdxToHighlight = ziWeiDouShu.norm(result.mingIdx + idx * (isClockwise ? 1 : -1));
  }

  renderer.renderChart(appState.currentResult);
  // renderChart가 DOM을 완전히 재생성하므로 하이라이트만 수행
  setTimeout(() => selectPalace(palaceIdxToHighlight, true), 50);
}

function toggleLanguage() {
  appState.isKorean = !appState.isKorean;
  document.body.setAttribute('data-lang', appState.isKorean ? 'ko' : 'zh');
  selectPalace(-1);
  if (appState.currentResult) {
    renderer.renderChart(appState.currentResult);
  }
}

// ========== 삼방사정 헬퍼 함수 ==========
function getSamhapGroup(position) {
  for (let group of samhapGroups) if (group.includes(position)) return group;
  return [];
}

function getDaegung(position) {
  for (let pair of daegungPairs) {
    if (pair[0] === position) return pair[1];
    if (pair[1] === position) return pair[0];
  }
  return null;
}

function selectPalace(position, highlightOnly = false) {
  // 하이라이트 전용 호출이면 상태 변경 없이 바로 하이라이트만 수행
  if (highlightOnly) {
    document
      .querySelectorAll('.palace')
      .forEach((p) => p.classList.remove('selected', 'samhap', 'daegung'));
    const svg = document.getElementById('centerSvg');
    if (svg) svg.innerHTML = '';
    if (position === -1) return;
    const targetPalace = document.querySelector(`.palace[data-position="${position}"]`);
    if (targetPalace) targetPalace.classList.add('selected');
    const samhapGroup = getSamhapGroup(position);
    const daegung = getDaegung(position);
    samhapGroup.forEach((pos) => {
      if (pos !== position)
        document.querySelector(`.palace[data-position="${pos}"]`)?.classList.add('samhap');
    });
    if (daegung !== null)
      document.querySelector(`.palace[data-position="${daegung}"]`)?.classList.add('daegung');
    drawSambangsajeong(position, samhapGroup, daegung, 0);
    return;
  }

  appState.selectedPalaceIndex = position;
  document
    .querySelectorAll('.palace')
    .forEach((p) => p.classList.remove('selected', 'samhap', 'daegung'));

  const svg = document.getElementById('centerSvg');
  if (svg) svg.innerHTML = '';

  if (position === -1) return;

  const result = appState.currentResult;
  const branches = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];

  const reRender = () => {
    renderer.renderChart(result);
    setTimeout(() => selectPalace(position, true), 50);
  };

  // 대한 모드: 잠금 전 프리뷰
  if (appState.currentLuckMode === 'daehan' && result) {
    if (!appState.isDaehanLocked()) {
      const palaceElem = document.querySelector(`.palace[data-position="${position}"]`);
      if (palaceElem && palaceElem.dataset.daehanStep !== undefined) {
        const newIdx = parseInt(palaceElem.dataset.daehanStep);
        if (appState.getDaehanIndex() !== newIdx) {
          appState.setDaehanIndex(newIdx);
          reRender();
          return;
        }
      }
    }
  }

  // 유년 모드
  if (appState.currentLuckMode === 'yunyeon' && result) {
    if (!appState.isDaehanLocked()) {
      const palaceElem = document.querySelector(`.palace[data-position="${position}"]`);
      if (palaceElem && palaceElem.dataset.daehanStep !== undefined) {
        const newIdx = parseInt(palaceElem.dataset.daehanStep);
        if (appState.getDaehanIndex() !== newIdx) {
          appState.setDaehanIndex(newIdx);
          reRender();
          return;
        }
      }
    } else if (!appState.isYunyeonLocked()) {
      const daehanStartAge = result.bureauNum + appState.getDaehanIndex() * 10;
      const daehanEndAge = daehanStartAge + 9;
      const palaceBranch = result.palaces[position].branch;

      let targetAge = -1;
      for (let age = daehanStartAge; age <= daehanEndAge; age++) {
        const targetYear = result.lunarDate.year + age - 1;
        const targetYearZhi = branches[(((targetYear - 4) % 12) + 12) % 12];
        if (targetYearZhi === palaceBranch) {
          targetAge = age;
          break;
        }
      }

      if (targetAge !== -1) {
        if (
          appState.getYunyeonAge() !== targetAge ||
          appState.getYunyeonPalaceIndex() !== position
        ) {
          appState.setYunyeonAge(targetAge);
          appState.setYunyeonPalaceIndex(position);
          const targetYear = result.lunarDate.year + targetAge - 1;
          appState.setYunyeonYearZhi(branches[(((targetYear - 4) % 12) + 12) % 12]);
          appState.setSohanAge(targetAge);
          const sohanPalace = result.palaces.findIndex(
            (p) => p.sohanAges && p.sohanAges.includes(targetAge)
          );
          if (sohanPalace >= 0) appState.setSohanPalaceIndex(sohanPalace);
          reRender();
          return;
        }
      } else if (appState.getYunyeonAge() !== -1) {
        appState.setYunyeonAge(-1);
        appState.setYunyeonPalaceIndex(-1);
        appState.setYunyeonYearZhi(null);
        reRender();
        return;
      }
    }
  }

  // 소한 모드
  if (appState.currentLuckMode === 'sohan' && result) {
    if (!appState.isDaehanLocked()) {
      const palaceElem = document.querySelector(`.palace[data-position="${position}"]`);
      if (palaceElem && palaceElem.dataset.daehanStep !== undefined) {
        const newIdx = parseInt(palaceElem.dataset.daehanStep);
        if (appState.getDaehanIndex() !== newIdx) {
          appState.setDaehanIndex(newIdx);
          reRender();
          return;
        }
      }
    } else if (!appState.isSohanLocked()) {
      const daehanStartAge = result.bureauNum + appState.getDaehanIndex() * 10;
      const daehanEndAge = daehanStartAge + 9;
      const palaceSohanAges = (result.palaces[position].sohanAges || []).filter(
        (a) => a >= daehanStartAge && a <= daehanEndAge
      );

      if (palaceSohanAges.length > 0) {
        const targetAge = palaceSohanAges[0];
        if (appState.getSohanAge() !== targetAge || appState.getSohanPalaceIndex() !== position) {
          appState.setSohanAge(targetAge);
          appState.setSohanPalaceIndex(position);
          appState.setYunyeonAge(targetAge);
          const targetYear = result.lunarDate.year + targetAge - 1;
          const yearZhi = branches[(((targetYear - 4) % 12) + 12) % 12];
          appState.setYunyeonYearZhi(yearZhi);
          const yyPalace = result.palaces.findIndex((p) => p.branch && p.branch === yearZhi);
          if (yyPalace >= 0) appState.setYunyeonPalaceIndex(yyPalace);
          reRender();
          return;
        }
      } else if (appState.getSohanAge() !== -1) {
        appState.setSohanAge(-1);
        appState.setSohanPalaceIndex(-1);
        reRender();
        return;
      }
    }
  }

  // 유월 모드
  if (appState.currentLuckMode === 'yuwol' && result) {
    if (!appState.isDaehanLocked() || (!appState.isYunyeonLocked() && !appState.isSohanLocked()))
      return;

    if (!appState.isYuwolLocked()) {
      let activeYearAge = appState.getYunyeonAge();
      if (activeYearAge < 0) activeYearAge = appState.getSohanAge();

      if (activeYearAge > 0) {
        const targetYear = result.lunarDate.year + activeYearAge - 1;
        const targetYearZhiIdx = (((targetYear - 4) % 12) + 12) % 12;
        const yuwolPalaces = ziWeiDouShu.getYuwolPalaces(targetYearZhiIdx, result.inGungOffset);
        const matchedMonthObj = yuwolPalaces.find((m) => m.idx === position);

        if (matchedMonthObj) {
          if (
            appState.getYuwolAge() !== matchedMonthObj.month ||
            appState.getYuwolPalaceIndex() !== position
          ) {
            appState.setYuwolAge(matchedMonthObj.month);
            appState.setYuwolPalaceIndex(position);
            reRender();
            return;
          }
        } else if (appState.getYuwolAge() !== -1) {
          appState.setYuwolAge(-1);
          appState.setYuwolPalaceIndex(-1);
          reRender();
          return;
        }
      }
    }
  }

  // 4. Select Target Palace
  const targetPalace = document.querySelector(`.palace[data-position="${position}"]`);
  if (targetPalace) targetPalace.classList.add('selected');

  // 5. Get Samhap Group and Daegung (using correct fixed groups)
  const samhapGroup = getSamhapGroup(position);
  const daegung = getDaegung(position);

  // 6. Apply Samhap highlights (exclude the clicked palace)
  samhapGroup.forEach((pos) => {
    if (pos !== position) {
      document.querySelector(`.palace[data-position="${pos}"]`)?.classList.add('samhap');
    }
  });

  // 7. Apply Daegung highlight
  if (daegung !== null) {
    document.querySelector(`.palace[data-position="${daegung}"]`)?.classList.add('daegung');
  }

  drawSambangsajeong(position, samhapGroup, daegung, 0);

  // 8. 부모 창으로 위임할 궁(Palace) 정보 넘기기 (본궁 + 대궁)
  broadcastPalaceInfo(position, daegung);
}

// ========== 부모 창(Iframe 호스트)으로 데이터 넘기기 ==========
// 항상 명궁 데이터를 전송 (클릭한 궁과 무관하게 명궁 고정)
function broadcastPalaceInfo(position, daegungIdx) {
  if (!appState.currentResult || !appState.currentResult.palaces) return;
  const mingIdx = appState.currentResult.mingIdx;
  const p = appState.currentResult.palaces[mingIdx];
  if (!p) return;

  const getJusung = (palace) => {
    if (!palace || !palace.stars) return [];
    return palace.stars.filter((s) => s.type === 'jusung').map((s) => s.name);
  };

  const mainStars = getJusung(p);

  // 명궁의 대궁 주성 정보 추출 (차성안궁 용도)
  let daegungStars = [];
  const mingDaegung = getDaegung(mingIdx);
  if (mingDaegung !== null && mingDaegung !== undefined) {
    daegungStars = getJusung(appState.currentResult.palaces[mingDaegung]);
  }

  const payload = {
    gungName: p.name,
    jiji: p.branch,
    mainStars: mainStars,
    daegungStars: daegungStars,
  };

  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      {
        type: 'MINGBAN_RENDERED',
        payload: payload,
      },
      '*'
    );
    // 실제 콘텐츠 높이 전송 → iframe 공백 제거
    requestAnimationFrame(() => {
      const h = document.documentElement.scrollHeight || document.body.scrollHeight;
      window.parent.postMessage({ type: 'IFRAME_HEIGHT', height: h }, '*');
    });
  }
}

// ========== SVG 삼방사정 선 그리기 (Robust Version) ==========
function drawSambangsajeong(mainPos, samhapGroup, daegung, attempt = 0) {
  const svg = document.getElementById('centerSvg');
  if (!svg) return;

  // Clear previous drawings first to avoid duplication
  svg.innerHTML = '';

  const centerArea = document.querySelector('.center-area');
  if (!centerArea) {
    // If center-area is missing, try again shortly (up to 5 times)
    if (attempt < 5) {
      setTimeout(() => drawSambangsajeong(mainPos, samhapGroup, daegung, attempt + 1), 50);
    }
    return;
  }

  const rect = centerArea.getBoundingClientRect();
  // CSS zoom 보정: getBoundingClientRect()는 zoom된 값을 반환하므로
  // SVG 좌표계(CSS 기준)와 맞추기 위해 zoom으로 나눔
  const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
  let width = rect.width / zoom;
  let height = rect.height / zoom;

  // Retry if dimensions are zero (layout not ready)
  if ((width === 0 || height === 0) && attempt < 5) {
    setTimeout(() => drawSambangsajeong(mainPos, samhapGroup, daegung, attempt + 1), 50);
    return;
  }

  // Fallback if still zero after retries (e.g. hidden element)
  if (width === 0 || height === 0) {
    // Approximate size based on typical palace grid (300x300 center)
    const grid = document.querySelector('.palace-grid');
    if (grid) {
      const gridRect = grid.getBoundingClientRect();
      width = (gridRect.width / 4) * 2;
      height = (gridRect.height / 4) * 2;
    } else {
      // Last resort fallback
      width = 300;
      height = 300;
    }
  }

  // Mini-map coordinate mapping
  function getMiniCoords(pos) {
    let x, y;
    /*
        Grid Layout (CCW Rotated):
        Row 1: 5, 6, 7, 8
        Row 2: 4, [Center], 9
        Row 3: 3, [Center], 10
        Row 4: 2, 1, 0, 11
        */
    switch (pos) {
      case 5:
        x = 0;
        y = 0;
        break; // Top-Left
      case 6:
        x = 0.25;
        y = 0;
        break; // Top-Center-Left
      case 7:
        x = 0.75;
        y = 0;
        break; // Top-Center-Right
      case 8:
        x = 1;
        y = 0;
        break; // Top-Right

      case 9:
        x = 1;
        y = 0.25;
        break; // Right-Top
      case 10:
        x = 1;
        y = 0.75;
        break; // Right-Bottom

      case 11:
        x = 1;
        y = 1;
        break; // Bottom-Right
      case 0:
        x = 0.75;
        y = 1;
        break; // Bottom-Center-Right
      case 1:
        x = 0.25;
        y = 1;
        break; // Bottom-Center-Left
      case 2:
        x = 0;
        y = 1;
        break; // Bottom-Left

      case 3:
        x = 0;
        y = 0.75;
        break; // Left-Bottom
      case 4:
        x = 0;
        y = 0.25;
        break; // Left-Top

      default:
        x = 0.5;
        y = 0.5;
        break;
    }

    // Apply padding to keep lines inside center area
    const p = 15;
    const drawW = width - 2 * p;
    const drawH = height - 2 * p;

    return {
      x: p + x * drawW,
      y: p + y * drawH,
    };
  }

  // Draw Samhap Triangle (3 palaces)
  if (samhapGroup && samhapGroup.length === 3) {
    const coords = samhapGroup.map((pos) => getMiniCoords(pos));
    const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${coords[0].x} ${coords[0].y} L ${coords[1].x} ${coords[1].y} L ${coords[2].x} ${coords[2].y} Z`;
    triangle.setAttribute('d', d);
    triangle.classList.add('arrow-path', 'triangle');
    svg.appendChild(triangle);
  }

  // Draw Daegung Line (main palace to opposite)
  if (daegung !== null) {
    const mainCoord = getMiniCoords(mainPos);
    const daegungCoord = getMiniCoords(daegung);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${mainCoord.x} ${mainCoord.y} L ${daegungCoord.x} ${daegungCoord.y}`;
    line.setAttribute('d', d);
    line.classList.add('arrow-path', 'opposite');
    svg.appendChild(line);
  }
}

function handleCalculate() {
  // 1. 라이브러리 로드 확인
  if (!timeCorrector || !lunarConverter || !ziWeiDouShu) {
    showToast('필수 라이브러리가 로드되지 않았습니다. 페이지를 새로고침 해주세요.');
    return;
  }

  try {
    const urlParams = new URLSearchParams(window.location.search);

    const nameInput = document.getElementById('nameInput');
    let name = urlParams.has('name') ? urlParams.get('name') : '';
    if (!name) name = nameInput && nameInput.value ? nameInput.value : '무명';

    const getVal = (id, paramName) => {
      // 1순위: URL 파라미터 확인. 없거나 유효하지 않으면 2순위로 넘어감
      if (urlParams.has(paramName)) {
        const paramVal = parseInt(urlParams.get(paramName));
        if (!isNaN(paramVal)) return paramVal;
      }

      // 2순위: DOM element 값 확인
      const el = document.getElementById(id);
      if (el && el.value) {
        const val = parseInt(el.value);
        return isNaN(val) ? 0 : val;
      }

      return 0;
    };

    const year = getVal('yearInput', 'year');
    const month = getVal('monthInput', 'month');
    const day = getVal('dayInput', 'day');
    const hour = getVal('hourInput', 'hour');
    const minute = getVal('minuteInput', 'minute');

    let gender = urlParams.has('gender') ? urlParams.get('gender') : '';
    // M/F shorthand normalisation
    if (gender === 'M') gender = 'male';
    if (gender === 'F') gender = 'female';
    if (!gender) {
      gender = 'male';
      const genderEl = document.querySelector('input[name="gender"]:checked');
      if (genderEl) gender = genderEl.value;
    }

    // Accept both 'calendarType' and 'calendar' as aliases
    let calendarType = urlParams.get('calendarType') || urlParams.get('calendar') || '';
    if (!calendarType) {
      calendarType = 'solar';
      const calEl = document.querySelector('input[name="calendarType"]:checked');
      if (calEl) calendarType = calEl.value;
    }

    // Accept both 'isLeap' and 'leap' as aliases
    let isLeapInput = false;
    if (urlParams.has('isLeap')) {
      isLeapInput = urlParams.get('isLeap') === 'true';
    } else if (urlParams.has('leap')) {
      isLeapInput = urlParams.get('leap') === 'true';
    } else {
      const leapEl = document.getElementById('leapMonth');
      if (leapEl && leapEl.checked !== undefined) isLeapInput = leapEl.checked;
    }

    if (!year || !month || !day) {
      console.error('[handleCalculate] Inputs invalid:', { year, month, day });
      showToast('연/월/일을 올바르게 입력해 주세요.');
      return;
    }

    let finalDate; // 화면 표시용 양력 날짜

    // ===== 음력/양력 분기: finalDate(양력) 결정 =====
    // city: URL 파라미터 최우선. cityInput DOM은 로컬 폼용으로만 사용
    const cityParam = urlParams.get('city');
    const cityInput = document.getElementById('cityInput');
    const city = cityParam || (cityInput && cityInput.value) || '서울';
    // cityInput이 있으면 URL 파라미터에 맞게 동기화
    if (cityInput && cityParam) cityInput.value = cityParam;

    if (calendarType === 'solar') {
      // ── 양력 입력 ──
      finalDate = new Date(year, month - 1, day, hour, minute);
    } else {
      // ── 음력 입력: lunarMonthToSolarRange로 양력 변환 ──
      // leapMonth(year)로 실제 윤달 여부 검증 (해당 연도의 윤달 월이 month와 일치해야 윤달)
      const actualLeapMonth = lunarConverter.leapMonth(year);
      if (isLeapInput && actualLeapMonth !== month) {
        isLeapInput = false; // 선택한 달이 실제 윤달이 아님 → 일반 음력으로 처리
      }
      const solarBase = lunarConverter.lunarToSolarDate(year, month, day, isLeapInput);
      if (!solarBase) throw new Error('음력→양력 변환 실패');
      finalDate = new Date(solarBase.getFullYear(), solarBase.getMonth(), solarBase.getDate(), hour, minute);
    }

    // ===== 진태양시 계산 (항상 양력 finalDate 기준) =====
    const trueSolarTimeResult = timeCorrector.calculateTrueSolarTime(finalDate, city);
    const trueSolarTime = trueSolarTimeResult.adjustedTime;

    // 진태양시 기준으로 12시진 계산
    const trueSolarHour = trueSolarTime.getHours();
    const trueSolarMinute = trueSolarTime.getMinutes();
    const shichenIndex = Math.floor((trueSolarHour * 60 + trueSolarMinute + 60) / 120) % 12;

    // 자시(子時) 처리: 진태양시 기준 23:00 이후(자시 시작)는 무조건 다음날 날짜로 취급
    // 야자시/조자시 구분 없이, 23:00 이상이면 항상 +1일
    let effectiveDate = new Date(trueSolarTime.getFullYear(), trueSolarTime.getMonth(), trueSolarTime.getDate());
    const isJasiApplied = trueSolarHour >= 23;
    if (isJasiApplied) {
      effectiveDate.setDate(effectiveDate.getDate() + 1);
    }

    // 양력/음력 입력 모두 명반 계산용 음력일은 자시 보정된 effectiveDate 기준으로 통일한다.
    // 사용자가 입력한 원본 날짜는 result.inputBirth에 별도로 보존한다.
    const lunarDate = lunarConverter.solarToLunar(effectiveDate);
    if (!lunarDate) throw new Error('음력 변환 지원 범위 밖의 날짜입니다');
    lunarDate.hour = shichenIndex;

    // 사주 계산은 기준을 분리한다.
    // - 년주/월주/대운 절입 판정: 입력을 양력화한 시계시(finalDate)
    // - 일주/시주: 진태양시 자시 보정이 적용된 sajuDate
    const sajuDate = new Date(
      effectiveDate.getFullYear(),
      effectiveDate.getMonth(),
      effectiveDate.getDate(),
      trueSolarHour,
      trueSolarMinute
    );
    const solarTermDate = finalDate;
    const termSaju = lunarConverter.getSaju(solarTermDate, shichenIndex);
    const dayHourSaju = lunarConverter.getSaju(sajuDate, shichenIndex);
    const saju = {
      year: termSaju.year,
      month: termSaju.month,
      day: dayHourSaju.day,
      hour: dayHourSaju.hour
    };
    updateSajuTable(saju);

    const result = ziWeiDouShu.calculate(lunarDate, saju, gender);
    result.name = name;
    result.gender = gender;
    result.finalDate = finalDate;
    result.lunarDate = lunarDate; // ← 반드시 여기서 저장 (유월 렌더링에 필요)
    result.inputTime = { hour, minute }; // 사용자가 입력한 원래 시간
    result.inputBirth = { year, month, day, calendarType, isLeap: isLeapInput };
    result.city = city; // 출생지역 정보 추가
    result.trueSolarTime = trueSolarTime; // 진태양시 정보 저장
    result.trueSolarTimeResult = trueSolarTimeResult; // 보정 상세 정보 저장
    result.isJasiApplied = isJasiApplied; // 표시/검증용: 자시 날짜 보정 발생 여부
    result.sajuDate = sajuDate; // 일주/시주 및 자시 날짜 보정 기준일
    result.solarTermDate = solarTermDate; // 년주/월주/대운 절입 판정 기준일
    result.saju = saju; // Renderer.js에서 동일한 사주 객체를 사용하도록 전달

    const daeunList = lunarConverter.getDaeun(saju, gender, solarTermDate);
    renderDaeun(daeunList);

    appState.currentResult = result;

    const currentYear = new Date().getFullYear();
    const branches = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
    appState.setYunyeonYearZhi(branches[(currentYear - 4) % 12]);

    renderer.renderChart(result);

    const aiSection = document.getElementById('aiCopySection');
    if (aiSection) aiSection.style.display = 'block';

    if (appState.currentLuckMode !== 'daehan') {
      setTimeout(() => selectPalace(result.mingIdx), 100);
    }
  } catch (e) {
    console.error('Calculation Error:', e);
    showToast('명반 계산 중 오류가 발생했습니다: ' + e.message);
  }
}
function updateSajuTable(saju) {
  if (!saju) {
    // Clear if null
    // document.getElementById('sajuTable')....
    return;
  }
  // This is called from handleCalculate, but sajuTable is inside center-area.
  // We should call verify/render center area first or update data after render.
  // Ideally, pass saju to renderChart.
}

function renderDaeun(daeunList) {
  // Similarly, daeunList is inside center-area.
}

// ========== AI 해석용 JSON 빌드 ==========
function buildAIInterpretationJSON() {
  const result = appState.currentResult;
  if (!result || !result.palaces) return null;

  const JUSUNG = ['자미', '천기', '태양', '무곡', '천동', '염정', '천부', '태음', '탐랑', '거문', '천상', '천량', '칠살', '파군'];
  const GILSUNG = ['천괴', '천월', '좌보', '우필', '문창', '문곡', '녹존'];
  const SALSUNG = ['경양', '타라', '지공', '지겁', '화성', '영성'];

  function unique(arr) {
    return [...new Set(arr.filter(Boolean))];
  }

  function extractStars(palace) {
    if (!palace || !palace.stars) {
      return { jusung: [], sahwa: [], gilsung: [], salsung: [], cheonma: false };
    }
    const jusung = [], sahwa = [], gilsung = [], salsung = [];
    let cheonma = false;
    palace.stars.forEach((s) => {
      if (JUSUNG.includes(s.name) && s.type === 'jusung') {
        jusung.push(s.name);
        if (s.sahwa) sahwa.push(s.name + '화' + s.sahwa);
      }
      if (GILSUNG.includes(s.name) && s.type === 'gilsung') gilsung.push(s.name);
      if (SALSUNG.includes(s.name) && s.type === 'salsung') salsung.push(s.name);
      if (s.name === '천마') cheonma = true;
    });
    return { jusung: unique(jusung), sahwa: unique(sahwa), gilsung: unique(gilsung), salsung: unique(salsung), cheonma };
  }

  const gungData = {};
  const palaceOrder = ['명궁', '형제', '부처', '자녀', '재백', '질액', '천이', '노복', '관록', '전택', '복덕', '부모'];
  const orderedPalaces = palaceOrder
    .map((name) => result.palaces.find((p) => p?.name === name))
    .map((palace) => palace ? { palace, idx: result.palaces.indexOf(palace) } : null)
    .filter(Boolean);

  orderedPalaces.forEach(({ palace, idx: i }) => {
    if (!palace || !palace.name) return;

    const extracted = extractStars(palace);
    const isGongGung = extracted.jusung.length === 0;

    // 본궁 데이터
    const bonGung = {
      주성: extracted.jusung,
      사화: extracted.sahwa,
      길성: extracted.gilsung,
      살성: extracted.salsung,
      천마: extracted.cheonma,
    };

    // 공궁 예외: 대궁 주성만 차성안궁_주성으로 추가
    if (isGongGung) {
      const daegungIdx = getDaegung(i);
      if (daegungIdx !== null) {
        const dgStars = extractStars(result.palaces[daegungIdx]);
        bonGung.차성안궁_주성 = dgStars.jusung;
      }
    }

    // 삼방사정: 길성/살성/천마만 합산 (주성·궁 이름 표시 없음)
    const sambangGilsung = [];
    const sambangSalsung = [];
    let sambangCheonma = false;

    const samhap = getSamhapGroup(i).filter((idx) => idx !== i);
    const daegungIdx = getDaegung(i);
    const relatedIdxs = daegungIdx !== null ? [...samhap, daegungIdx] : [...samhap];

    relatedIdxs.forEach((idx) => {
      const s = extractStars(result.palaces[idx]);
      sambangGilsung.push(...s.gilsung);
      sambangSalsung.push(...s.salsung);
      if (s.cheonma) sambangCheonma = true;
    });

    // 마무리 조건 판단용 살성 합산 수 계산
    const totalSalsung = unique([...extracted.salsung, ...sambangSalsung]);

    const displayName = isGongGung
      ? (palace.name.endsWith('궁') ? palace.name : palace.name + '궁') + '(공궁)'
      : (palace.name.endsWith('궁') ? palace.name : palace.name + '궁');

    gungData[displayName] = {
      본궁: bonGung,
      삼방사정: {
        길성: unique(sambangGilsung),
        살성: unique(sambangSalsung),
        천마: sambangCheonma,
      },
      살성_합산수: totalSalsung.length,
    };
  });

  const fd = result.finalDate;
  const inputBirth = result.inputBirth || {};
  const calType =
    inputBirth.calendarType ||
    new URLSearchParams(window.location.search).get('calendarType') ||
    new URLSearchParams(window.location.search).get('calendar') ||
    'solar';
  const dateYear = calType === 'lunar' ? inputBirth.year : fd.getFullYear();
  const dateMonth = calType === 'lunar' ? inputBirth.month : fd.getMonth() + 1;
  const dateDay = calType === 'lunar' ? inputBirth.day : fd.getDate();
  const leapText = calType === 'lunar' && inputBirth.isLeap ? ' 윤달' : '';
  const dateStr = dateYear + '-' +
    String(dateMonth).padStart(2, '0') + '-' +
    String(dateDay).padStart(2, '0') + ' ' +
    String(result.inputTime?.hour ?? fd.getHours()).padStart(2, '0') + ':' +
    String(result.inputTime?.minute ?? fd.getMinutes()).padStart(2, '0') +
    (calType === 'lunar' ? ` (음력${leapText})` : ' (양력)');

  return {
    명반_정보: {
      이름: result.name || '무명',
      생년월일시: dateStr,
      성별: result.gender === 'male' ? '남' : '여',
    },
    '12궁': gungData,
  };
}

function buildAIInterpretationPrompt(json) {
  const jsonText = JSON.stringify(json, null, 2);
  return [
    '당신은 자미두수 전문 역술가입니다.',
    '',
    '[해석 규칙]',
    '- 선천 명반 기준, 친근하고 부드러운 존댓말 사용',
    '- 각 궁을 3단락으로 해석 (단락당 3줄 이내, 4단락 이상 금지)',
    '- 1단락: 본궁 주성의 성질로 기본 성향',
    '- 2단락: 삼방사정의 길성·살성·천마가 본궁에 미치는 영향',
    '- 3단락: 종합 판단',
    '- 반드시 별 이름을 근거로 언급하며 서술할 것',
    '- 본궁과 삼방사정 별을 하나의 흐름으로 종합 서술할 것 (별 종류별로 따로 분석하지 말 것)',
    '- 살성은 나쁜 일이 아니라 기질·성향으로 풀이, 주성 장점 뒤에 배치',
    '- 공궁은 공궁임을 밝히고 차성안궁_주성을 해석 근거로 사용',
    '- JSON에 없는 별은 절대 언급하지 말 것',
    '- 천마가 true이면 움직임·변화·활동성의 의미로 문맥에 맞게 반영',
    '',
    '[궁별 서술 관점]',
    '- 명궁: 본인의 기질·성향·삶의 방식으로 서술',
    '- 형제궁: 형제의 성향과 나와 형제의 관계성, 친구·지인과의 인연으로 서술',
    '- 부처궁: 이러한 배우자·연인과 인연이 되기 쉽고, 관계의 흐름은 이렇다로 서술',
    '- 자녀궁: 자녀의 성향·스타일과 자녀와의 관계성으로 서술',
    '- 재백궁: 재물을 버는 방식과 재물 흐름으로 서술',
    '- 질액궁: 체질·건강 성향과 컨디션 관리 흐름으로 서술',
    '- 천이궁: 외부 활동·이동·타지에서의 흐름으로 서술',
    '- 노복궁: 아랫사람·후배·직원과의 관계성 중심으로 서술',
    '- 관록궁: 직업·커리어의 방향과 흐름으로 서술',
    '- 전택궁: 어떤 주거 환경과 인연이 되는지, 어떻게 꾸미고 사는 스타일인지로 서술',
    '- 복덕궁: 내면의 즐거움·정신적 만족을 찾는 방식으로 서술',
    '- 부모궁: 부모님의 성향과 나와 부모님의 관계성으로 서술',
    '',
    '[마무리 조건]',
    '- 살성_합산수 3 이하: 자연스럽게 긍정 서술로 마무리',
    '- 살성_합산수 4 이상 + 일반 궁: "각 시기의 운 흐름에 따라 나타나는 변화가 다르니 운의 흐름도 꼭 참고해야 합니다."로 마무리',
    '- 살성_합산수 4 이상 + 부처궁·형제궁·노복궁: "상대방의 명반도 함께 확인해야 더 정확하게 파악할 수 있어요."로 마무리 (위 조건보다 우선)',
    '',
    '[출력 형식]',
    '- 제목: 자미두수 선천 12궁 해석',
    '- 이름·생년월일시·성별 확인 문장',
    '- 명궁→형제궁→부처궁→자녀궁→재백궁→질액궁→천이궁→노복궁→관록궁→전택궁→복덕궁→부모궁 순서로 12궁 모두 해석',
    '- 각 궁 사이에 구분선(──────────)을 넣어 읽기 쉽게 구분할 것',
    '- 각 궁 제목 바로 아래에 해당 궁에 존재하는 별만 괄호 없이 간략히 표시 (예: 본궁 - 주성: 자미, 천상 / 길성: 좌보 / 삼방사정 - 살성: 지겁, 화성 / 천마). 반드시 "본궁"과 "삼방사정"으로 표기 (별 단어 붙이지 말 것). 천마는 이름만 기재. 해당하는 별이 없으면 모두 생략할 것',
    '- 별 확인 줄 다음에 3단락 해석문 작성',
    '- 사화(화록·화권·화과·화기)가 있으면 해당 주성의 성질이 강화 또는 변형되는 것으로 해석에 반영할 것',
    '',
    '[명반 데이터]',
    '```json',
    jsonText,
    '```',
    '',
    '위 명반 데이터로 자미두수 12궁 해석문을 작성하세요.',
  ].join('\n');
}

// ========== 클립보드 복사 ==========
async function copyAIJSON() {
  const json = buildAIInterpretationJSON();
  if (!json) {
    showToast('명반을 먼저 생성해 주세요.');
    return;
  }

  const text = buildAIInterpretationPrompt(json);
  let success = false;

  try {
    await navigator.clipboard.writeText(text);
    success = true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    document.body.appendChild(ta);
    ta.select();
    success = document.execCommand('copy');
    document.body.removeChild(ta);
  }

  const btn = document.getElementById('aiCopyBtn');
  if (btn) {
    if (success) {
      btn.textContent = '복사됨 ✓';
      btn.classList.add('copied');
    } else {
      btn.textContent = '복사 실패';
    }
    setTimeout(() => {
      btn.textContent = '명반 정보 복사';
      btn.classList.remove('copied');
    }, 2000);
  }
}

async function copyRawJSON() {
  const json = buildAIInterpretationJSON();
  if (!json) { showToast('명반을 먼저 생성해 주세요.'); return; }

  const text = JSON.stringify(json, null, 2);
  let success = false;
  try {
    await navigator.clipboard.writeText(text);
    success = true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    document.body.appendChild(ta);
    ta.select();
    success = document.execCommand('copy');
    document.body.removeChild(ta);
  }

  const btn = document.getElementById('jsonCopyBtn');
  if (btn) {
    btn.textContent = success ? '복사됨 ✓' : '복사 실패';
    if (success) btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'JSON 복사'; btn.classList.remove('copied'); }, 2000);
  }
}
window.copyRawJSON = copyRawJSON;

// ========== Toast Notification Utility ==========
function showToast(message, anchorElement = null) {
  let toast = document.getElementById('jamidusuToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'jamidusuToast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }
  toast.textContent = message;

  // Temporarily disable transitions to prevent the initial jump when changing top/left
  toast.style.transition = 'none';

  // Reset any inline styles first
  toast.style.top = '';
  toast.style.left = '';
  toast.style.transform = '';

  // 중앙영역 모드 버튼 위로 토스트 표시
  const modeControls = document.querySelector('.center-mode-controls');
  if (modeControls) {
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const rect = modeControls.getBoundingClientRect();
    const top = rect.top / zoom - 50;
    const left = rect.left / zoom + rect.width / zoom / 2;

    toast.style.top = `${top}px`;
    toast.style.left = `${left}px`;
    toast.style.transform = `translate(-50%, 15px)`;
  } else if (anchorElement) {
    const rect = anchorElement.getBoundingClientRect();
    const top = rect.top - 80;
    const left = rect.left + rect.width / 2;

    toast.style.top = `${top}px`;
    toast.style.left = `${left}px`;
    toast.style.transform = `translate(-50%, 15px)`;
  } else {
    // Default top-center positioning
    toast.style.top = '40px';
    toast.style.left = '50%';
    toast.style.transform = 'translate(-50%, -20px)';
  }

  toast.classList.remove('show');

  // Trigger reflow to apply the non-transitioned start positions immediately
  void toast.offsetWidth;

  // Re-enable CSS transitions by removing the inline style
  toast.style.transition = '';

  // Add the show class
  toast.classList.add('show');

  // Update transform for the 'show' state to trigger the animation
  if (anchorElement) {
    toast.style.transform = `translate(-50%, 0)`;
  } else {
    toast.style.transform = `translate(-50%, 0)`;
  }

  if (toast.hideTimeout) clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000); // 노출 시간을 3초로 연장
}

// ========== 외부 호출 허용 (Global Export) ==========
window.handleCalculate = handleCalculate;
window.copyAIJSON = copyAIJSON;
