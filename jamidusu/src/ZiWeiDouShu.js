/**
 * 자미두수 핵심 로직 클래스 (sropee/jamidusu_windows 기준)
 */
class ZiWeiDouShu {
  constructor() {
    this.branches = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
    // sropee/jamidusu_windows 기준의 시계 방향 궁 배열
    this.palaceNames = [
      '명궁',
      '부모',
      '복덕',
      '전택',
      '관록',
      '노복',
      '천이',
      '질액',
      '재백',
      '자녀',
      '부처',
      '형제',
    ];

    this.sahwaMap = {
      갑: ['염정', '파군', '무곡', '태양'],
      을: ['천기', '천량', '자미', '태음'],
      병: ['천동', '천기', '문창', '염정'],
      정: ['태음', '천동', '천기', '거문'],
      무: ['탐랑', '태음', '우필', '천기'],
      기: ['무곡', '탐랑', '천량', '문곡'],
      경: ['태양', '무곡', '태음', '천동'],
      신: ['거문', '태양', '문곡', '문창'],
      임: ['천량', '자미', '좌보', '무곡'],
      계: ['파군', '거문', '태음', '탐랑'],
    };
  }

  norm(idx) {
    let n = idx % 12;
    return n < 0 ? n + 12 : n;
  }

  calculate(lunarDate, saju, gender) {
    let month = lunarDate.month;
    const day = lunarDate.day;
    const hour = lunarDate.hour;
    const isLeap = lunarDate.isLeap;

    // 윤달(Leap Month) 15일 분기 로직 적용
    // 1~15일: 현재 월 유지
    // 16~말일: 다음 월로 취급 (12월 초과 시 1월로 래핑)
    if (isLeap && day > 15) {
      month += 1;
      if (month > 12) month = 1;
    }

    // 자미두수는 사주 입춘 기준이 아닌 음력 설 기준 년간을 사용함
    const ganMap = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
    const yearGanIdx = (lunarDate.year - 4) % 10;
    const yearZhiIdx = (lunarDate.year - 4) % 12;
    const yearGan = ganMap[yearGanIdx];
    const yearZhi = this.branches[yearZhiIdx];
    const tigerGanIdx = ((yearGanIdx % 5) * 2 + 2) % 10;

    // 명궁 산출
    // month: 1~12, hour: 0~11
    // Base: 2 + (Month - 1)
    // Ming: Base - Hour
    // Body: Base + Hour
    const mingIdx = this.norm(2 + (month - 1) - hour);
    const bodyIdx = this.norm(2 + (month - 1) + hour);

    // 2. 12궁 및 지지 정보 설정
    let palaces = new Array(12).fill(null).map((_, i) => {
      // 각 지지(i)에 해당하는 천간 산출: 인(2)에서 시작하여 tigerGanIdx부터 순차적 부여
      const stemIdx = (tigerGanIdx + ((i - 2 + 12) % 12)) % 10;
      return {
        branch: this.branches[i],
        gan: ganMap[stemIdx],
        name: '',
        stars: [],
      };
    });

    // sropee 방식: 시계 방향으로 궁 배치
    for (let i = 0; i < 12; i++) {
      let targetIdx = this.norm(mingIdx + i);
      palaces[targetIdx].name = this.palaceNames[i];
      palaces[targetIdx].isBody = targetIdx === bodyIdx;
    }

    // 3. 국수 (Bureau)
    let dist = this.norm(mingIdx - 2);
    let mingGanIdx = (tigerGanIdx + dist) % 10;
    const bureauNum = this.getBureauNumber(mingGanIdx, mingIdx);

    // 자미성 산출 (sropee 공식)
    let T = Math.ceil(day / bureauNum);
    let I = bureauNum * T - day;
    if (I % 2 !== 0) T = T - I + 12;
    else T = T + I;
    let ziWeiIdx = this.norm(2 + T - 1);
    palaces[ziWeiIdx].stars.push({ name: '자미', type: 'jusung' });

    // 자미계열 (역행)
    const ziWeiGroup = [
      { offset: -1, name: '천기' },
      { offset: -3, name: '태양' },
      { offset: -4, name: '무곡' },
      { offset: -5, name: '천동' },
      { offset: -8, name: '염정' },
    ];
    ziWeiGroup.forEach((star) => {
      let idx = this.norm(ziWeiIdx + star.offset);
      palaces[idx].stars.push({ name: star.name, type: 'jusung' });
    });

    // 천부계열 (특정 공식: 4 - 자미위치)
    const tianFuIdx = this.norm(4 - ziWeiIdx);
    palaces[tianFuIdx].stars.push({ name: '천부', type: 'jusung' });
    const tianFuGroup = [
      { offset: 1, name: '태음' },
      { offset: 2, name: '탐랑' },
      { offset: 3, name: '거문' },
      { offset: 4, name: '천상' },
      { offset: 5, name: '천량' },
      { offset: 6, name: '칠살' },
      { offset: 10, name: '파군' },
    ];
    tianFuGroup.forEach((star) => {
      let idx = this.norm(tianFuIdx + star.offset);
      palaces[idx].stars.push({ name: star.name, type: 'jusung' });
    });

    this.placeAuxiliaryStars(palaces, { ...lunarDate, month }, yearGan, yearZhi, mingIdx, bodyIdx);
    this.placeSahwa(palaces, yearGan);
    this.place12Sin(palaces, yearGan, yearZhi, bureauNum, gender);
    this.placeLuckIndicators(palaces, mingIdx, bureauNum, gender, yearGan, yearZhi);

    // 5. Assign Daeun Scope (Start - End Age) to Palaces
    const isYangYear = yearGanIdx % 2 === 0;
    const isMale = gender === 'male';
    const isClockwise = (isYangYear && isMale) || (!isYangYear && !isMale);
    const direction = isClockwise ? 1 : -1;

    for (let i = 0; i < 12; i++) {
      const currentIdx = this.norm(mingIdx + i * direction);
      const startAge = bureauNum + i * 10;
      const endAge = startAge + 9;
      palaces[currentIdx].daeunStart = startAge;
      palaces[currentIdx].daeunEnd = endAge;
    }

    // 인궁(寅宮, index 2)의 12사항궁 오프셋 (명궁으로부터 몇 번째 궁인지)
    // 이 오프셋은 유년 지지궁에서 유월 두군(정월)을 1:1로 매핑할 때 사용됩니다.
    // 명궁 기준 순행으로 인궁까지의 거리를 산출.
    const inGungOffset = this.norm(2 - mingIdx);

    return {
      palaces,
      mingIdx,
      bodyIdx,
      bureauNum,
      saju,
      mingGanIdx,
      lunarDate: lunarDate,
      lunarYearGan: yearGan,
      lunarYearZhi: yearZhi,
      adjustedMonth: month,
      inGungOffset: inGungOffset,
    };
  }

