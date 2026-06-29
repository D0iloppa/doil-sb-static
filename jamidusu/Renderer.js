
const PALACE_NAMES_CCW = [
  '명궁',
  '형제',
  '부처',
  '자녀',
  '재백',
  '질액',
  '천이',
  '노복',
  '관록',
  '전택',
  '복덕',
  '부모',
];

class Renderer {
  constructor() {
    this.ctx = null;
  }

  renderChart(result, renderOptions) {
    if (!result) return;

    this.renderOptions = renderOptions || null;
    appState.currentResult = result; // Store for refresh

    this.ctx = this._getCurrentContext(result);
    const isKorean = appState.isKorean;

    // 1. Calculate Daehan Ranges
    const gIdx = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'].indexOf(
      result.lunarYearGan
    );
    const isYangYear = gIdx % 2 === 0;
    const isMale = result.gender === 'male';
    const isClockwise = (isYangYear && isMale) || (!isYangYear && !isMale);
    const direction = isClockwise ? 1 : -1;

    const daehanRanges = {};
    let startAge = result.bureauNum;
    for (let i = 0; i < 12; i++) {
      // ziWeiDouShu instance is global in main script, so we access it via window or passed in?
      // Ideally should be passed, but for now assuming global like before or importing?
      // The original code used global `ziWeiDouShu`. We should probably pass it or assume it's available.
      // Let's rely on window.ziWeiDouShu for now as it's not in a module yet.
      const currentIdx = window.ziWeiDouShu.norm(result.mingIdx + i * direction);
      daehanRanges[currentIdx] = { min: startAge, max: startAge + 9, step: i };
      startAge += 10;
    }

    // 1.5 Daehan Stars
    let daehanStars = [];
    let daehanSahwaMap = {};
    if (
      this.ctx.daehanIdx >= 0 &&
      (appState.currentLuckMode === 'daehan' ||
        appState.currentLuckMode === 'yunyeon' ||
        appState.currentLuckMode === 'sohan' ||
        appState.currentLuckMode === 'yuwol')
    ) {
      if (this.ctx.daehanGan && this.ctx.daehanZhi) {
        daehanStars = window.ziWeiDouShu.getDaehanStars(this.ctx.daehanGan, this.ctx.daehanZhi);

        // Daehan Sahwa
        const sahwaStarsForGan = this.ctx.daehanGan
          ? window.ziWeiDouShu.sahwaMap[this.ctx.daehanGan]
          : null;
        if (sahwaStarsForGan) {
          const sahwaTypes = ['록', '권', '과', '기'];
          result.palaces.forEach((palace, palaceIdx) => {
            palace.stars.forEach((star) => {
              const sIdx = sahwaStarsForGan.indexOf(star.name);
              if (sIdx >= 0) {
                if (!daehanSahwaMap[palaceIdx]) daehanSahwaMap[palaceIdx] = [];
                daehanSahwaMap[palaceIdx].push({
                  starName: star.name,
                  sahwaType: sahwaTypes[sIdx],
                });
              }
            });
            const dsInPalace = daehanStars.filter((ds) => ds.palaceIdx === palaceIdx);
            dsInPalace.forEach((dStar) => {
              const sName = dStar.name.replace('대한 ', '');
              const sIdx = sahwaStarsForGan.indexOf(sName);
              if (sIdx >= 0) {
                if (!daehanSahwaMap[palaceIdx]) daehanSahwaMap[palaceIdx] = [];
                daehanSahwaMap[palaceIdx].push({
                  starName: dStar.name,
                  sahwaType: sahwaTypes[sIdx],
                });
              }
            });
          });
        }
      }
    }

    // 2. Clear Existing
    const contentDiv = document.getElementById('chartContent');
    if (!contentDiv) return;
    contentDiv.innerHTML = '';

    // 3. Render 12 Palaces
    result.palaces.forEach((data, jsIdx) => {
      const palaceDiv = this._renderPalace(
        data,
        jsIdx,
        result,
        daehanRanges,
        daehanStars,
        daehanSahwaMap,
        direction
      );
      contentDiv.appendChild(palaceDiv);
    });

    // 4. Center Area
    const centerAreaDiv = document.createElement('div');
    centerAreaDiv.className = 'center-area';
    contentDiv.appendChild(centerAreaDiv);
    this._renderCenterArea(result);

