/**
 * 음양력 변환 및 사주(간지) 계산 클래스
 * - Lookup Table을 이용한 정밀 양력 -> 음력 변환 (1900~2100)
 * - 24절기 및 사주 팔자 산출
 * - 대운(大運) 계산 추가
 */
class LunarConverter {
    constructor() {
        this.gan = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
        this.zhi = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];

        // 한국 기준 음양력 변환은 js/korean-lunar-calendar.min.js만 사용한다.
        // 예전 lunarInfo 숫자 테이블은 한국 기준과 어긋날 수 있어 폐기했다.
        this.solarTerms = [
            '입춘', '우수', '경칩', '춘분', '청명', '곡우',
            '입하', '소만', '망종', '하지', '소서', '대서',
            '입추', '처서', '백로', '추분', '한로', '상강',
            '입동', '소설', '대설', '동지', '소한', '대한'
        ];
        this.solarTermData = this._requireSolarTermData();
        this.majorSolarTerms = [
            { termIndex: 0, monthZhiIdx: 1 },  // 소한: 축월
            { termIndex: 2, monthZhiIdx: 2 },  // 입춘: 인월
            { termIndex: 4, monthZhiIdx: 3 },  // 경칩: 묘월
            { termIndex: 6, monthZhiIdx: 4 },  // 청명: 진월
            { termIndex: 8, monthZhiIdx: 5 },  // 입하: 사월
            { termIndex: 10, monthZhiIdx: 6 }, // 망종: 오월
            { termIndex: 12, monthZhiIdx: 7 }, // 소서: 미월
            { termIndex: 14, monthZhiIdx: 8 }, // 입추: 신월
            { termIndex: 16, monthZhiIdx: 9 }, // 백로: 유월
            { termIndex: 18, monthZhiIdx: 10 },// 한로: 술월
            { termIndex: 20, monthZhiIdx: 11 },// 입동: 해월
            { termIndex: 22, monthZhiIdx: 0 }  // 대설: 자월
        ];
    }

    lunarYearDays(y) {
        return this._requireKoreanLunarCalendar().getLunarDays(y);
    }
    monthDays(y, m) {
        return this._requireKoreanLunarCalendar().getLunarDays2(y, m, false);
    }

    leapDays(y) {
        const koreanCalendar = this._requireKoreanLunarCalendar();
        const leapMonth = this.leapMonth(y);
        return leapMonth ? koreanCalendar.getLunarDays2(y, leapMonth, true) : 0;
    }

    leapMonth(y) {
        const koreanCalendar = this._requireKoreanLunarCalendar();
        return koreanCalendar.getLunarIntercalationMonth(koreanCalendar.getLunarData(y));
    }

    _requireKoreanLunarCalendar() {
        const Calendar = globalThis.KoreanLunarCalendar;
        if (typeof Calendar === 'function') {
            return new Calendar();
        }
        throw new Error('KoreanLunarCalendar 라이브러리가 로드되지 않았습니다.');
    }

    _requireSolarTermData() {
        const data = (typeof globalThis !== 'undefined' && globalThis.SOLAR_TERMS_UTC)
            ? globalThis.SOLAR_TERMS_UTC
            : (typeof SOLAR_TERMS_UTC !== 'undefined' ? SOLAR_TERMS_UTC : null);
        if (data && data.years && Array.isArray(data.terms)) return data;
        throw new Error('24절기 천문 계산 데이터가 로드되지 않았습니다.');
    }

    solarToLunar(date) {
        const koreanCalendar = this._requireKoreanLunarCalendar();
        const ok = koreanCalendar.setSolarDate(
            date.getFullYear(),
            date.getMonth() + 1,
            date.getDate()
        );
        if (!ok) return null;

        const lunar = koreanCalendar.getLunarCalendar();
        return {
            year: lunar.year,
            month: lunar.month,
            day: lunar.day,
            isLeap: !!lunar.intercalation
        };
    }

    lunarToSolarDate(lunarYear, lunarMonth, lunarDay, isLeap = false) {
        const koreanCalendar = this._requireKoreanLunarCalendar();
        const ok = koreanCalendar.setLunarDate(lunarYear, lunarMonth, lunarDay, !!isLeap);
        if (!ok) return null;

        const solar = koreanCalendar.getSolarCalendar();
        return new Date(solar.year, solar.month - 1, solar.day);
    }

    /**
     * 특정 음력 연도/월의 시작일(양력)과 종료일(양력)을 대략적으로 추산하여 반환
     * 윤달 연관(본달, 윤달)의 경우 약 45일 구간을 반환하고 플래그 추가
     * @param {number} lunarYear 음력 연도
     * @param {number} lunarMonth 음력 월 (1~12)
     * @returns {Object} { start: "YYYY.MM.DD", end: "YYYY.MM.DD", is45Days: boolean }
     */
    lunarMonthToSolarRange(lunarYear, lunarMonth) {
        let startSolar = null;
        let endSolar = null;

        let is45Days = false;
        const leapM = this.leapMonth(lunarYear);

        const d1 = new Date(lunarYear, 0, 1);
        const d2 = new Date(lunarYear + 1, 4, 1);

        // 대상 월이 윤달 자체이거나 윤달 직후의 달일 경우, 45일 구간 묶음 대상이 된다.
        // 예: 윤6월이 있으면, 월운 6월 버튼: 본6월 + 윤6월(1~15)
        //                    월운 7월 버튼: 윤6월(16~말일) + 본7월
        for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
            const lf = this.solarToLunar(d);
            if (!lf) continue;

            let isTarget = false;

            if (leapM > 0) {
                if (lunarMonth === leapM) {
                    // 유월 버튼이 leapM(예: 6월)인 경우
                    // 1. 해당 본달 (isLeap === false, month === 6)
                    // 2. 해당 윤달 1~15일 (isLeap === true, month === 6, day <= 15)
                    if (lf.year === lunarYear && lf.month === lunarMonth && !lf.isLeap) isTarget = true;
                    if (lf.year === lunarYear && lf.month === lunarMonth && lf.isLeap && lf.day <= 15) isTarget = true;
                    if (isTarget) is45Days = true;
                } else if (lunarMonth === leapM + 1) {
                    // 유월 버튼이 leapM 다음 달(예: 7월)인 경우
                    // 1. 해당 윤달 16~말일 (isLeap === true, month === 6, day >= 16)
                    // 2. 해당 본달 (isLeap === false, month === 7)
                    if (lf.year === lunarYear && lf.month === leapM && lf.isLeap && lf.day >= 16) isTarget = true;
                    if (lf.year === lunarYear && lf.month === lunarMonth && !lf.isLeap) isTarget = true;

                    if (lf.year === lunarYear && lf.month === leapM && lf.isLeap) is45Days = true; // 윤달 달력 데이터가 감지되면 45일 모드 ON
                } else {
                    // 일반 달
                    if (lf.year === lunarYear && lf.month === lunarMonth && !lf.isLeap) isTarget = true;
                }
            } else {
                // 윤달 없는 해
                if (lf.year === lunarYear && lf.month === lunarMonth && !lf.isLeap) isTarget = true;
            }

            if (isTarget) {
                if (!startSolar) startSolar = new Date(d);
                endSolar = new Date(d);
            }
        }

        const format = (date) => date ? `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}` : 'N/A';
        return {
            start: format(startSolar),
            end: format(endSolar),
            is45Days: is45Days
        };
    }

    _solarTermUtcMillis(year, termIndex) {
        const values = this.solarTermData.years[String(year)];
        if (!values || !Number.isFinite(values[termIndex])) {
            throw new Error(`24절기 데이터 범위를 벗어났습니다: ${year}, termIndex=${termIndex}`);
        }
        return values[termIndex];
    }

    _koreanStandardOffsetMinutesForUtc(utcMillis) {
        // 현재 앱의 한국 표준시 이력 정책과 맞춘다: 1954-03-21~1961-08-09은 UTC+8:30, 그 외 UTC+9.
        const utc830Start = Date.UTC(1954, 2, 20, 15, 30); // 1954-03-21 00:00 at UTC+8:30
        const utc830End = Date.UTC(1961, 7, 9, 15, 0);     // 1961-08-10 00:00 at UTC+9
        return utcMillis >= utc830Start && utcMillis < utc830End ? 510 : 540;
    }

    _utcMillisToKoreanStandardDate(utcMillis) {
        const offsetMinutes = this._koreanStandardOffsetMinutesForUtc(utcMillis);
        const shifted = new Date(utcMillis + offsetMinutes * 60 * 1000);
        return new Date(
            shifted.getUTCFullYear(),
            shifted.getUTCMonth(),
            shifted.getUTCDate(),
            shifted.getUTCHours(),
            shifted.getUTCMinutes(),
            shifted.getUTCSeconds()
        );
    }

    getSolarTermDate(year, termIndex) {
        return this._utcMillisToKoreanStandardDate(this._solarTermUtcMillis(year, termIndex));
    }

    getSolarTermInfo(year, termIndex) {
        const term = this.solarTermData.terms[termIndex];
        return {
            ...term,
            date: this.getSolarTermDate(year, termIndex),
            utcMillis: this._solarTermUtcMillis(year, termIndex)
        };
    }

    getPreviousNextMajorSolarTerms(date) {
        const year = date.getFullYear();
        const candidates = [];
        for (let y = year - 1; y <= year + 1; y++) {
            for (const major of this.majorSolarTerms) {
                candidates.push({
                    year: y,
                    termIndex: major.termIndex,
                    monthZhiIdx: major.monthZhiIdx,
                    date: this.getSolarTermDate(y, major.termIndex)
                });
            }
        }
        candidates.sort((a, b) => a.date.getTime() - b.date.getTime());

        let previous = candidates[0];
        let next = candidates[candidates.length - 1];
        for (const candidate of candidates) {
            if (candidate.date.getTime() <= date.getTime()) {
                previous = candidate;
            } else {
                next = candidate;
                break;
            }
        }
        return { previous, next };
    }

    getSaju(date, shichenIndex = null) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hour = date.getHours();

        // 년주
        const lichun = this.getSolarTermDate(year, 2);
        const sajuYear = date.getTime() < lichun.getTime() ? year - 1 : year;
        let yearGanIdx = (sajuYear - 4) % 10;
        let yearZhiIdx = (sajuYear - 4) % 12;
        if (yearGanIdx < 0) yearGanIdx += 10;
        if (yearZhiIdx < 0) yearZhiIdx += 12;

        // 월주
        const { previous: monthTerm } = this.getPreviousNextMajorSolarTerms(date);
        const monthZhiIdx = monthTerm.monthZhiIdx;

        let tigerGan = ((yearGanIdx % 5) * 2 + 2) % 10;
        let diff = monthZhiIdx - 2;
        if (diff < 0) diff += 12;
        let monthGanIdx = (tigerGan + diff) % 10;

        // 일주 (UTC)
        const baseEpoch = Date.UTC(1900, 0, 1);
        const targetEpoch = Date.UTC(year, month - 1, day);
        const dayDiff = Math.round((targetEpoch - baseEpoch) / 86400000);
        let dayGanIdx = (0 + dayDiff) % 10;
        let dayZhiIdx = (10 + dayDiff) % 12;
        if (dayGanIdx < 0) dayGanIdx += 10;
        if (dayZhiIdx < 0) dayZhiIdx += 12;

        // 시주
        let hourZhiIdx = Number.isInteger(shichenIndex)
            ? ((shichenIndex % 12) + 12) % 12
            : Math.floor((hour + 1) / 2) % 12;
        let ratHourGan = ((dayGanIdx % 5) * 2) % 10;
        let hourGanIdx = (ratHourGan + hourZhiIdx) % 10;

        return {
            year: { gan: this.gan[yearGanIdx], zhi: this.zhi[yearZhiIdx], idx: { gan: yearGanIdx, zhi: yearZhiIdx } },
            month: { gan: this.gan[monthGanIdx], zhi: this.zhi[monthZhiIdx], idx: { gan: monthGanIdx, zhi: monthZhiIdx } },
            day: { gan: this.gan[dayGanIdx], zhi: this.zhi[dayZhiIdx] },
            hour: { gan: this.gan[hourGanIdx], zhi: this.zhi[hourZhiIdx] }
        };
    }

    /**
     * 사주 대운 계산
     * @param {Object} saju getSaju 결과
     * @param {string} gender 'male' | 'female'
     */
    getDaeun(saju, gender) {
        // 기준: 연간(Year Stem)의 음양
        // 양간: 갑, 병, 무, 경, 임 (0, 2, 4, 6, 8)
        // 음간: 을, 정, 기, 신, 계 (1, 3, 5, 7, 9)
        const yearGanIdx = saju.year.idx.gan;
        const isYangYear = (yearGanIdx % 2 === 0);
        const isMale = (gender === 'male');

        // 순행/역행 판별
        // 양남음녀 -> 순행 (1)
        // 음남양녀 -> 역행 (-1)
        let direction = 1;
        if (isYangYear && isMale) direction = 1;
        else if (!isYangYear && !isMale) direction = 1;
        else direction = -1;

        let startAge = 4; // Fallback
        const birthDateObj = arguments.length > 2 && arguments[2] instanceof Date ? arguments[2] : null;
        if (birthDateObj) {
            const { previous: prevTerm, next: nextTerm } = this.getPreviousNextMajorSolarTerms(birthDateObj);
            const oneDay = 24 * 60 * 60 * 1000;
            const diffDays = direction === 1
                ? Math.abs((nextTerm.date.getTime() - birthDateObj.getTime()) / oneDay)
                : Math.abs((birthDateObj.getTime() - prevTerm.date.getTime()) / oneDay);
            startAge = Math.round(diffDays / 3);
            if (startAge < 1) startAge = 1;
        }


        // 대운 간지: 월주 기준
        let currentGanIdx = saju.month.idx.gan;
        let currentZhiIdx = saju.month.idx.zhi;

        const daeunList = [];
        for (let i = 0; i < 8; i++) { // 8개 대운
            currentGanIdx = (currentGanIdx + direction + 10) % 10;
            currentZhiIdx = (currentZhiIdx + direction + 12) % 12;

            daeunList.push({
                age: startAge + (i * 10),
                gan: this.gan[currentGanIdx],
                zhi: this.zhi[currentZhiIdx]
            });
        }
        return daeunList;
    }
}

if (typeof module !== 'undefined') module.exports = LunarConverter;