  placeLuckIndicators(palaces, mingIdx, bureauNum, gender, yearGan, yearZhi) {
    // 1. Daehan Range (Big Limit)
    const gIdx = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'].indexOf(yearGan);
    const isYangYear = gIdx % 2 === 0;
    const isMale = gender === 'male';
    const isClockwise = (isYangYear && isMale) || (!isYangYear && !isMale);
    const direction = isClockwise ? 1 : -1;

    // Ming Palace is the 1st Daehan
    for (let i = 0; i < 12; i++) {
      const currentAgeStart = bureauNum + i * 10;
      const currentAgeEnd = currentAgeStart + 9;
      const targetIdx = this.norm(mingIdx + i * direction);

      palaces[targetIdx].daehanRange = `${currentAgeStart} - ${currentAgeEnd}`;
    }

    // 2. Sohan Ages (Small Limit)
    // Starting palace depends on Birth Year Branch (yearZhi)
    const zIdx = this.branches.indexOf(yearZhi);
    const samhapGroup = zIdx % 4;

    let sohanStartIdx = 0;
    let sohanDir = isMale ? 1 : -1; // NamSunYeoYeok (Male CW, Female CCW)

    if (samhapGroup === 0) {
      // 신(8) 자(0) 진(4)
      sohanStartIdx = isMale ? 10 : 4; // 남: 술(10), 여: 진(4)
    } else if (samhapGroup === 1) {
      // 사(5) 유(9) 축(1)
      sohanStartIdx = isMale ? 7 : 1; // 남: 미(7), 여: 축(1)
    } else if (samhapGroup === 2) {
      // 인(2) 오(6) 술(10)
      sohanStartIdx = isMale ? 4 : 10; // 남: 진(4), 여: 술(10)
    } else if (samhapGroup === 3) {
      // 해(11) 묘(3) 미(7)
      sohanStartIdx = isMale ? 1 : 7; // 남: 축(1), 여: 미(7)
    }

    // Generate ages up to 108
    palaces.forEach((p) => (p.sohanAges = []));
    for (let age = 1; age <= 108; age++) {
      // Age 1 at Start. Age 2 at Start + Dir...
      // Offset for Age 1 is 0.
      const offset = age - 1;
      const idx = this.norm(sohanStartIdx + offset * sohanDir);
      palaces[idx].sohanAges.push(age);
    }
  }

  getBureauNumber(ganIdx, zhiIdx) {
    const gVal = Math.floor(ganIdx / 2) + 1;
    const zValMap = [1, 1, 2, 2, 3, 3, 1, 1, 2, 2, 3, 3];
    let sum = gVal + zValMap[zhiIdx];
    if (sum > 5) sum -= 5;
    const map = { 1: 3, 2: 4, 3: 2, 4: 6, 5: 5 };
    return map[sum];
  }

  placeAuxiliaryStars(palaces, lunarDate, yearGan, yearZhi, mingIdx, bodyIdx) {
    const month = lunarDate.month;
    const hour = lunarDate.hour;
    const gIdx = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'].indexOf(yearGan);
    const zIdx = this.branches.indexOf(yearZhi);

    // 길성
    palaces[this.norm(4 + (month - 1))].stars.push({ name: '좌보', type: 'gilsung' });
    palaces[this.norm(10 - (month - 1))].stars.push({ name: '우필', type: 'gilsung' });
    palaces[this.norm(10 - hour)].stars.push({ name: '문창', type: 'gilsung' });
    palaces[this.norm(4 + hour)].stars.push({ name: '문곡', type: 'gilsung' });

    let kui = -1,
      yue = -1;
    if ([0, 4, 6].includes(gIdx)) {
      kui = 1;
      yue = 7;
    } else if ([1, 5].includes(gIdx)) {
      kui = 0;
      yue = 8;
    } else if ([2, 3].includes(gIdx)) {
      kui = 11;
      yue = 9;
    } else if (gIdx === 7) {
      kui = 6;
      yue = 2;
    } else if ([8, 9].includes(gIdx)) {
      kui = 3;
      yue = 5;
    }
    if (kui >= 0) palaces[kui].stars.push({ name: '천괴', type: 'gilsung' });
    if (yue >= 0) palaces[yue].stars.push({ name: '천월', type: 'gilsung' });

    const luCunMap = { 0: 2, 1: 3, 2: 5, 3: 6, 4: 5, 5: 6, 6: 8, 7: 9, 8: 11, 9: 0 };
    const luCunIdx = luCunMap[gIdx];
    if (luCunIdx !== undefined) {
      palaces[luCunIdx].stars.push({ name: '록존', type: 'gilsung' });
      palaces[this.norm(luCunIdx + 1)].stars.push({ name: '경양', type: 'salsung' });
      palaces[this.norm(luCunIdx - 1)].stars.push({ name: '타라', type: 'salsung' });
    }

    // 살성
    palaces[this.norm(11 - hour)].stars.push({ name: '지공', type: 'salsung' });
    palaces[this.norm(11 + hour)].stars.push({ name: '지겁', type: 'salsung' });

    // 화성/영성 (sropee/ujamidusu.pas 공식 완벽 반영)
    let hwaBase = 0,
      yeongBase = 0;
    const samhap = zIdx % 4; // 0:신자진, 1:사유축, 2:인오술, 3:해묘미
    if (samhap === 0) {
      hwaBase = 2;
      yeongBase = 10;
    } // 신자진: 인(2)/술(10)
    else if (samhap === 1) {
      hwaBase = 3;
      yeongBase = 10;
    } // 사유축: 묘(3)/술(10)
    else if (samhap === 2) {
      hwaBase = 1;
      yeongBase = 3;
    } // 인오술: 축(1)/묘(3)
    else if (samhap === 3) {
      hwaBase = 9;
      yeongBase = 10;
    } // 해묘미: 유(9)/술(10)
    palaces[this.norm(hwaBase + hour)].stars.push({ name: '화성', type: 'salsung' });
    palaces[this.norm(yeongBase + hour)].stars.push({ name: '영성', type: 'salsung' });

    // 천마
    const maMap = { 0: 2, 1: 11, 2: 8, 3: 5 };
    palaces[maMap[samhap]].stars.push({ name: '천마', type: 'zabseong' });

    // 천형/천요
    palaces[this.norm(9 + (month - 1))].stars.push({ name: '천형', type: 'salsung' });
    palaces[this.norm(1 + (month - 1))].stars.push({ name: '천요', type: 'salsung' });

    this.placeJabseong(palaces, lunarDate, yearGan, yearZhi, mingIdx, bodyIdx);

    // 12신 (Doctor / Jangsaeng) - requires Bureau Number and Gender/Year info
    return; // Logic continued in calculate() where bureauNum is available
  }