    // 5. age-btn-row → footer-center 수직 정렬 (DOM 렌더 완료 후)
    requestAnimationFrame(() => this._alignAgeBtnRowsWithFooterCenters(contentDiv));
  }

  /**
   * 각 궁의 .age-btn-row를 .footer-center 수직 중앙에 맞게 translateX 이동
   * - footer-center는 space-between으로 소성↔간지 여유 공간 중앙에 위치
   * - age-btn-row는 기본적으로 궁 전체 너비 센터 → 두 값이 다를 수 있음
   * - DOM 측정 후 오프셋만큼 translateX 적용
   */
  _alignAgeBtnRowsWithFooterCenters(chartContent) {
    if (!chartContent) return;
    const palaces = chartContent.querySelectorAll('.palace');
    palaces.forEach((palace) => {
      const ageBtnRow = palace.querySelector('.age-btn-row');
      const footerCenter = palace.querySelector('.footer-center');
      if (!ageBtnRow || !footerCenter) return;

      const palaceRect = palace.getBoundingClientRect();
      const fcRect = footerCenter.getBoundingClientRect();
      const abRect = ageBtnRow.getBoundingClientRect();

      // footer-center 수평 중앙 X (궁 기준)
      const fcCenterX = fcRect.left + fcRect.width / 2 - palaceRect.left;
      // age-btn-row 수평 중앙 X (궁 기준)
      const abCenterX = abRect.left + abRect.width / 2 - palaceRect.left;

      const offset = fcCenterX - abCenterX;
      if (Math.abs(offset) > 0.5) {
        ageBtnRow.style.transform = `translateX(${offset}px)`;
      }
    });
  }

  _renderPalace(data, jsIdx, result, daehanRanges, daehanStars, daehanSahwaMap, direction) {
    const isKorean = appState.isKorean;
    const palaceDiv = document.createElement('div');
    palaceDiv.className = 'palace';
    palaceDiv.dataset.position = jsIdx;

    if (daehanRanges[jsIdx]) {
      palaceDiv.dataset.daehanStep = daehanRanges[jsIdx].step;
    }

    if (appState.selectedPalaceIndex === jsIdx) palaceDiv.classList.add('selected');

    const content = document.createElement('div');
    content.className = 'palace-content';

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'palace-header';

    const pName = isKorean ? data.name : palaceNameMap[data.name] || data.name;
    header.appendChild(this._createLabel(pName, 'basic'));

    // Daehan Name
    if (
      (appState.currentLuckMode === 'daehan' ||
        appState.currentLuckMode === 'yunyeon' ||
        appState.currentLuckMode === 'sohan' ||
        appState.currentLuckMode === 'yuwol') &&
      this.ctx.daehanIdx >= 0
    ) {
      const offset = (this.ctx.daehanIdx - jsIdx + 12) % 12;
      const mName = PALACE_NAMES_CCW[offset];
      const dName = isKorean ? `대한${mName}` : `大限${palaceNameMap[mName] || mName}`;
      header.appendChild(this._createLabel(dName, 'daehan'));
    }

    // Yunyeon Name
    if (this.ctx.yunyeonIdx >= 0) {
      const offset = (this.ctx.yunyeonIdx - jsIdx + 12) % 12;
      const mName = PALACE_NAMES_CCW[offset];

      let shouldRender = false;
      if (appState.currentLuckMode === 'yunyeon') {
        shouldRender = true; // 유년 모드에서는 무조건 렌더
      } else if (appState.currentLuckMode === 'yuwol' && appState.isYunyeonLocked()) {
        shouldRender = true; // 유년에서 진입한 유월 모드에서도 무조건 렌더
      }

      if (shouldRender) {
        const yName = isKorean ? `유년${mName}` : `流年${palaceNameMap[mName] || mName}`;
        header.appendChild(this._createLabel(yName, 'yunyeon'));
      }
    }

    // Sohan Name
    if (this.ctx.sohanIdx >= 0) {
      const offset = (this.ctx.sohanIdx - jsIdx + 12) % 12;
      const mName = PALACE_NAMES_CCW[offset];

      let shouldRender = false;
      if (appState.currentLuckMode === 'sohan') {
        shouldRender = true; // 소한 모드에서는 무조건 렌더
      } else if (appState.currentLuckMode === 'yuwol' && appState.isSohanLocked()) {
        shouldRender = true; // 소한에서 진입한 유월 모드에서도 무조건 렌더
      }

      if (shouldRender) {
        const sName = isKorean ? `소한${mName}` : `小限${palaceNameMap[mName] || mName}`;
        header.appendChild(this._createLabel(sName, 'sohan'));
      }
    }

    // Yuwol Name
    if (appState.currentLuckMode === 'yuwol' && this.ctx.yuwolIdx >= 0) {
      const offset = (this.ctx.yuwolIdx - jsIdx + 12) % 12;
      const mName = PALACE_NAMES_CCW[offset];
      const ywName = isKorean ? `유월${mName}` : `流月${palaceNameMap[mName] || mName}`;
      const labelEl = this._createLabel(ywName, 'yuwol');
      header.appendChild(labelEl);
    }

    content.appendChild(header);

    // --- Body (Stars) ---
    const body = document.createElement('div');
    body.className = 'palace-body';

    const allStarElements = [];

    // 1. Natal
    const starsMap = {
      jusung: [],
      gilsung: [],
      salsung: [],
      special: [],
      zabseong: [],
    };
    const specialStars = ['록존', '녹존', '천마', '홍란', '천희'];

    data.stars.forEach((s) => {
      const sName = (s.name || '').trim();

      // 간략 명반 모드 잡성 필터 (특별한 길성이 먼저 걸러지기 전에 잡성인 경우 적용)
      // * 천요, 천형 등은 specialStars에 포함되지 않아 여기서 걸러질 수 있음
      if (this.renderOptions?.mobileSimple && this.renderOptions?.zabseongWhitelist) {
        // gilsung, salsung 등도 잡성급으로 필터링하고 싶지 않다면 type이 zabseong이거나 특정 리스트에 없는 것들을 제한
        // 사용자 요청: "잡성을 빼고 보여주기로 했어. 천마 록존 홍란 천희 천형 천요만 보여주면 돼."
        // 이를 위해 jusung, gilsung, salsung이 아닌 것들을 화이트리스트로 제한함
        const isMajorStar = ['jusung', 'gilsung', 'salsung'].includes(s.type);
        if (!isMajorStar && !this.renderOptions.zabseongWhitelist.includes(sName)) {
          return; // whitelist에 없는 별들 생략
        }
      }

      if (specialStars.includes(sName)) {
        starsMap['special'].push(s);
      } else if (starsMap[s.type]) {
        starsMap[s.type].push(s);
      }
    });

    ['jusung', 'gilsung', 'salsung', 'special', 'zabseong'].forEach((type) => {
      starsMap[type].forEach((star) => {
        const el = this._createStarElement(star, 'natal', result, jsIdx, daehanSahwaMap);
        allStarElements.push(el);
      });
    });

    // 2. Daehan
    if (
      appState.currentLuckMode === 'daehan' ||
      appState.currentLuckMode === 'yunyeon' ||
      appState.currentLuckMode === 'sohan' ||
      appState.currentLuckMode === 'yuwol'
    ) {
      const daehanStarsInPalace = daehanStars.filter((ds) => ds.palaceIdx === jsIdx);
      daehanStarsInPalace.forEach((star) => {
        const el = this._createStarElement(star, 'daehan');
        allStarElements.push(el);
      });
    }

    // 3. Yunyeon & Yuwol (Sorted)
    if (
      (appState.currentLuckMode === 'yunyeon' || appState.currentLuckMode === 'yuwol') &&
      appState.getYunyeonAge() >= 0
    ) {
      // Recalculate stars locally to be safe, or optimize by passing?
      // The original logic calculated it inside loop.
      // We can calculate once per render, but okay to do here.
      const birthYear = result.lunarDate.year;
      const targetYear = birthYear + appState.getYunyeonAge() - 1;
      const targetGan = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'][
        (targetYear - 4) % 10
      ];
      const targetZhi = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'][
        (targetYear - 4) % 12
      ];

      if (targetGan && targetZhi) {
        const yunyeonStarsAll = window.ziWeiDouShu.getYunyeonStars(
          targetGan,
          targetZhi,
          result.gender
        );
        let mainYStars = yunyeonStarsAll.filter(
          (s) => s.palaceIdx === jsIdx && s.type === 'yunyeon'
        );

        // Sort
        mainYStars.sort((a, b) => {
          const aName = a.name;
          const bName = b.name;
          if (aName.includes('천마')) return 1;
          if (bName.includes('천마')) return -1;
          const isGil = (n) => ['천괴', '천월', '록존', '문창', '문곡'].some((k) => n.includes(k));
          const isSal = (n) => ['경양', '타라', '화성', '영성'].some((k) => n.includes(k));
          const pA = isGil(aName) ? 1 : isSal(aName) ? 2 : 3;
          const pB = isGil(bName) ? 1 : isSal(bName) ? 2 : 3;
          return pA - pB;
        });

        mainYStars.forEach((star) => {
          const el = this._createStarElement(star, 'yunyeon');
          allStarElements.push(el);
        });
      }
    }

    // 3.5. Yuwol Stars
    if (appState.currentLuckMode === 'yuwol' && appState.getYuwolAge() > 0) {
      let activeYearAge = appState.getYunyeonAge();
      if (activeYearAge < 0) activeYearAge = appState.getSohanAge();
      if (activeYearAge > 0) {
        const birthYear = result.lunarDate.year;
        const targetYear = birthYear + activeYearAge - 1;

        // Determine Yuwol celestial stem (Month Gan)
        // The Monthly fortune's Gan is mathematically the Gan of the palace where the Month lands.
        const yuwolPalaceIdx = appState.getYuwolPalaceIndex();
        let yuwolGanStr = '갑'; // fallback

        if (yuwolPalaceIdx >= 0) {
          // Replicate the Wuhu calculation for the *specific palace index* where the month landed.
          const yearGanIdx = (targetYear - 4) % 10;
          const wuhuMonth1Map = {
            0: 2,
            5: 2, // 갑/기 -> 병(2)
            1: 4,
            6: 4, // 을/경 -> 무(4)
            2: 6,
            7: 6, // 병/신 -> 경(6)
            3: 8,
            8: 8, // 정/임 -> 임(8)
            4: 0,
            9: 0, // 무/계 -> 갑(0)
          };
          const startGanIdx = wuhuMonth1Map[yearGanIdx];
          // Calculate Gan based on Palace Zhi (jsIdx - 2 for Yin month shift)
          const currentPalaceGanIdx = (startGanIdx + ((yuwolPalaceIdx - 2 + 12) % 12)) % 10;
          yuwolGanStr = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'][
            currentPalaceGanIdx
          ];
        }

        const palaceZhi = result.palaces[jsIdx].branch;
        const yuwolStarsAll = window.ziWeiDouShu.getYuwolStars(
          yuwolGanStr,
          palaceZhi,
          result.gender
        );

        let mainMStars = yuwolStarsAll.filter((s) => s.palaceIdx === jsIdx && s.type === 'yuwol');

        mainMStars.sort((a, b) => {
          const aName = a.name;
          const bName = b.name;
          if (aName.includes('천마')) return 1;
          if (bName.includes('천마')) return -1;
          const isGil = (n) => ['천괴', '천월', '록존', '문창', '문곡'].some((k) => n.includes(k));
          const isSal = (n) => ['경양', '타라', '화성', '영성'].some((k) => n.includes(k));
          const pA = isGil(aName) ? 1 : isSal(aName) ? 2 : 3;
          const pB = isGil(bName) ? 1 : isSal(bName) ? 2 : 3;
          return pA - pB;
        });

        mainMStars.forEach((star) => {
          const el = this._createStarElement(star, 'yuwol'); // Use 'yuwol' style
          allStarElements.push(el);
        });
      }
    }

    // 4. Sohan
    if (appState.currentLuckMode === 'sohan' && appState.getSohanAge() >= 0) {
      const birthYear = result.lunarDate.year;
      const targetYear = birthYear + appState.getSohanAge() - 1;
      const targetGan = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'][
        (targetYear - 4) % 10
      ];
      const targetZhi = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'][
        (((targetYear - 4) % 12) + 12) % 12
      ];

      if (targetGan && targetZhi) {
        const sohanStarsAll = window.ziWeiDouShu.getYunyeonStars(
          targetGan,
          targetZhi,
          result.gender
        );
        let mainSStars = sohanStarsAll.filter((s) => s.palaceIdx === jsIdx && s.type === 'yunyeon');

        mainSStars.sort((a, b) => {
          const aName = a.name;
          const bName = b.name;
          if (aName.includes('천마')) return 1;
          if (bName.includes('천마')) return -1;
          const isGil = (n) => ['천괴', '천월', '록존', '문창', '문곡'].some((k) => n.includes(k));
          const isSal = (n) => ['경양', '타라', '화성', '영성'].some((k) => n.includes(k));
          const pA = isGil(aName) ? 1 : isSal(aName) ? 2 : 3;
          const pB = isGil(bName) ? 1 : isSal(bName) ? 2 : 3;
          return pA - pB;
        });

        mainSStars.forEach((star) => {
          const el = this._createStarElement(star, 'sohan');
          allStarElements.push(el);
        });
      }
    }

    // Render Tracks
    if (allStarElements.length > 0) {
      const TRACK_COUNT = this.renderOptions?.mobileSimple ? 7 : 11;

      const tracksContainer = document.createElement('div');
      tracksContainer.className = 'star-tracks-container';

      // 모바일: 2단 줄바꿈 시 간격은 CSS(styles_mobile.css)에서 일원 관리
      if (this.renderOptions?.mobileSimple) {
        // ── 모바일: CSS Grid로 배치 (같은 row의 별이 수평 정렬 보장) ──
        body.style.overflow = 'visible';
        tracksContainer.style.overflow = 'visible';

        allStarElements.forEach((el, idx) => {
          const row = Math.floor(idx / TRACK_COUNT);
          const colInRow = idx % TRACK_COUNT;
          let trackIdx;
          if (row % 2 === 0) {
            trackIdx = colInRow;
          } else {
            trackIdx = TRACK_COUNT - 1 - colInRow;
          }
          // CSS Grid 배치 (1-indexed)
          el.style.gridColumn = String(trackIdx + 1);
          el.style.gridRow = String(row + 1);
          tracksContainer.appendChild(el);
        });
      } else {
        // ── 데스크탑: 기존 track 기반 flex 방식 유지 ──
        const tracks = Array.from({ length: TRACK_COUNT }, () => []);

        allStarElements.forEach((el, idx) => {
          const row = Math.floor(idx / TRACK_COUNT);
          const colInRow = idx % TRACK_COUNT;
          let trackIdx;
          if (row % 2 === 0) {
            trackIdx = colInRow;
          } else {
            trackIdx = TRACK_COUNT - 1 - colInRow;
          }
          if (tracks[trackIdx]) {
            tracks[trackIdx].push(el);
          }
        });

        tracks.forEach((trackStars, tIdx) => {
          const trackDiv = document.createElement('div');
          trackDiv.className = 'star-track';
          trackDiv.dataset.trackId = tIdx;
          trackStars.forEach((el) => trackDiv.appendChild(el));
          tracksContainer.appendChild(trackDiv);
        });
      }

      body.appendChild(tracksContainer);
    }

    content.appendChild(body);

    // --- 나이버튼 행 (유년/소한/유월, palace-footer 위) ---
    // ※ 대한 버튼은 footer-center에 배치 (아래 footer 생성 구간에서 처리)
    // ※ 유월 버튼 등 absolute 요소들의 기준점인 wrapper

    const ageBtnRowWrapper = document.createElement('div');
    ageBtnRowWrapper.style.position = 'relative';
    ageBtnRowWrapper.style.width = '100%';
    ageBtnRowWrapper.style.flexShrink = '0'; // 컨텐츠 영역 축소 방지

    const ageBtnRow = document.createElement('div');
    ageBtnRow.className = 'age-btn-row';
    this._renderYunyeonSohanButtons(ageBtnRow, result, jsIdx, daehanRanges, direction);

    ageBtnRowWrapper.appendChild(ageBtnRow);
    this._renderYuwolButton(ageBtnRowWrapper, result, jsIdx, palaceDiv);

    // --- 하단 명궁 라벨 (Sohan/Yunyeon Indicator)을 Wrapper 우측 하단 절대위치로 띄움 ---
    const showSohanIndicator =
      (appState.currentLuckMode === 'yunyeon' && appState.getYunyeonAge() > 0) ||
      (appState.currentLuckMode === 'yuwol' &&
        appState.isYunyeonLocked() &&
        appState.getYunyeonAge() > 0);

    if (showSohanIndicator) {
      const birthYear = result.lunarDate.year;
      const jamidusuAge = appState.getYunyeonAge();
      const targetYear = birthYear + jamidusuAge - 1;
      const targetYearZhi = [
        '자',
        '축',
        '인',
        '묘',
        '진',
        '사',
        '오',
        '미',
        '신',
        '유',
        '술',
        '해',
      ][(((targetYear - 4) % 12) + 12) % 12];

      const luck = window.ziWeiDouShu.getLuckPalaces(
        result.mingIdx,
        result.bureauNum,
        result.gender,
        result.lunarYearGan,
        result.lunarYearZhi,
        jamidusuAge,
        targetYearZhi
      );

      if (luck.sohan && luck.sohan.idx === jsIdx) {
        const sohanMingLabel = document.createElement('div');
        sohanMingLabel.className = 'yunyeon-sohan-ming-label';
        sohanMingLabel.textContent = isKorean ? '소한' : '小限';
        ageBtnRowWrapper.appendChild(sohanMingLabel);
      }
    }

    // --- Yunyeon Indicator in Sohan Mode (or Yuwol from Sohan) ---
    const showYunyeonIndicator =
      (appState.currentLuckMode === 'sohan' && appState.getSohanAge() > 0) ||
      (appState.currentLuckMode === 'yuwol' &&
        appState.isSohanLocked() &&
        appState.getSohanAge() > 0);

    if (showYunyeonIndicator) {
      const birthYear = result.lunarDate.year;
      const jamidusuAge = appState.getSohanAge();
      const targetYear = birthYear + jamidusuAge - 1;
      const targetYearZhi = [
        '자',
        '축',
        '인',
        '묘',
        '진',
        '사',
        '오',
        '미',
        '신',
        '유',
        '술',
        '해',
      ][(((targetYear - 4) % 12) + 12) % 12];

      const luck = window.ziWeiDouShu.getLuckPalaces(
        result.mingIdx,
        result.bureauNum,
        result.gender,
        result.lunarYearGan,
        result.lunarYearZhi,
        jamidusuAge,
        targetYearZhi
      );

      if (luck.yunyeon && luck.yunyeon.idx === jsIdx) {
        const yunyeonMingLabel = document.createElement('div');
        yunyeonMingLabel.className = 'sohan-yunyeon-ming-label';
        yunyeonMingLabel.textContent = isKorean ? '유년' : '流年';
        ageBtnRowWrapper.appendChild(yunyeonMingLabel);
      }
    }

    content.appendChild(ageBtnRowWrapper);

    // --- Footer ---
    const footer = document.createElement('div');
    footer.className = 'palace-footer';

    // Left: Minors
    const footerLeft = document.createElement('div');
    footerLeft.className = 'footer-left';

    let minorTypes = ['doctor12', 'jangsaeng12', 'jangseong12', 'taese12'];
    let minorStarsToDisplay = data.stars.filter((s) => minorTypes.includes(s.type));

    if (
      (appState.currentLuckMode === 'yunyeon' && appState.getYunyeonAge() >= 0) ||
      (appState.currentLuckMode === 'sohan' && appState.getSohanAge() >= 0) ||
      appState.currentLuckMode === 'yuwol'
    ) {
      let targetYear;
      if (appState.currentLuckMode === 'yunyeon')
        targetYear = result.lunarDate.year + appState.getYunyeonAge() - 1;
      else if (appState.currentLuckMode === 'sohan')
        targetYear = result.lunarDate.year + appState.getSohanAge() - 1;

      if (appState.currentLuckMode === 'yunyeon' || appState.currentLuckMode === 'sohan') {
        const targetGan = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'][
          (((targetYear - 4) % 10) + 10) % 10
        ];
        const targetZhi = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'][
          (((targetYear - 4) % 12) + 12) % 12
        ];
        if (targetGan && targetZhi) {
          const yStarsAll = window.ziWeiDouShu.getYunyeonStars(targetGan, targetZhi, result.gender);
          const yMinors = yStarsAll.filter(
            (s) =>
              s.palaceIdx === jsIdx &&
              ['yunyeon_doctor12', 'yunyeon_jangseong12', 'yunyeon_taese12'].includes(s.type)
          );
          const natalJangsaeng = data.stars.filter((s) => s.type === 'jangsaeng12');
          minorStarsToDisplay = [...yMinors, ...natalJangsaeng];
        }
      } else if (appState.currentLuckMode === 'yuwol') {
        const jsPalaceGan = result.palaces[jsIdx].gan;
        const palaceZhi = result.palaces[jsIdx].branch;
        const yuwolStarsAll = window.ziWeiDouShu.getYuwolStars(
          jsPalaceGan,
          palaceZhi,
          result.gender
        );
        // Assuming Yuwol uses the same minor stars? Actually Yuwol only has major flow stars.
        // It does not have doctor12, jangseong12, taese12 specific to the month. Usually we just show natal jangsaeng or carry over Yunyeon's.
        // Re-calculating Yunyeon's so they stay visible
        let activeYearAge = appState.getYunyeonAge();
        if (activeYearAge < 0) activeYearAge = appState.getSohanAge();
        if (activeYearAge > 0) {
          const ty = result.lunarDate.year + activeYearAge - 1;
          const tg = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'][
            (((ty - 4) % 10) + 10) % 10
          ];
          const tz = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'][
            (((ty - 4) % 12) + 12) % 12
          ];
          if (tg && tz) {
            const yStarsAll = window.ziWeiDouShu.getYunyeonStars(tg, tz, result.gender);
            const yMinors = yStarsAll.filter(
              (s) =>
                s.palaceIdx === jsIdx &&
                ['yunyeon_doctor12', 'yunyeon_jangseong12', 'yunyeon_taese12'].includes(s.type)
            );
            const natalJangsaeng = data.stars.filter((s) => s.type === 'jangsaeng12');
            minorStarsToDisplay = [...yMinors, ...natalJangsaeng];
          }
        }
      }
    }

    minorStarsToDisplay.forEach((s) => {
      const msDiv = document.createElement('div');
      msDiv.className = 'minor-star';
      if (s.type.startsWith('yunyeon') || s.type.startsWith('sohan'))
        msDiv.classList.add('yunyeon');
      else if (s.type.startsWith('yuwol')) {
        msDiv.classList.add('yuwol');
      }
      let msName = s.name;
      // 내부 구분 접미사 제거: '관부(태세)' → '관부'
      const msInternalName = msName;
      msName = msName.replace('(태세)', '');
      if (!isKorean) {
        if (msInternalName === '관부(태세)') {
          msName = starNameMap['관부(태세)'] || '官符';
        } else if (starNameMap[msName]) {
          msName = starNameMap[msName];
        }
      }
      msDiv.textContent = msName;
      footerLeft.appendChild(msDiv);
    });
    footer.appendChild(footerLeft);

    // Center: 대한 버튼 (항상 footer 중앙에 고정)
    const footerCenter = document.createElement('div');
    footerCenter.className = 'footer-center';
    this._renderDaeunButton(footerCenter, result, jsIdx, daehanRanges);
    footer.appendChild(footerCenter);

    // Right: Gan/Zhi
    const footerRight = document.createElement('div');
    footerRight.className = 'footer-right';

    if (data.isBody) {
      if (this.renderOptions?.mobileSimple) {
        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'header-label body-palace';
        bodyDiv.textContent = isKorean ? '신궁' : '身宮';
        header.appendChild(bodyDiv);
      } else {
        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'body-palace-label';
        bodyDiv.textContent = isKorean ? '신궁' : '身宮';
        footerRight.appendChild(bodyDiv);
      }
    }

    let displayGan = data.gan || '';
    let isYuwolGan = false;
    let flowGanZhiColor = null;

    if (
      appState.currentLuckMode === 'yunyeon' &&
      appState.getYunyeonAge() > 0 &&
      result.lunarDate
    ) {
      const preview = this._getYunyeonPreviewForPalace(result, jsIdx);
      if (preview) {
        displayGan = preview.gan;
        flowGanZhiColor = 'var(--star-yunyeon)';
      }
    }

    if (
      appState.currentLuckMode === 'yuwol' &&
      appState.isDaehanLocked() &&
      (appState.isYunyeonLocked() || appState.isSohanLocked()) &&
      result.lunarDate
    ) {
      let activeYearAge = appState.getYunyeonAge();
      if (activeYearAge < 0) activeYearAge = appState.getSohanAge();
      if (activeYearAge > 0) {
        const birthYear = result.lunarDate.year;
        const targetYear = birthYear + activeYearAge - 1;
        const targetYearZhiIdx = (((targetYear - 4) % 12) + 12) % 12;

        let yuwolPalaces = null;
        try {
          yuwolPalaces = window.ziWeiDouShu.getYuwolPalaces(targetYearZhiIdx, result.inGungOffset);
        } catch (err) {
          console.error('[Renderer Gan] getYuwolPalaces error:', err);
        }
        const matchedMonthObj = yuwolPalaces ? yuwolPalaces.find((m) => m.idx === jsIdx) : null;

        if (matchedMonthObj) {
          // Wuhu Method (오호둔법) calculation for Yuwol Gan
          // targetYear is the actual year of the Yuwol.
          // Year Gan: 십간(갑,을,병...)은 연도 끝자리에 종속됨 (갑=4, 을=5 ... 계=3)
          // Or mathematically: (Year - 4) % 10.
          const yearGanIdx = (targetYear - 4) % 10;

          // Wuhu Month 1 Gan starts based on Year Gan
          // 갑/기 년 -> 1월 병(2)
          // 을/경 년 -> 1월 무(4)
          // 병/신 년 -> 1월 경(6)
          // 정/임 년 -> 1월 임(8)
          // 무/계 년 -> 1월 갑(0)
          const wuhuMonth1Map = {
            0: 2,
            5: 2, // 갑/기 -> 병
            1: 4,
            6: 4, // 을/경 -> 무
            2: 6,
            7: 6, // 병/신 -> 경
            3: 8,
            8: 8, // 정/임 -> 임
            4: 0,
            9: 0, // 무/계 -> 갑
          };

          const startGanIdx = wuhuMonth1Map[yearGanIdx];

          // 자미두수에서 각 궁의 천간은 그 궁의 지지(Zhi) 위치에 따라 정해집니다.
          // 1월(음력)은 위치가 어디든 상관없이 오호둔법에 의해 항상 '인(寅)'월로 취급되어 천간이 배정됩니다.
          // 따라서 해당하는 궁의 지지 인덱스(0:자, 1:축, 2:인 ...)를 기준으로 천간을 구해야 합니다.
          // 인궁(2)의 천간이 startGanIdx 이므로,
          // 현재 궁(jsIdx)의 천간 = (startGanIdx + (jsIdx - 2 + 12) % 12) % 10

          const currentPalaceGanIdx = (startGanIdx + ((jsIdx - 2 + 12) % 12)) % 10;

          displayGan = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'][
            currentPalaceGanIdx
          ];
          isYuwolGan = true;
        }
      }
    }

    const zhi = data.branch || '';
    const ganText = isKorean ? displayGan : ganHanjaMap[displayGan] || displayGan;
    const zhiText = isKorean ? zhi : zhiHanjaMap[zhi] || zhi;
    const ebDiv = document.createElement('div');
    ebDiv.className = 'earthly-branch-vertical';
    ebDiv.innerHTML = `<span class="gz-gan">${ganText}</span><span class="gz-zhi">${zhiText}</span>`;
    if (flowGanZhiColor) {
      ebDiv.style.color = flowGanZhiColor;
    }
    if (isYuwolGan) {
      ebDiv.style.color = 'var(--star-yuwol)';
    }
    footerRight.appendChild(ebDiv);
    footer.appendChild(footerRight);

    content.appendChild(footer);
    palaceDiv.appendChild(content);

    return palaceDiv;
  }

  _renderYunyeonSohanButtons(row, result, jsIdx, daehanRanges, direction) {
    if (!appState.isDaehanLocked() || appState.getDaehanIndex() < 0) return;

    const mode = appState.currentLuckMode;
    if (mode !== 'yunyeon') return;

    const preview = this._getYunyeonPreviewForPalace(result, jsIdx);
    const daehanStartAge = result.bureauNum + appState.getDaehanIndex() * 10;
    const daehanEndAge = daehanStartAge + 9;
    const yunyeonAge =
      preview && preview.age >= daehanStartAge && preview.age <= daehanEndAge
        ? preview.age
        : null;

    // 유년 버튼
    if (yunyeonAge !== null) {
      const yBtn = document.createElement('div');
      yBtn.className = 'yunyeon-age-btn';
      yBtn.textContent = `${preview.year}년 ${yunyeonAge}세`;
      yBtn.dataset.idx = jsIdx;
      yBtn.dataset.age = yunyeonAge;
      if (appState.isYunyeonLocked() && appState.getYunyeonAge() === yunyeonAge)
        yBtn.classList.add('active');
      else if (!appState.isYunyeonLocked()) yBtn.classList.add('yunyeon-bounce');
      row.appendChild(yBtn);
    }
  }

  _getYunyeonPreviewForPalace(result, jsIdx) {
    if (!result?.lunarDate || !appState.isDaehanLocked() || appState.getDaehanIndex() < 0) {
      return null;
    }

    const stems = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
    const branches = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
    const daehanStartAge = result.bureauNum + appState.getDaehanIndex() * 10;
    const daehanStartYear = result.lunarDate.year + daehanStartAge - 1;
    const startZhiIdx = (((daehanStartYear - 4) % 12) + 12) % 12;
    const palaceZhiIdx = branches.indexOf(result.palaces[jsIdx]?.branch);
    if (palaceZhiIdx < 0) return null;

    const offset = (palaceZhiIdx - startZhiIdx + 12) % 12;
    const age = daehanStartAge + offset;
    const year = result.lunarDate.year + age - 1;
    const gan = stems[(((year - 4) % 10) + 10) % 10];
    const zhi = branches[(((year - 4) % 12) + 12) % 12];

    return { age, year, gan, zhi };
  }

  // 유월 버튼 렌더링 → age-btn-row에 추가 (구분선 위)
  _renderYuwolButton(container, result, jsIdx, palaceDiv) {
    if (
      appState.currentLuckMode !== 'yuwol' ||
      !appState.isDaehanLocked() ||
      (!appState.isYunyeonLocked() && !appState.isSohanLocked())
    )
      return;

    let activeYearAge = appState.getYunyeonAge();
    if (activeYearAge < 0) activeYearAge = appState.getSohanAge();
    if (activeYearAge <= 0 || !result.lunarDate) return;

    const birthYear = result.lunarDate.year;
    const targetYear = birthYear + activeYearAge - 1;
    const targetYearZhiIdx = (((targetYear - 4) % 12) + 12) % 12;

    let yuwolPalaces = null;
    try {
      yuwolPalaces = window.ziWeiDouShu.getYuwolPalaces(targetYearZhiIdx, result.inGungOffset);
    } catch (err) {
      console.error('[Renderer] getYuwolPalaces error:', err);
    }

    const matchedMonthObj = yuwolPalaces ? yuwolPalaces.find((m) => m.idx === jsIdx) : null;
    if (!matchedMonthObj) return;

    const mBtn = document.createElement('div');
    mBtn.className = 'yuwol-age-btn';
    mBtn.textContent = `${matchedMonthObj.month}월`;
    mBtn.dataset.idx = jsIdx;
    mBtn.dataset.age = matchedMonthObj.month;

    let tooltipText = '';
    let solarRange = null;
    try {
      if (window.lunarConverter && targetYear >= 1900 && targetYear <= 2220) {
        solarRange = window.lunarConverter.lunarMonthToSolarRange(
          targetYear,
          matchedMonthObj.month
        );
      }
    } catch (e) {}

    if (solarRange && solarRange.start !== 'N/A' && solarRange.end !== 'N/A') {
      tooltipText = `양력 ${solarRange.start} ~ ${solarRange.end}`;
      if (solarRange.is45Days) tooltipText += '<br>(윤달 포함)';
    } else {
      let yy = targetYear;
      let mm = matchedMonthObj.month;
      let sm = mm + 1;
      if (sm > 12) {
        sm -= 12;
        yy++;
      }
      let em = sm + 1;
      let eyy = yy;
      if (em > 12) {
        em -= 12;
        eyy++;
      }

      const sM = String(sm).padStart(2, '0');
      const eM = String(em).padStart(2, '0');
      tooltipText = `양력 ${yy}.${sM}.01 ~ ${eyy}.${eM}.01<br>(추정)`;
    }

    // 유월 툴팁 (JS 기반 독립 DOM 렌더링 - 깜빡임 루프 회피 목적)
    // 툴팁 노드가 아직 없으면 palaceDiv에 하나만 생성 (absolute 위치를 palace 기준으로 잡기 위함)
    let tooltipDiv = palaceDiv.querySelector('.yuwol-fixed-tooltip');
    if (!tooltipDiv) {
      tooltipDiv = document.createElement('div');
      tooltipDiv.className = 'yuwol-fixed-tooltip';
      tooltipDiv.style.display = 'none'; // 기본 숨김
      palaceDiv.appendChild(tooltipDiv);
    }

    // 버튼 호버 시 JS로 툴팁 내용을 채우고 보여줌
    mBtn.addEventListener('mouseenter', () => {
      tooltipDiv.innerHTML = tooltipText;
      tooltipDiv.style.display = 'block';
      // 약간의 지연 후 opacity 적용(CSS transition 트리거용)
      setTimeout(() => (tooltipDiv.style.opacity = '1'), 10);
    });

    mBtn.addEventListener('mouseleave', () => {
      tooltipDiv.style.opacity = '0';
      // 애니메이션 끝나면 숨김 처리
      setTimeout(() => {
        if (tooltipDiv.style.opacity === '0') {
          tooltipDiv.style.display = 'none';
        }
      }, 250); // CSS transition 시간과 동일하게
    });

    if (appState.isYuwolLocked() && appState.getYuwolAge() === matchedMonthObj.month) {
      mBtn.classList.add('active');
    } else if (!appState.isYuwolLocked() && appState.getYuwolPalaceIndex() === jsIdx) {
      mBtn.classList.add('yuwol-bounce');
    }

    container.appendChild(mBtn);
  }

  // 대한 버튼 렌더링 → footer-center에 추가 (구분선 아래 중앙 고정)
  _renderDaeunButton(container, result, jsIdx, daehanRanges) {
    const range = daehanRanges[jsIdx] || { min: 0, max: 0, step: 0 };
    const daeunBtn = document.createElement('div');
    daeunBtn.className = 'daeun-age-btn';
    daeunBtn.textContent = `${range.min}-${range.max}세`;
    daeunBtn.dataset.idx = range.step;
    daeunBtn.dataset.age = range.min;

    if (appState.isDaehanLocked() && appState.getDaehanIndex() >= 0) {
      if (range.step === appState.getDaehanIndex()) daeunBtn.classList.add('daehan-active');
    } else if (appState.currentLuckMode !== 'basic') {
      daeunBtn.classList.add('daehan-bounce');
    }

    container.appendChild(daeunBtn);
  }

  _createStarElement(star, mode, result, jsIdx, daehanSahwaMap) {
    const isKorean = appState.isKorean;
    const col = document.createElement('div');
    col.className = 'star-column';

    const starDiv = document.createElement('div');
    // ClassName construction
    let className = `star-char ${star.type}`;
    if (mode === 'daehan') className = 'star-char daehan-star';
    if (mode === 'yunyeon' || mode === 'sohan') className = `star-char ${mode}-star`; // sohan-star or yunyeon-star
    starDiv.className = className;

    if (mode === 'daehan') starDiv.style.color = 'var(--star-daehan)';
    if (mode === 'yunyeon' || mode === 'sohan') starDiv.style.color = 'var(--star-yunyeon)';

    let sName = (star.name || '').trim();
    if (mode === 'daehan') sName = sName.replace('대한 ', '');
    if (mode === 'yunyeon' || mode === 'sohan') sName = sName.replace('유년 ', '');
    if (mode === 'yuwol') sName = sName.replace(/^유월\s+/, '');
    const internalName = sName; // 한자 변환 시 원본 이름 참조용
    // 내부 구분 접미사는 항상 제거 (한글 표시: '관부(태세)' → '관부')
    sName = sName.replace('(태세)', '');

    // Special Color Override: Cheonma, Hongran, Cheonhui -> Gilseong Blue (Only in Natal mode)
    const sNameTrimmed = sName.trim();
    if (mode === 'natal' && ['천마', '홍란', '천희'].includes(sNameTrimmed)) {
      starDiv.style.color = 'var(--star-gilsung)';
      starDiv.classList.add('force-gilsung');
    }

    // Hanja
    if (!isKorean) {
      const originalName = sName; // 변환 실패 시 fallback용 원본 보존
      if (sName === '천상') {
        sName = star.type === 'jusung' ? starNameMap['천상(주성)'] : starNameMap['천상(잡성)'];
      } else if (sName === '천월') {
        // 선천 길성 천월, 혹은 대한/유년/소한/유월의 천월(天鉞) 처리
        const isGilsungYue =
          star.type === 'gilsung' ||
          star.type === 'daehan' ||
          star.type === 'yunyeon' ||
          star.type === 'sohan' ||
          star.type === 'yuwol';
        sName = isGilsungYue ? starNameMap['천월(길성)'] : starNameMap['천월(잡성)'];
      } else if (sName === '비렴') {
        // 잡성 비렴(蜚廉) vs 박사12신 비렴(飛廉) 구분
        sName = star.type === 'zabseong' ? starNameMap['비렴(잡성)'] : starNameMap['비렴(박사)'];
      } else if (internalName === '관부(태세)') {
        // 태세 12신 관부(官符) vs 박사 12신 관부(官府) 구분 — internalName으로 체크
        sName = starNameMap['관부(태세)']; // 官符
      } else if (starNameMap[sName]) {
        sName = starNameMap[sName];
      }
      // undefined 방어: starNameMap에 키가 없으면 원래 한글 이름 유지
      if (!sName) sName = originalName;
    }

    let html = '';
    for (let char of sName) html += `<span class="star-glyph">${char}</span>`;
    starDiv.innerHTML = html;
    col.appendChild(starDiv);

    // Status (Natal Only mainly)
    if (mode === 'natal') {
      const pBranch = appState.currentResult.palaces[jsIdx].branch;
      let sNamePure = (star.name || '').trim();
      // 잡성(zabseong)은 묘왕함리 표시 제외 (예: 잡성 천월이 길성 천월 데이터를 참조하는 문제 방지)
      if (
        star.type !== 'zabseong' &&
        typeof STAR_STATUS !== 'undefined' &&
        STAR_STATUS[sNamePure] &&
        STAR_STATUS[sNamePure][pBranch]
      ) {
        const status = STAR_STATUS[sNamePure][pBranch];
        const statusDiv = document.createElement('div');
        statusDiv.className = 'star-status';
        statusDiv.textContent = isKorean ? MWHL_SYMBOLS[status] || '' : MWHL_HANJA[status] || '';
        col.appendChild(statusDiv);
      }
    }

    // Sahwa
    if (mode === 'natal' && star.sahwa) {
      const badge = document.createElement('div');
      const sahwaClass = { 록: 'lu', 권: 'quan', 과: 'ke', 기: 'ji' }[star.sahwa] || 'lu';
      badge.className = `sahwa-badge ${sahwaClass}`;
      badge.textContent = isKorean ? star.sahwa : starNameMap[star.sahwa] || star.sahwa;
      col.appendChild(badge);
    }

    // Daehan Sahwa checking
    if (
      mode === 'natal' &&
      (appState.currentLuckMode === 'daehan' ||
        appState.currentLuckMode === 'yunyeon' ||
        appState.currentLuckMode === 'sohan' ||
        appState.currentLuckMode === 'yuwol') &&
      daehanSahwaMap &&
      daehanSahwaMap[jsIdx]
    ) {
      const dSahwa = daehanSahwaMap[jsIdx].find((ds) => ds.starName === star.name);
      if (dSahwa) {
        const dBadge = document.createElement('div');
        const sahwaClass = { 록: 'lu', 권: 'quan', 과: 'ke', 기: 'ji' }[dSahwa.sahwaType] || 'lu';
        dBadge.className = `sahwa-badge daehan-sahwa ${sahwaClass}`;
        dBadge.textContent = isKorean
          ? dSahwa.sahwaType
          : starNameMap[dSahwa.sahwaType] || dSahwa.sahwaType;
        col.appendChild(dBadge);
      }
    }

    // Yunyeon Sahwa
    if (
      mode === 'natal' &&
      (appState.currentLuckMode === 'yunyeon' || appState.currentLuckMode === 'yuwol') &&
      appState.getYunyeonAge() >= 0
    ) {
      const birthYear = appState.currentResult.lunarDate.year;
      const targetYear = birthYear + appState.getYunyeonAge() - 1;
      const yGan = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'][
        (targetYear - 4) % 10
      ];

      if (yGan && window.ziWeiDouShu.sahwaMap[yGan]) {
        const sNameStrip = (star.name || '').trim();
        const ySahwaList = window.ziWeiDouShu.sahwaMap[yGan];
        const idx = ySahwaList.indexOf(sNameStrip);
        if (idx >= 0) {
          const type = ['록', '권', '과', '기'][idx];
          const yBadge = document.createElement('div');
          yBadge.className = `sahwa-badge yunyeon-sahwa`;
          yBadge.style.backgroundColor = 'var(--star-yunyeon)';
          yBadge.textContent = isKorean ? type : starNameMap[type] || type;
          col.appendChild(yBadge);
        }
      }
    }

    // Yuwol Sahwa
    if (mode === 'natal' && appState.currentLuckMode === 'yuwol' && appState.getYuwolAge() > 0) {
      const yuwolPalaceIdx = this.ctx.yuwolIdx;
      if (yuwolPalaceIdx >= 0) {
        // Determine Yuwol celestial stem (Month Gan)
        let activeYearAge = appState.getYunyeonAge();
        if (activeYearAge < 0) activeYearAge = appState.getSohanAge();
        const birthYear = appState.currentResult.lunarDate.year;
        const targetYear = birthYear + activeYearAge - 1;

        const yearGanIdx = (targetYear - 4) % 10;
        const wuhuMonth1Map = {
          0: 2,
          5: 2, // 갑/기 -> 병(2)
          1: 4,
          6: 4, // 을/경 -> 무(4)
          2: 6,
          7: 6, // 병/신 -> 경(6)
          3: 8,
          8: 8, // 정/임 -> 임(8)
          4: 0,
          9: 0, // 무/계 -> 갑(0)
        };

        const startGanIdx = wuhuMonth1Map[yearGanIdx];
        // Calculate Gan based on Palace Zhi (jsIdx - 2 for Yin month shift)
        const currentPalaceGanIdx = (startGanIdx + ((yuwolPalaceIdx - 2 + 12) % 12)) % 10;
        const yGan = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'][
          currentPalaceGanIdx
        ];

        if (yGan && window.ziWeiDouShu.sahwaMap[yGan]) {
          const sNameStrip = (star.name || '').trim();
          const ywSahwaList = window.ziWeiDouShu.sahwaMap[yGan];
          const idx = ywSahwaList.indexOf(sNameStrip);
          if (idx >= 0) {
            const type = ['록', '권', '과', '기'][idx];
            const ywBadge = document.createElement('div');
            ywBadge.className = `sahwa-badge yuwol-sahwa`;
            ywBadge.style.backgroundColor = 'var(--star-yuwol)';
            ywBadge.textContent = isKorean ? type : starNameMap[type] || type;
            col.appendChild(ywBadge);
          }
        }
      }
    }

    return col;
  }

  _renderCenterArea(result) {
    const isKorean = appState.isKorean;
    const centerArea = document.querySelector('.center-area');
    if (!centerArea) return;

    if (
      (this.renderOptions && this.renderOptions.mobileSimple) ||
      (this.renderOptions && this.renderOptions._expertMode)
    ) {
      return;
    }
    centerArea.innerHTML = '';

    // SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'center-svg');
    svg.setAttribute('id', 'centerSvg');
    centerArea.appendChild(svg);

    const content = document.createElement('div');
    content.className = 'center-content';
    content.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.daeun-item')) return;
      this.selectPalaceGlobal(-1);
    });

    // Lang Toggle
    const langBtn = document.createElement('button');
    langBtn.className = 'lang-btn';
    langBtn.id = 'langToggleCenter';
    langBtn.textContent = appState.isKorean ? '한글/漢字' : '漢字/한글';
    content.appendChild(langBtn);

    // Person Info
    const pInfo = document.createElement('div');
    pInfo.className = 'person-info';

    const pRow = document.createElement('div');
    pRow.className = 'person-name-row';
    const pName = document.createElement('span');
    pName.id = 'userNameDisplay';
    pName.textContent = result.name || '무명';
    const pGender = document.createElement('span');
    pGender.className = 'gender';
    pGender.textContent =
      result.gender === 'male' ? (isKorean ? '남자' : '男') : isKorean ? '여자' : '女';
    pRow.appendChild(pName);
    pRow.appendChild(pGender);
    pInfo.appendChild(pRow);

    // Birth Info Wrapper
    const birthWrapper = document.createElement('div');
    birthWrapper.className = 'birth-info-wrapper';

    // Solar
    const sd = result.finalDate;
    const solarInfo = document.createElement('p');
    solarInfo.className = 'birth-info';
    const solarStr = isKorean
      ? `${sd.getFullYear()}년 ${sd.getMonth() + 1}월 ${sd.getDate()}일 ${sd.getHours()}시 ${sd.getMinutes()}분`
      : `${sd.getFullYear()}年 ${sd.getMonth() + 1}月 ${sd.getDate()}日 ${sd.getHours()}時 ${sd.getMinutes()}分`;
    solarInfo.textContent = `${isKorean ? '양력' : '陽曆'}: ${solarStr}`;
    birthWrapper.appendChild(solarInfo);

    // Lunar - result.lunarDate를 직접 사용 (음력 입력 시 이중 변환 방지)
    const lunar = result.lunarDate || { year: 0, month: 0, day: 0, isLeap: false };
    const lunarInfo = document.createElement('p');
    lunarInfo.className = 'birth-info';
    const leapLabel = lunar.isLeap ? ' [윤달]' : '';
    const lunarStr = isKorean
      ? `${lunar.year}년 ${lunar.month}월 ${lunar.day}일${leapLabel}`
      : `${lunar.year}年 ${lunar.month}月 ${lunar.day}日${leapLabel}`;

    const bureauData = {
      2: { k: '수2국', c: '水二局' },
      3: { k: '목3국', c: '木三局' },
      4: { k: '금4국', c: '金四局' },
      5: { k: '토5국', c: '土五局' },
      6: { k: '화6국', c: '火六局' },
    };
    const bName = bureauData[result.bureauNum]
      ? isKorean
        ? bureauData[result.bureauNum].k
        : bureauData[result.bureauNum].c
      : result.bureauNum + '국';

    lunarInfo.innerHTML = `${isKorean ? '음력' : '陰曆'}: ${lunarStr} <span id="guksuDisplay">[${bName}]</span>`;
    birthWrapper.appendChild(lunarInfo);

    // Input Time
    const inputTimeInfo = document.createElement('p');
    inputTimeInfo.className = 'birth-info';
    const inputHour = result.inputTime ? result.inputTime.hour : sd.getHours();
    const inputMinute = result.inputTime ? result.inputTime.minute : sd.getMinutes();
    const inputTimeLabel = isKorean ? '입력시간' : '入力時刻';
    inputTimeInfo.textContent = `${inputTimeLabel}: ${inputHour}${isKorean ? '시' : '時'} ${inputMinute}${isKorean ? '분' : '分'}`;
    birthWrapper.appendChild(inputTimeInfo);

    // True Solar
    const trueSolarInfo = document.createElement('p');
    trueSolarInfo.className = 'birth-info';
    const adjustedTime = result.trueSolarTime || result.finalDate;
    const totalMinutes = result.trueSolarTimeResult
      ? Math.round(result.trueSolarTimeResult.corrections.totalMin)
      : 0;
    const correctionSign = totalMinutes >= 0 ? '+' : '';
    const trueLabel = isKorean ? '진태양시' : '眞太陽時';
    const jasiBadge = result.isJasiApplied ? ` ${isKorean ? '[자시 적용]' : '[子時適用]'}` : '';
    trueSolarInfo.textContent = `${trueLabel}: ${adjustedTime.getHours()}${isKorean ? '시' : '時'} ${adjustedTime.getMinutes()}${isKorean ? '분' : '分'} (${correctionSign}${totalMinutes}${isKorean ? '분' : '分'}) ${result.city || '서울'}${jasiBadge}`;
    birthWrapper.appendChild(trueSolarInfo);

    pInfo.appendChild(birthWrapper);
    content.appendChild(pInfo);

    // Saju Table
    const sajuSection = document.createElement('div');
    sajuSection.className = 'saju-section';
    const sajuTable = document.createElement('div');
    sajuTable.className = 'saju-table';

    const sajuBaseDate = result.sajuDate || result.trueSolarTime || result.finalDate;
    const solarTermBaseDate = result.solarTermDate || result.finalDate || sajuBaseDate;
    let saju = result.saju || null;
    if (!saju && window.lunarConverter && sajuBaseDate && solarTermBaseDate) {
      const shichenIndex = result.lunarDate ? result.lunarDate.hour : null;
      const termSaju = window.lunarConverter.getSaju(solarTermBaseDate, shichenIndex);
      const dayHourSaju = window.lunarConverter.getSaju(sajuBaseDate, shichenIndex);
      saju = {
        year: termSaju.year,
        month: termSaju.month,
        day: dayHourSaju.day,
        hour: dayHourSaju.hour
      };
    }
    if (saju) {
      const headers = isKorean ? ['시', '일', '월', '년'] : ['時', '日', '月', '年'];
      const dataOrder = [saju.hour, saju.day, saju.month, saju.year];
      headers.forEach((h, idx) => {
        const col = document.createElement('div');
        col.className = 'saju-column';
        col.innerHTML = `<div class="saju-header">${h}</div>`;
        const val = document.createElement('div');
        val.className = 'saju-value';
        let g = dataOrder[idx].gan;
        let z = dataOrder[idx].zhi;
        if (!isKorean) {
          g = ganHanjaMap[g] || g;
          z = zhiHanjaMap[z] || z;
        }
        val.innerHTML = `<span>${g}</span><span>${z}</span>`;
        col.appendChild(val);
        sajuTable.appendChild(col);
      });
    }
    sajuSection.appendChild(sajuTable);

    // Daeun
    const daeunSection = document.createElement('div');
    daeunSection.className = 'daeun-section';
    const daeunListDiv = document.createElement('div');
    daeunListDiv.className = 'daeun-list';
    const dList = window.lunarConverter && saju
      ? window.lunarConverter.getDaeun(
          saju,
          result.gender,
          solarTermBaseDate
        )
      : [];
    [...dList].reverse().forEach((item) => {
      const dItem = document.createElement('div');
      dItem.className = 'daeun-item';
      let g = item.gan;
      let z = item.zhi;
      if (!isKorean) {
        g = ganHanjaMap[g] || g;
        z = zhiHanjaMap[z] || z;
      }
      dItem.innerHTML = `<span class="daeun-gz">${g}${z}</span><span class="daeun-age">${item.age}</span>`;
      daeunListDiv.appendChild(dItem);
    });
    daeunSection.appendChild(daeunListDiv);
    sajuSection.appendChild(daeunSection);
    content.appendChild(sajuSection);

    // Modes
    const controls = document.createElement('div');
    controls.className = 'center-mode-controls';
    const modes = [
      { id: 'basic', label: '선천' },
      { id: 'daehan', label: '대한' },
      { id: 'yunyeon', label: '유년' },
    ];
    modes.forEach((m) => {
      const btn = document.createElement('button');
      btn.className = `mode-btn ${m.id} ${appState.currentLuckMode === m.id ? 'active' : ''}`;
      btn.dataset.mode = m.id;
      btn.innerHTML = `<span class="mode-btn-label">${m.label}</span>`;
      controls.appendChild(btn);
    });
    content.appendChild(controls);

    centerArea.appendChild(content);
  }

  _createLabel(text, type) {
    const span = document.createElement('span');
    span.className = `header-label ${type}`;
    span.textContent = text;
    return span;
  }

  _getCurrentContext(result) {
    const ctx = {
      daehanGan: null,
      daehanZhi: null,
      yunyeonGan: null,
      daehanIdx: -1,
      yunyeonIdx: -1,
      sohanIdx: -1,
      yuwolIdx: -1,
      daehanStartAge: -1,
      sohanAge: -1,
    };
    if (appState.currentLuckMode === 'basic') return ctx;

    const gIdx = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'].indexOf(
      result.lunarYearGan
    );
    const isYangYear = gIdx % 2 === 0;
    const isMale = result.gender === 'male';
    const isClockwise = (isYangYear && isMale) || (!isYangYear && !isMale);
    const direction = isClockwise ? 1 : -1;

    if (
      (appState.currentLuckMode === 'daehan' ||
        appState.currentLuckMode === 'yunyeon' ||
        appState.currentLuckMode === 'sohan' ||
        appState.currentLuckMode === 'yuwol') &&
      appState.getDaehanIndex() >= 0
    ) {
      const daehanPalaceIdx = window.ziWeiDouShu.norm(
        result.mingIdx + appState.getDaehanIndex() * direction
      );
      ctx.daehanIdx = daehanPalaceIdx;
      ctx.daehanGan = result.palaces[daehanPalaceIdx].gan;
      ctx.daehanZhi = result.palaces[daehanPalaceIdx].branch;
      ctx.daehanStartAge = result.bureauNum + appState.getDaehanIndex() * 10;
    }
    if (appState.currentLuckMode === 'yunyeon' || appState.currentLuckMode === 'yuwol') {
      if (appState.getYunyeonAge() >= 0) {
        if (appState.getYunyeonPalaceIndex() >= 0) {
          ctx.yunyeonIdx = appState.getYunyeonPalaceIndex();
        } else {
          const yearZhi = appState.getYunyeonYearZhi() || '자';
          ctx.yunyeonIdx = result.palaces.findIndex((p) => p.branch && p.branch.trim() === yearZhi);
        }
      } else if (appState.currentLuckMode === 'yuwol' && appState.getSohanAge() >= 0) {
        // Cross-display Yunyeon border when Sohan is active in Yuwol
        const targetYear = result.lunarDate.year + appState.getSohanAge() - 1;
        const yearZhi = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'][
          (targetYear - 4) % 12
        ];
        ctx.yunyeonIdx = result.palaces.findIndex((p) => p.branch && p.branch.trim() === yearZhi);
      }
    }

    if (
      appState.currentLuckMode === 'sohan' ||
      appState.currentLuckMode === 'yuwol' ||
      appState.currentLuckMode === 'yunyeon'
    ) {
      if (appState.getSohanAge() >= 0 && appState.getSohanPalaceIndex() >= 0) {
        ctx.sohanIdx = appState.getSohanPalaceIndex();
        ctx.sohanAge = appState.getSohanAge();
      } else if (appState.getSohanAge() >= 0) {
        // PalaceIndex가 없는 경우 sohanAges 배열로 찾기
        const found = result.palaces.findIndex(
          (p) => p.sohanAges && p.sohanAges.includes(appState.getSohanAge())
        );
        ctx.sohanIdx = found;
        ctx.sohanAge = appState.getSohanAge();
      } else if (appState.currentLuckMode === 'sohan') {
        ctx.sohanIdx = -1;
        ctx.sohanAge = -1;
      } else if (
        (appState.currentLuckMode === 'yuwol' || appState.currentLuckMode === 'yunyeon') &&
        appState.getYunyeonAge() >= 0
      ) {
        // Cross-display Sohan border when Yunyeon is active
        ctx.sohanIdx = result.palaces.findIndex(
          (p) => p.sohanAges && p.sohanAges.includes(appState.getYunyeonAge())
        );
        ctx.sohanAge = appState.getYunyeonAge();
      }
    }
    if (appState.currentLuckMode === 'yuwol') {
      if (appState.getYuwolAge() >= 0 && appState.getYuwolPalaceIndex() >= 0) {
        ctx.yuwolIdx = appState.getYuwolPalaceIndex();
      } else {
        ctx.yuwolIdx = -1;
      }
    }
    return ctx;
  }

  // Wrapper for global selectPalace until we fully move it
  selectPalaceGlobal(idx) {
    if (typeof window.selectPalace === 'function') {
      window.selectPalace(idx);
    }
  }
}