  placeJabseong(palaces, lunarDate, yearGan, yearZhi, mingIdx, bodyIdx) {
    const month = lunarDate.month;
    const day = lunarDate.day;
    // yearGan, yearZhi passed via arguments

    const zIdx = this.branches.indexOf(yearZhi);

    // 1. 홍염 (Hongyeom) - Based on Year Gan
    // 갑/을-오, 병-인, 정-미, 무/기-진, 경-술, 신-유, 임-자, 계-신
    const hongyeomMap = {
      갑: 6,
      을: 8,
      병: 2,
      정: 7,
      무: 4,
      기: 4,
      경: 10,
      신: 9,
      임: 0,
      계: 8,
    };
    if (hongyeomMap[yearGan] !== undefined) {
      palaces[hongyeomMap[yearGan]].stars.push({ name: '홍염', type: 'zabseong' });
    }

    // 6. 천관/천복 (Cheongwan/Cheonbok) - Year Gan
    // User Rule for Cheonbok:
    // Gap(0) -> You(9), Yi(1) -> Shen(8), Bing(2) -> Zi(0), Ding(3) -> Hai(11), Mu(4) -> Mao(3)
    // Ji(5) -> Yin(2), Gyeong(6) -> Wu(6), Xin(7) -> Sa(5), Ren(8) -> Wu(6), Gui(9) -> Sa(5)
    const cheonbokMap = {
      갑: 9,
      을: 8,
      병: 0,
      정: 11,
      무: 3,
      기: 2,
      경: 6,
      신: 5,
      임: 6,
      계: 5,
    };
    // Cheongwan Map (Existing)
    // Gap: Mi(7), Yi: Chen(4), Bing: Sa(5), Ding: Yin(2), Mu: Mao(3)
    // Ji: You(9), Gyeong: Hai(11), Xin: You(9), Ren: Xu(10), Gui: Wu(6)
    const cheongwanMap = {
      갑: 7,
      을: 4,
      병: 5,
      정: 2,
      무: 3,
      기: 9,
      경: 11,
      신: 9,
      임: 10,
      계: 6,
    };

    if (cheongwanMap[yearGan] !== undefined)
      palaces[cheongwanMap[yearGan]].stars.push({ name: '천관', type: 'zabseong' });
    if (cheonbokMap[yearGan] !== undefined)
      palaces[cheonbokMap[yearGan]].stars.push({ name: '천복', type: 'zabseong' });

    // NEW: Cheonju (천주) - Based on Year Gan
    // 甲→巳(5), 乙→午(6), 丙→子(0), 丁→巳(5), 戊→午(6)
    // 己→申(8), 庚→寅(2), 辛→午(6), 壬→酉(9), 癸→亥(11)
    const cheonjuMap = {
      갑: 5,
      을: 6,
      병: 0,
      정: 8,
      무: 6,
      기: 8,
      경: 2,
      신: 6,
      임: 9,
      계: 11,
    };
    if (cheonjuMap[yearGan] !== undefined) {
      palaces[cheonjuMap[yearGan]].stars.push({ name: '천주', type: 'zabseong' });
    }

    // 2. 천희 (Cheonhui) - Based on Month (Norm(9 + Month)) ? No, usually Ujamidusu formula
    // Sropee: Cheonhui = Norm(9 + (Month-1)) same as Cheonhyeong? No.
    // Let's use Ujamidusu: Cheonhui is opposite of Hongran.
    // Hongran: Norm(1 + (Day-1))? No.
    // Standard ZWDS:
    // Hongran: Starts at 1(Chuk) counter-clockwise by Year Branch? No.
    // Hongran formula: Norm(3 - (YearBranchIdx)) ?
    // Let's use typical formula:
    // Hongran: Start at Mao(3), count counter-clockwise by Year Branch.
    // Cheonhui: Opposite of Hongran.
    const hongranIdx = this.norm(3 - zIdx);
    const cheonhuiIdx = this.norm(hongranIdx + 6);
    palaces[hongranIdx].stars.push({ name: '홍란', type: 'zabseong' });
    palaces[cheonhuiIdx].stars.push({ name: '천희', type: 'zabseong' });

    // 3. 고진/과숙 (Gojin/Gwasuk) - Lonely stars
    // Year Branch Group -> Gosin / Gwasuk
    // Hae/Zi/Chou (11,0,1) -> In(2) / Sul(10)
    // In/Mao/Chen (2,3,4) -> Sa(5) / Chuk(1)
    // Sa/Wu/Wei (5,6,7) -> Shin(8) / Chen(4)
    // Shin/You/Xu (8,9,10) -> Hae(11) / Mi(7)
    let gosin = -1,
      gwasuk = -1;
    if ([11, 0, 1].includes(zIdx)) {
      gosin = 2;
      gwasuk = 10;
    } else if ([2, 3, 4].includes(zIdx)) {
      gosin = 5;
      gwasuk = 1;
    } else if ([5, 6, 7].includes(zIdx)) {
      gosin = 8;
      gwasuk = 4;
    } else if ([8, 9, 10].includes(zIdx)) {
      gosin = 11;
      gwasuk = 7;
    }

    if (gosin !== -1) palaces[gosin].stars.push({ name: '고진', type: 'zabseong' });
    if (gwasuk !== -1) palaces[gwasuk].stars.push({ name: '과숙', type: 'zabseong' });

    // 4. 삼태/팔좌 (Samtae/Paljwa) - Based on JwaBo/WooPil
    // Left Assist (JwaBo) + Day, Right Assist (WooPil) - Day
    // JwaBo is at Norm(4 + (Month-1))
    // WooPil is at Norm(10 - (Month-1))
    const jwaboIdx = this.norm(4 + (month - 1));
    const woopilIdx = this.norm(10 - (month - 1));

    const samtaeIdx = this.norm(jwaboIdx + (day - 1));
    const paljwaIdx = this.norm(woopilIdx - (day - 1));

    palaces[samtaeIdx].stars.push({ name: '삼태', type: 'zabseong' });
    palaces[paljwaIdx].stars.push({ name: '팔좌', type: 'zabseong' });

    // 5. 은광/천귀 (Eungwang/Cheongwi) - Based on Chang/Gok
    // MunChang + (Day-1) = Eungwang (correction: -1 logic applies to day count)
    // MunGok + (Day-1) = Cheongwi
    // MunChang: Norm(10 - Hour)
    // MunGok: Norm(4 + Hour) -- Wait, Hour is 0-based index?
    // Logic check: Hour 0(Ja) -> Chang at 10(Sul). Correct.
    const changIdx = this.norm(10 - lunarDate.hour);
    const gokIdx = this.norm(4 + lunarDate.hour);

    const eungwangIdx = this.norm(changIdx + (day - 2)); // Day 1 = Index 0 offset? No, Day 1 is +0.
    // Formula: Chang + Day - 1.
    // e.g Day 1. Chang + 0.
    // My norm function handles modulo.

    palaces[this.norm(changIdx + day - 2)].stars.push({ name: '은광', type: 'zabseong' });
    palaces[this.norm(gokIdx + day - 2)].stars.push({ name: '천귀', type: 'zabseong' });

    // Cheongwan/Cheonbok moved to above (Step 1) to group YearGan stars.
    // Removing original block to avoid duplication.

    // --- Additional Jabseong (Mission 2026-02-06) ---
    // 1. Taebo (태보): Wu(6) + Hour - 1 (Clockwise)
    // 3. Yongji (용지): Chen(4) + YearBranchIndex (Clockwise)
    // 4. Bonggak (봉각): Xu(10) - YearBranchIndex (Counter-Clockwise)
    // Year Branch Index: Ja(0) -> Hae(11)
    const yearBranchIdx = this.branches.indexOf(yearZhi);
    const yjIdx = this.norm(4 + yearBranchIdx);
    palaces[yjIdx].stars.push({ name: '용지', type: 'zabseong' });
    const bgkIdx = this.norm(10 - yearBranchIdx);
    palaces[bgkIdx].stars.push({ name: '봉각', type: 'zabseong' });

    // 5. Cheondeok/Woldeok (천덕/월덕) - Removed from Center Japseong per User Request

    // 태보(太輔): 오(6) + 시 순행
    const tbIdx = this.norm(6 + lunarDate.hour);
    palaces[tbIdx].stars.push({ name: '태보', type: 'zabseong' });

    // 봉고(鳳誥): 인(2) + 시 순행
    // Verified: 사시(5) → 미(未,7)궁
    const bgIdx = this.norm(2 + lunarDate.hour);
    palaces[bgIdx].stars.push({ name: '봉고', type: 'zabseong' });

    // 천공(天空): 생년 지지의 바로 다음 지지에 배치
    // 예: 卯(3)년생 → 辰(4)궁, 子(0)년생 → 丑(1)궁
    const cheongongIdx = this.norm(yearBranchIdx + 1);
    palaces[cheongongIdx].stars.push({ name: '천공', type: 'zabseong' });

    // NEW: Nyeonhae (년해) - Starts at Xu(10), Counter-Clockwise by YearBranch
    // Formula: (10 - YearBranchIdx)
    const nyeonhaeIdx = this.norm(10 - yearBranchIdx);
    palaces[nyeonhaeIdx].stars.push({ name: '년해', type: 'zabseong' });

    // NEW: Daemo (대모 - 잡성) - 생년 지지의 원진(寅酉, 卯申, 辰亥, 巳戌, 丑午, 子未) 궁에 배치
    // 子(0)→未(7), 丑(1)→午(6), 寅(2)→酉(9), 卯(3)→申(8), 辰(4)→亥(11), 巳(5)→戌(10)
    // 午(6)→丑(1), 未(7)→子(0), 申(8)→卯(3), 酉(9)→寅(2), 戌(10)→巳(5), 亥(11)→辰(4)
    const daemoMap = [7, 6, 9, 8, 11, 10, 1, 0, 3, 2, 5, 4];
    const daemoIdx = daemoMap[yearBranchIdx];
    palaces[daemoIdx].stars.push({ name: '대모', type: 'zabseong' });

    // 7. Cheonjae (천재): Ming Palace + YearBranchIndex
    // 8. Cheonsu (천수): Body Palace + YearBranchIndex
    const cjIdx = this.norm(mingIdx + yearBranchIdx);
    palaces[cjIdx].stars.push({ name: '천재', type: 'zabseong' });
    const csIdx = this.norm(bodyIdx + yearBranchIdx);
    palaces[csIdx].stars.push({ name: '천수', type: 'zabseong' });

    // 9. Cheonsang (천상): Friend (Nobok) Palace
    // 10. Cheonsa (천사): Health (Jil-aek) Palace
    // Calculating relative to Ming. Ming(1) -> Nobok(6), Jilaek(8) ?
    // Ming is at 'mingIdx' (1-12).
    // 0: Ming, 1: Parent, 2: Fude, 3: Tianzhai, 4: Guanlu, 5: Nobok
    // Wait, standard ZWDS sequence backward?
    // My code: Ming is starting point.
    // Sequence: Ming, Xiung, Fu, Zi, Cai, Ji, Qian, Nu, Guan, Tian, Fu, Fu.
    // Ming(0), Brother(11), Spouse(10)...
    // Let's use the 'palaceNames' array logic correctly.
    // In previous implementation:
    // Ming is at standard position. The array `palaces` is [Rat, Ox...].
    // We know which one is Ming.
    // To find Nobok: Ming + 5? No.
    // Sequence: Ming->Sibling->Spouse->Child->Wealth->Health->Travel->Friend->Career->Property->Fortune->Parent?
    // Let's check `assignPalaceNames`.
    // Names: ['명궁', '형제', '부처', '자녀', '재백', '질액', '천이', '노복', '관록', '전택', '복덕', '부모']
    // They are placed Counter-Clockwise from Ming.
    // Ming(i), Brother(i-1), Spouse(i-2)...
    // So Nobok (Friend) is Ming - 7? Or Ming + 5?
    // Ming(0). Bk(11), Sp(10), Ch(9), Wl(8), Hl(7), Tr(6), Fr(5).
    // So Nobok is at index `norm(Ming - 7)`? No.
    // Ming(0). 1(Bro), 2(Spo)... No, standard is CCW.
    // 0(Ming). 11(Bro). 10(Spo). 9(Chi). 8(Wea). 7(Hea). 6(Tra). 5(Fri).
    // Yes. So Friend is at `norm(mingIdx - 1 - 7)`?
    // Let's rely on finding by name if possible, or use the offset.
    // Nobok is -7 (or +5). Jilaek is -5 (or +7).
    // Wait. 0(M), 11(Br), 10(Sp), 9(Ch), 8(We), 7(Ji-Health), 6(Tr), 5(No-Friend).
    // So Jilaek is Health.
    // Place Cheonsang at Nobok? (Friend). Place Cheonsa at Jilaek? (Health).
    // Let's check logic: "Cheonsang at Nobok, Cheonsa at Jilaek" is a specific rule.
    // Often Cheonsang/Cheonsa are associated with "Yang/Yin" helpers, but let's stick to the requested names.
    // Wait, "Cheonsang" here might be "Heavenly Injury"? ("Cheon-Sang" vs "Cheon-Sang").
    // "Cheon-Sang"(Angel) is good. "Cheon-Sang"(Injury) is bad.
    // Usually paired with "Cheon-Sa"(Angel/Envoy) or "Cheon-Sa"(Sorrow)?
    // "Cheonsa" usually means "Heavenly Messenger" (Angel).
    // "Cheonsang" usually means "Heavenly Cabinet" (Angel).
    // If they are the "Angels", they are Nobles.
    // If they are specific ZWDS minor stars:
    // "Cheonsang" (Heavenly Injury) and "Cheonsa" (Heavenly Envoy/Sorrow).
    // These are usually placed at Nobok and Jilaek.
    // Let's assume these are the ones.

    // Nobok (Friend): CCW 5th from Ming (inclusive) -> Index Ming - 5?
    // Ming(0). 1(Bro, -1), 2(Spo, -2), 3(Ch, -3), 4(Wea, -4), 5(Hea, -5).
    // 6(Tra, -6). 7(Fri, -7).
    // My `assignPalaceNames` array:
    // ['명궁', '형제', '부처', '자녀', '재백', '질액', '천이', '노복', '관록', '전택', '복덕', '부모']
    // It iterates CCW.
    // so palaces[mingIdx].name = '명궁'.
    // palaces[mingIdx - 1].name = '형제'.
    // palaces[mingIdx - 5].name = '질액' (Health). -> Cheonsa
    // palaces[mingIdx - 7].name = '노복' (Friend). -> Cheonsang

    // 9. Cheonsang (천상): Friend (Nobok) Palace (Clockwise index 5)
    // 10. Cheonsa (천사): Health (Jil-aek) Palace (Clockwise index 7)
    // Palace Order: Ming(0), Parent(1), Fude(2), Tianzhai(3), Guanlu(4), Nobok(5), Qianyi(6), Jilaek(7)...

    const friendIdx = this.norm(mingIdx + 5);
    palaces[friendIdx].stars.push({ name: '천상', type: 'zabseong' }); // Nobok (Friend)

    const healthIdx = this.norm(mingIdx + 7);
    palaces[healthIdx].stars.push({ name: '천사', type: 'zabseong' }); // Jilaek (Health)

    // 11. Sungong (순공): 육십갑자 순 기준, 연간 음양에 따라 2개 공망지 중 1개만 표시
    // ① 순의 2개 공망지 계산: 해당 순(甲X순)의 첫째 갑자에서 빠진 2개 지지
    //    Formula: void1 = (yearGanIdx 기준 순 오프셋에 따라 결정)
    //    순 오프셋: zOff = (yearBranchIdx - yearGanIdx + 12) % 12
    //    공망 2개: void_yang = (zOff + 10) % 12, void_yin = (zOff + 11) % 12
    //    양지지(짝수 인덱스): 자(0),인(2),진(4),오(6),신(8),술(10)
    //    음지지(홀수 인덱스): 축(1),묘(3),사(5),미(7),유(9),해(11)
    // ② 1개 선정: 연간이 양년(甲丙戊庚壬)이면 양지지, 음년(乙丁己辛癸)이면 음지지
    const gIdx = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'].indexOf(yearGan);
    const isYangGan = gIdx % 2 === 0; // 甲(0),丙(2),戊(4),庚(6),壬(8) = 양
    const zOff = (yearBranchIdx - gIdx + 12) % 12;
    const voidYang = (zOff + 10) % 12; // 양지지 (짝수 인덱스)
    const voidYin = (zOff + 11) % 12; // 음지지 (홀수 인덱스)
    // 연간 음양 → 동일 음양의 공망지 1개만 선택
    const sungongIdx = isYangGan ? voidYang : voidYin;
    palaces[sungongIdx].stars.push({ name: '순공', type: 'zabseong' });

    // 12. Jeolgong (절공): 연간 기준, 연간 음양에 따라 2개 절공지 중 1개만 표시
    // 연간  : 절공 2개 지지       → 양년: 앞 지지(양궁), 음년: 뒤 지지(음궁)
    // 甲己  : 申(8), 酉(9)        → 甲(양)→申(8), 己(음)→酉(9)
    // 乙庚  : 午(6), 未(7)        → 乙(음)→未(7), 庚(양)→午(6)
    // 丙辛  : 辰(4), 巳(5)        → 丙(양)→辰(4), 辛(음)→巳(5)
    // 丁壬  : 寅(2), 卯(3)        → 丁(음)→卯(3), 壬(양)→寅(2)
    // 戊癸  : 子(0), 丑(1)        → 戊(양)→子(0), 癸(음)→丑(1)
    // 최종 매핑 (연간 인덱스 0~9):
    //   甲(0)→8(申), 乙(1)→7(未), 丙(2)→4(辰), 丁(3)→3(卯), 戊(4)→0(子)
    //   己(5)→9(酉), 庚(6)→6(午), 辛(7)→5(巳), 壬(8)→2(寅), 癸(9)→1(丑)
    const jeolgongMap = [8, 7, 4, 3, 0, 9, 6, 5, 2, 1];
    const jgIdx = jeolgongMap[gIdx];
    if (jgIdx !== undefined) {
      palaces[jgIdx].stars.push({ name: '절공', type: 'zabseong' });
    }

    // --- Additional Jabseong (User Request 2026-02-12) ---

    // 13. Cheongok (천곡): (6 - YearBranch + 12) % 12
    const cheongokIdx = this.norm(6 - yearBranchIdx + 12);
    palaces[cheongokIdx].stars.push({ name: '천곡', type: 'zabseong' });

    // 14. Cheonheo (천허): (6 + YearBranch) % 12
    const cheonheoIdx = this.norm(6 + yearBranchIdx);
    palaces[cheonheoIdx].stars.push({ name: '천허', type: 'zabseong' });

    // 15. Pasae (파쇄): [5, 1, 9][YearBranch % 3]
    const pasaeMap = [5, 1, 9];
    const pasaeIdx = pasaeMap[yearBranchIdx % 3];
    palaces[pasaeIdx].stars.push({ name: '파쇄', type: 'zabseong' });

    // 16. Biryeom (비렴 - 잡성) - Based on Year Branch
    // 표에 따른 매핑:
    // 子(0)→申(8), 丑(1)→酉(9), 寅(2)→戌(10), 卯(3)→巳(5), 辰(4)→午(6), 巳(5)→未(7)
    // 午(6)→寅(2), 未(7)→卯(3), 申(8)→辰(4), 酉(9)→亥(11), 戌(10)→子(0), 亥(11)→丑(1)
    const biryeomMap = [8, 9, 10, 5, 6, 7, 2, 3, 4, 11, 0, 1];
    const biryeomIdx = biryeomMap[yearBranchIdx];
    palaces[biryeomIdx].stars.push({ name: '비렴', type: 'zabseong' });

    // 17. Cheonmu (천무 - Month): [5, 8, 2, 11][(Month-1) % 4]
    const cheonmuMap = [5, 8, 2, 11];
    const cheonmuIdx = cheonmuMap[(month - 1) % 4];
    palaces[cheonmuIdx].stars.push({ name: '천무', type: 'zabseong' });

    // 18. Cheonwol (천월 - Month): User Mapping
    // 1->Xu(10), 2->Si(5), 3->Chen(4), 4->Yin(2), 5->Wei(7), 6->Mao(3)
    // 7->Hai(11), 8->Wei(7), 9->Yin(2), 10->Wu(6), 11->Xu(10), 12->Yin(2)
    const monthCheonwolMap = [10, 5, 4, 2, 7, 3, 11, 7, 2, 6, 10, 2];
    const monthCheonwolIdx = monthCheonwolMap[month - 1];
    // Corrected Name: 천월(잡성) [天月] - To distinguish from Gilseong and avoid brightness
    palaces[monthCheonwolIdx].stars.push({ name: '천월', type: 'zabseong' });

    // 19. Eumsal (음살 - Month): [2, 0, 10, 8, 6, 4][(Month-1) % 6]
    const eumsalMap = [2, 0, 10, 8, 6, 4];
    const eumsalIdx = eumsalMap[(month - 1) % 6];
    palaces[eumsalIdx].stars.push({ name: '음살', type: 'zabseong' });

    // 20. Haesin (해신 - Month): [8, 8, 10, 10, 0, 0, 2, 2, 4, 4, 6, 6][Month-1]
    const haesinMap = [8, 8, 10, 10, 0, 0, 2, 2, 4, 4, 6, 6];
    const haesinIdx = haesinMap[month - 1];
    palaces[haesinIdx].stars.push({ name: '해신', type: 'zabseong' });
  }

  place12Sin(palaces, yearGan, yearZhi, bureauNum, gender) {
    // Year Info
    const gIdx = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'].indexOf(yearGan);
    const zIdx = this.branches.indexOf(yearZhi);
    const isYangYear = gIdx % 2 === 0;
    const isMale = gender === 'male';
    const isClockwise = (isYangYear && isMale) || (!isYangYear && !isMale);
    const direction = isClockwise ? 1 : -1;

    // 1. Doctor 12-sin (박사 12신) - Left Column
    // Starts at Rokjon. Direction by Yin/Yang Gender (YangMale/YinFemale -> CW, else CCW)
    const luCunMap = { 0: 2, 1: 3, 2: 5, 3: 6, 4: 5, 5: 6, 6: 8, 7: 9, 8: 11, 9: 0 };
    const rokjonIdx = luCunMap[gIdx];

    if (rokjonIdx !== undefined) {
      const doctorStars = [
        '박사',
        '역사',
        '청룡',
        '소모',
        '장군',
        '주서',
        '비렴',
        '희신',
        '병부',
        '대모',
        '복병',
        '관부',
      ];
      doctorStars.forEach((name, i) => {
        const idx = this.norm(rokjonIdx + i * direction);
        palaces[idx].stars.push({ name: name, type: 'doctor12' });
      });
    }

    // 2. Jangseong 12-sin (장성/장전 12신) - 2nd Column
    // Based on Year Branch Samhap (Triad) Center.
    // Samhap: (Shin-Zi-Chen)->Zi, (In-Wu-Xu)->Wu, (Hae-Mao-Wei)->Mao, (Si-You-Chou)->You.
    // Starts at Center of Samhap. Always Clockwise.
    let jangseongStart = 0;
    const samhapGroup = zIdx % 4; // 0:Shin(8), 1:You(9, wait. Shin=8. 8%4=0. Correct is Shin-Zi-Chen?)
    // Group 0: Shen-Zi-Chen (Water) -> Center Zi(0)
    // Group 1: Si-You-Chou (Metal) -> Center You(9)
    // Group 2: Yin-Wu-Xu (Fire) -> Center Wu(6)
    // Group 3: Hai-Mao-Wei (Wood) -> Center Mao(3)

    if (samhapGroup === 0)
      jangseongStart = 0; // Zi
    else if (samhapGroup === 1)
      jangseongStart = 9; // You
    else if (samhapGroup === 2)
      jangseongStart = 6; // Wu
    else if (samhapGroup === 3) jangseongStart = 3; // Mao

    const jangseongStars = [
      '장성',
      '반안',
      '세역',
      '식신',
      '화개',
      '겁살',
      '재살',
      '천살',
      '지배',
      '함지',
      '월살',
      '망신',
    ];
    // User Request: Remove Hwagae (화개) and Hamji/Nyeonsal (년살) from Center Area (Jangseong 12-sin)

    jangseongStars.forEach((name, i) => {
      const idx = this.norm(jangseongStart + i); // Always Clockwise
      palaces[idx].stars.push({ name: name, type: 'jangseong12' });
    });

    // 3. Taese 12-sin (태세 12신) - 3rd Column
    // Starts at Year Branch. Always Clockwise.
    const taeseStars = [
      '태세',
      '회기',
      '상문',
      '관색',
      '관부(태세)',
      '소모',
      '세파',
      '용덕',
      '백호',
      '천덕',
      '조객',
      '병부',
    ];
    taeseStars.forEach((name, i) => {
      const idx = this.norm(zIdx + i);
      palaces[idx].stars.push({ name: name, type: 'taese12' });
    });

    // 4. Jangsaeng 12-sin (장생 12신) - 4th Column (Rightmost)
    // Starts based on Bureau. Direction by Gender/YearStem (NamSunYeoYeok logic).
    // Bureau 2(Water/Earth?): Shen(8). 3(Wood): Hai(11). 4(Metal): Si(5). 6(Fire): Yin(2).
    // Earth Bureau(5)? Usually follows Water or Fire. Sropee uses Water(Shen) for Earth.
    let jsStart = 0;
    switch (bureauNum) {
      case 2:
        jsStart = 8;
        break; // Water -> Shen
      case 3:
        jsStart = 11;
        break; // Wood -> Hai
      case 4:
        jsStart = 5;
        break; // Metal -> Si
      case 5:
        jsStart = 8;
        break; // Earth -> Shen (Common variation)
      case 6:
        jsStart = 2;
        break; // Fire -> Yin
    }

    const jangsaengStars = [
      '장생',
      '목욕',
      '관대',
      '건록',
      '제왕',
      '쇠',
      '병',
      '사',
      '묘',
      '절',
      '태',
      '양',
    ];
    jangsaengStars.forEach((name, i) => {
      const idx = this.norm(jsStart + i * direction);
      palaces[idx].stars.push({ name: name, type: 'jangsaeng12' });
    });
  }

  placeSahwa(palaces, yearGan) {
    const sahwaStars = this.sahwaMap[yearGan];
    if (!sahwaStars) return;
    const sahwaTypes = ['록', '권', '과', '기'];
    palaces.forEach((palace) => {
      palace.stars.forEach((star) => {
        const sIdx = sahwaStars.indexOf(star.name);
        if (sIdx >= 0) star.sahwa = sahwaTypes[sIdx];
      });
    });
  }

  /**
   * 운세(대한, 소한, 유년) 해당 궁 계산
   * @param {number} mingIdx 명궁 인덱스
   * @param {number} bureauNum 국수 (2~6)
   * @param {string} gender 'male'|'female'
   * @param {string} yearGan '갑'~'계' (Origin Year Stem for Direction)
   * @param {string} yearZhi '자'~'해' (Origin Year Branch)
   * @param {number} jamidusuAge 현재 나이
   * @param {string} targetYearZhi '자'~'해' (Target Year Branch)
   */
  getLuckPalaces(mingIdx, bureauNum, gender, yearGan, yearZhi, jamidusuAge, targetYearZhi) {
    // 1. Daehan
    // Direction
    const gIdx = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'].indexOf(yearGan);
    const isYangYear = gIdx % 2 === 0;
    const isMale = gender === 'male';
    const isClockwise = (isYangYear && isMale) || (!isYangYear && !isMale);
    const direction = isClockwise ? 1 : -1;

    // Which Daehan?
    // 1st: BureauNum ~ BureauNum+9
    // 2nd: BureauNum+10 ~ ...
    // Index calculation:
    // floor((Age - BureauNum) / 10) -> step
    // if Age < BureauNum, it's Pre-Daehan (Childhood). Usually mapped to Ming or Parent?
    // Standard: Before Daehan, check Childhood Limits. Ignoring for now or map to Ming.

    let daehanIdx = -1;
    let daehanStartAge = bureauNum;
    if (jamidusuAge >= bureauNum) {
      const step = Math.floor((jamidusuAge - bureauNum) / 10);
      daehanIdx = this.norm(mingIdx + step * direction);
      daehanStartAge = bureauNum + step * 10;
    } else {
      // Childhood (Pre-Daehan)
      daehanIdx = mingIdx; // Fallback
    }

    // 2. Sohan (Small Limit)
    const zIdx = this.branches.indexOf(yearZhi);
    const samhapGroup = zIdx % 4;

    let sohanStartIdx = 0;
    let sohanDir = isMale ? 1 : -1;

    if (samhapGroup === 0) sohanStartIdx = isMale ? 10 : 4;
    else if (samhapGroup === 1) sohanStartIdx = isMale ? 7 : 1;
    else if (samhapGroup === 2) sohanStartIdx = isMale ? 4 : 10;
    else if (samhapGroup === 3) sohanStartIdx = isMale ? 1 : 7;

    const sohanIdx = this.norm(sohanStartIdx + (jamidusuAge - 1) * sohanDir);

    // 3. Yunyeon (Annual Limit)
    // Simply match the palace with the Target Year Branch.
    // My palaces struct has fixed branches? No, `palaces` array is [0..11] where 0=Rat..11=Pig?
    // Wait, calculate() assigns branches:
    // "const branches = ['자', '축'...]... palaces[i].branch = branches[i]"
    // So index 0 is always Rat(Zi), 1 is Ox...
    // So targetYearZhi '자' -> index 0.
    const yunyeonIdx = this.branches.indexOf(targetYearZhi);

    return {
      daehan: { idx: daehanIdx, label: `${daehanStartAge}~${daehanStartAge + 9}` },
      sohan: { idx: sohanIdx, label: '소한' },
      yunyeon: { idx: yunyeonIdx, label: `유년(${targetYearZhi})` },
    };
  }

  /**
   * 유월(Monthly Limit) 각 달의 궁 위치 계산 (인궁 기준법)
   * 정통 두군 연출법(유년지지-생월+생시)과 선천 명궁 산출법(인궁+생월-생시)의
   * 수학적 대칭성을 활용하여, '선천 명반 인궁의 사항궁 인덱스'를 유년 지지에 그대로 더함.
   * @param {number} targetYearZhiIdx 유년 지지 인덱스 (0:자 ~ 11:해)
   * @param {number} inGungOffset 선천 인궁(寅宮)의 명궁 기준 오프셋
   * @returns {Array} 길이 12의 배열. index + 1 이 월(Month), value 가 palaceIdx.
   */
  getYuwolPalaces(targetYearZhiIdx, inGungOffset) {
    // 두군(음력 1월)의 위치는 유년 명궁(태세궁) 위치에서 인궁 오프셋만큼 순행한 위치와 항상 동일함.
    const month1Idx = this.norm(targetYearZhiIdx + inGungOffset);

    const yuwolPalaces = [];
    // 음력 1월부터 12월까지 순행
    for (let i = 0; i < 12; i++) {
      yuwolPalaces.push({
        month: i + 1,
        idx: this.norm(month1Idx + i),
      });
    }
    return yuwolPalaces;
  }

  /**
   * 대한 별 (Daehan Flow Stars) 계산
   * @param {string} daehanGan 대한 천간 ('갑'~'계')
   * @param {string} daehanZhi 대한 지지 ('자'~'해')
   * @returns {Array} 대한 별 객체 배열 [{ name, type: 'daehan', palaceIdx, branchName }]
   */
  getDaehanStars(daehanGan, daehanZhi) {
    const stars = [];
    const gIdx = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'].indexOf(daehanGan);
    const zIdx = this.branches.indexOf(daehanZhi);

    // 1. 대한 록존/경양/타라 (Lu Cun / Qing Yang / Tuo Luo) - 천간 기준
    const luCunMap = { 0: 2, 1: 3, 2: 5, 3: 6, 4: 5, 5: 6, 6: 8, 7: 9, 8: 11, 9: 0 };
    const luCunIdx = luCunMap[gIdx];
    if (luCunIdx !== undefined) {
      stars.push({ name: '대한 록존', type: 'daehan', palaceIdx: this.norm(luCunIdx) });
      stars.push({ name: '대한 경양', type: 'daehan', palaceIdx: this.norm(luCunIdx + 1) });
      stars.push({ name: '대한 타라', type: 'daehan', palaceIdx: this.norm(luCunIdx - 1) });
    }

    // 2. 대한 천괴/천월 (Tian Kui / Tian Yue) - 천간 기준
    let kui = -1,
      yue = -1;
    if ([0, 4, 6].includes(gIdx)) {
      kui = 1;
      yue = 7;
    } // 갑무경 - 축미
    else if ([1, 5].includes(gIdx)) {
      kui = 0;
      yue = 8;
    } // 을기 - 자신
    else if ([2, 3].includes(gIdx)) {
      kui = 11;
      yue = 9;
    } // 병정 - 해유
    else if (gIdx === 7) {
      kui = 6;
      yue = 2;
    } // 신 - 오인
    else if ([8, 9].includes(gIdx)) {
      kui = 3;
      yue = 5;
    } // 임계 - 묘사

    if (kui >= 0) stars.push({ name: '대한 천괴', type: 'daehan', palaceIdx: this.norm(kui) });
    if (yue >= 0) stars.push({ name: '대한 천월', type: 'daehan', palaceIdx: this.norm(yue) });

    // 3. 대한 천마 (Tian Ma) - 대한 지지 기준 (삼합 충)
    // 인오술(2,6,10) -> 신(8)
    // 신자진(8,0,4) -> 인(2)
    // 사유축(5,9,1) -> 해(11)
    // 해묘미(11,3,7) -> 사(5)
    const samhapGroup = zIdx % 4; // 0:자, 1:축... No.
    // Shin(8)-Zi(0)-Chen(4) % 4 -> 0.
    // Si(5)-You(9)-Chou(1) % 4 -> 1.
    // In(2)-Wu(6)-Xu(10) % 4 -> 2.
    // Hae(11)-Mao(3)-Wei(7) % 4 -> 3.
    let maIdx = -1;
    if (samhapGroup === 0)
      maIdx = 2; // ShinZiChen -> In
    else if (samhapGroup === 1)
      maIdx = 11; // SiYouChou -> Hae
    else if (samhapGroup === 2)
      maIdx = 8; // InWuXu -> Shin
    else if (samhapGroup === 3) maIdx = 5; // HaeMaoWei -> Si
    // (천마 배치는 맨 마지막으로 이동)

    // 4. 대한 문창/문곡 (Wen Chang / Wen Qu) - 천간 기준 (유창/유곡 공식)
    // 유창: 갑사 을오 병신 정유 무신 기유 경해 신자 임인 계묘
    // 유곡: 갑유 을신 병오 정사 무오 기사 경묘 신인 임자 계해
    const changMap = [5, 6, 8, 9, 8, 9, 11, 0, 2, 3]; // Map GIdx to BranchIdx
    const gokMap = [9, 8, 6, 5, 6, 5, 3, 2, 0, 11];

    const cIdx = changMap[gIdx];
    const kIdx = gokMap[gIdx];

    if (cIdx !== undefined)
      stars.push({ name: '대한 문창', type: 'daehan', palaceIdx: this.norm(cIdx) });
    if (kIdx !== undefined)
      stars.push({ name: '대한 문곡', type: 'daehan', palaceIdx: this.norm(kIdx) });

    // 5. 대한 천마 (배치 순서를 맨 마지막으로 강제)
    if (maIdx !== -1)
      stars.push({ name: '대한 천마', type: 'daehan', palaceIdx: this.norm(maIdx) });

    return stars.map((star) => ({ ...star, name: star.name.trim() }));
  }

  /**
   * 유년 별 (Yunyeon Flow Stars) 계산
   * @param {string} yunyeonGan 유년 천간
   * @param {string} yunyeonZhi 유년 지지
   * @param {string} gender 성별 ('male'|'female')
   * @returns {Array} 유년 별 객체 배열 [{ name, type, palaceIdx }]
   */
  getYunyeonStars(yunyeonGan, yunyeonZhi, gender = 'male') {
    const stars = [];
    const gIdx = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'].indexOf(yunyeonGan);
    const zIdx = this.branches.indexOf(yunyeonZhi);

    // 1. 유년 록존/경양/타라 (Lu Cun / Qing Yang / Tuo Luo) - 천간 기준
    const luCunMap = { 0: 2, 1: 3, 2: 5, 3: 6, 4: 5, 5: 6, 6: 8, 7: 9, 8: 11, 9: 0 };
    const luCunIdx = luCunMap[gIdx];
    if (luCunIdx !== undefined) {
      stars.push({ name: '유년 록존', type: 'yunyeon', palaceIdx: this.norm(luCunIdx) });
      stars.push({ name: '유년 경양', type: 'yunyeon', palaceIdx: this.norm(luCunIdx + 1) });
      stars.push({ name: '유년 타라', type: 'yunyeon', palaceIdx: this.norm(luCunIdx - 1) });
    }

    // 2. 유년 천괴/천월 (Tian Kui / Tian Yue) - 천간 기준
    let kui = -1,
      yue = -1;
    if ([0, 4, 6].includes(gIdx)) {
      kui = 1;
      yue = 7;
    } // 갑무경 - 축미
    else if ([1, 5].includes(gIdx)) {
      kui = 0;
      yue = 8;
    } // 을기 - 자신
    else if ([2, 3].includes(gIdx)) {
      kui = 11;
      yue = 9;
    } // 병정 - 해유
    else if (gIdx === 7) {
      kui = 6;
      yue = 2;
    } // 신 - 오인
    else if ([8, 9].includes(gIdx)) {
      kui = 3;
      yue = 5;
    } // 임계 - 묘사

    if (kui >= 0) stars.push({ name: '유년 천괴', type: 'yunyeon', palaceIdx: this.norm(kui) });
    if (yue >= 0) stars.push({ name: '유년 천월', type: 'yunyeon', palaceIdx: this.norm(yue) });

    // 3. 유년 천마 (Tian Ma) - 유년 지지 기준 (삼합 충)
    const samhapGroup = zIdx % 4;
    let maIdx = -1;
    if (samhapGroup === 0)
      maIdx = 2; // ShinZiChen -> In
    else if (samhapGroup === 1)
      maIdx = 11; // SiYouChou -> Hae
    else if (samhapGroup === 2)
      maIdx = 8; // InWuXu -> Shin
    else if (samhapGroup === 3) maIdx = 5; // HaeMaoWei -> Si
    // (천마 배치는 맨 마지막으로 이동)

    // 4. 유년 문창/문곡 (Wen Chang / Wen Qu) - 천간 기준 (유창/유곡 공식)
    const changMap = [5, 6, 8, 9, 8, 9, 11, 0, 2, 3]; // Map GIdx to BranchIdx
    const gokMap = [9, 8, 6, 5, 6, 5, 3, 2, 0, 11];

    const cIdx = changMap[gIdx];
    const kIdx = gokMap[gIdx];

    if (cIdx !== undefined)
      stars.push({ name: '유년 문창', type: 'yunyeon', palaceIdx: this.norm(cIdx) });
    if (kIdx !== undefined)
      stars.push({ name: '유년 문곡', type: 'yunyeon', palaceIdx: this.norm(kIdx) });

    // 5. 유년 홍란/천희 (Hongran / Tianxi) - 유년 지지 기준
    // Hongran: Norm(3 - YunyeonBranchIdx)
    // Tianxi: Norm(Hongran + 6)
    const hongranIdx = this.norm(3 - zIdx);
    const cheonhuiIdx = this.norm(hongranIdx + 6);
    stars.push({ name: '유년 홍란', type: 'yunyeon', palaceIdx: hongranIdx });
    stars.push({ name: '유년 천희', type: 'yunyeon', palaceIdx: cheonhuiIdx });

    // 6. 유년 박사 12신 (Doctor 12) - Based on Yunyeon Lu Cun
    // 방향: 유년 천간이 양(陽)이면 순행, 음(陰)이면 역행 — 성별 무관
    const isYangYear = gIdx % 2 === 0;
    const direction = isYangYear ? 1 : -1;

    if (luCunIdx !== undefined) {
      const doctorStars = [
        '박사',
        '역사',
        '청룡',
        '소모',
        '장군',
        '주서',
        '비렴',
        '희신',
        '병부',
        '대모',
        '복병',
        '관부',
      ];
      doctorStars.forEach((name, i) => {
        const idx = this.norm(luCunIdx + i * direction);
        stars.push({ name: name, type: 'yunyeon_doctor12', palaceIdx: idx });
      });
    }

    // 7. 유년 장성 12신 (Jangseong 12) - Based on Yunyeon Branch Samhap
    let jangseongStart = 0;
    if (samhapGroup === 0)
      jangseongStart = 0; // Zi
    else if (samhapGroup === 1)
      jangseongStart = 9; // You
    else if (samhapGroup === 2)
      jangseongStart = 6; // Wu
    else if (samhapGroup === 3) jangseongStart = 3; // Mao
    const jangseongStars = [
      '장성',
      '반안',
      '세역',
      '식신',
      '화개',
      '겁살',
      '재살',
      '천살',
      '지배',
      '함지',
      '월살',
      '망신',
    ];
    jangseongStars.forEach((name, i) => {
      const idx = this.norm(jangseongStart + i);
      stars.push({ name: name, type: 'yunyeon_jangseong12', palaceIdx: idx });
    });

    // 8. 유년 태세 12신 (Taese 12) - Based on Yunyeon Branch
    const taeseStars = [
      '태세',
      '회기',
      '상문',
      '관색',
      '관부(태세)',
      '소모',
      '세파',
      '용덕',
      '백호',
      '천덕',
      '조객',
      '병부',
    ];

    taeseStars.forEach((name, i) => {
      const idx = this.norm(zIdx + i);
      stars.push({ name: name, type: 'yunyeon_taese12', palaceIdx: idx });
    });

    // 9. 유년 천마 (배치 순서를 맨 마지막으로 강제)
    if (maIdx !== -1)
      stars.push({ name: '유년 천마', type: 'yunyeon', palaceIdx: this.norm(maIdx) });

    return stars.map((star) => ({ ...star, name: star.name.trim() }));
  }

  /**
   * 유월 별 (Yuwol Flow Stars) 계산
   * @param {string} yuwolGan 유월 천간
   * @param {string} yuwolZhi 유월 지지
   * @returns {Array} 유월 별 객체 배열
   */
  getYuwolStars(yuwolGan, yuwolZhi, gender = 'male') {
    const stars = [];
    const gIdx = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'].indexOf(yuwolGan);
    const zIdx = this.branches.indexOf(yuwolZhi);

    // 1. 유월 록존/경양/타라
    const luCunMap = { 0: 2, 1: 3, 2: 5, 3: 6, 4: 5, 5: 6, 6: 8, 7: 9, 8: 11, 9: 0 };
    const luCunIdx = luCunMap[gIdx];
    if (luCunIdx !== undefined) {
      stars.push({ name: '유월 록존', type: 'yuwol', palaceIdx: this.norm(luCunIdx) });
      stars.push({ name: '유월 경양', type: 'yuwol', palaceIdx: this.norm(luCunIdx + 1) });
      stars.push({ name: '유월 타라', type: 'yuwol', palaceIdx: this.norm(luCunIdx - 1) });
    }

    // 2. 유월 천괴/천월
    let kui = -1,
      yue = -1;
    if ([0, 4, 6].includes(gIdx)) {
      kui = 1;
      yue = 7;
    } else if ([1, 5].includes(gIdx)) {
      kui = 0;
      yue = 8;
    } else if ([2, 3].includes(gIdx)) {
      kui = 11;
      yue = 9;
    } else if (gIdx === 7) {
      kui = 6;
      yue = 2;
    } else if ([8, 9].includes(gIdx)) {
      kui = 3;
      yue = 5;
    }

    if (kui >= 0) stars.push({ name: '유월 천괴', type: 'yuwol', palaceIdx: this.norm(kui) });
    if (yue >= 0) stars.push({ name: '유월 천월', type: 'yuwol', palaceIdx: this.norm(yue) });

    // 3. 유월 문창/문곡
    const changMap = [5, 6, 8, 9, 8, 9, 11, 0, 2, 3];
    const gokMap = [9, 8, 6, 5, 6, 5, 3, 2, 0, 11];
    const cIdx = changMap[gIdx];
    const kIdx = gokMap[gIdx];

    if (cIdx !== undefined)
      stars.push({ name: '유월 문창', type: 'yuwol', palaceIdx: this.norm(cIdx) });
    if (kIdx !== undefined)
      stars.push({ name: '유월 문곡', type: 'yuwol', palaceIdx: this.norm(kIdx) });

    // 4. 유월 천마 (유월 지지 기준 삼합)
    const samhapGroup = zIdx % 4;
    let maIdx = -1;
    if (samhapGroup === 0) maIdx = 2;
    else if (samhapGroup === 1) maIdx = 11;
    else if (samhapGroup === 2) maIdx = 8;
    else if (samhapGroup === 3) maIdx = 5;
    if (maIdx !== -1) stars.push({ name: '유월 천마', type: 'yuwol', palaceIdx: this.norm(maIdx) });

    return stars.map((star) => ({ ...star, name: star.name.trim() }));
  }
}

if (typeof module !== 'undefined') module.exports = ZiWeiDouShu;
