/**
 * 한국 시간 보정 클래스 (TimeCorrector)
 * - 한국 표준시 변경 역사 반영
 * - 서머타임(DST) 반영
 * - 출생지 경도에 따른 진태양시 계산
 * - 균시차(Equation of Time) 보정
 */

class TimeCorrector {
    constructor() {
        // 주요 도시 경도 데이터 (동경 기준)
        this.CITY_LONGITUDES = {
            '서울': 126.9779,
            '부산': 129.0749,
            '대구': 128.6014,
            '인천': 126.7052,
            '광주': 126.8514,
            '대전': 127.3845,
            '울산': 129.3113,
            '세종': 127.2891,
            '수원': 127.0286,
            '강릉': 128.8760,
            '춘천': 127.7297,
            '청주': 127.4914,
            '천안': 127.1522,
            '전주': 127.1479,
            '여수': 127.6622,
            '포항': 129.3660,
            '창원': 128.6918,
            '제주': 126.5311
        };

        // 한국 서머타임 실시 기간 (양력 기준) // [시작일(월,일), 종료일(월,일)]
        // **주의**: 연도별로 정확한 시각(보통 0시 또는 2시)이 다르지만, 자미두수용으로는 날짜 기준으로 판단해도 무방함.
        // 더 정밀한 처리를 위해 시작일 00:00 ~ 종료일 24:00 (혹은 해제 시각) 고려 필요.
        // 여기서는 데이터에 주어진 날짜 범위를 서머타임 적용 기간으로 간주.
        this.DST_HISTORY = {
            1948: { start: '05-31', end: '09-22' },
            1949: { start: '04-03', end: '09-30' },
            1950: { start: '04-01', end: '09-10' },
            1951: { start: '05-06', end: '09-09' },
            1955: { start: '04-06', end: '09-21' },
            1956: { start: '05-20', end: '09-29' },
            1957: { start: '05-05', end: '09-21' },
            1958: { start: '05-04', end: '09-21' },
            1959: { start: '05-04', end: '09-19' },
            1960: { start: '05-01', end: '09-18' },
            1987: { start: '05-10', end: '10-10' },
            1988: { start: '05-08', end: '10-09' }
        };
    }

    /**
     * 해당 날짜의 한국 표준 자오선(경도)을 반환
     * @param {Date} date 
     * @returns {number} 표준 자오선 경도 (135 or 127.5)
     */
    getStandardMeridian(date) {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();
        const dateNum = y * 10000 + m * 100 + d;

        // 1954년 3월 21일 ~ 1961년 8월 9일: 동경 127도 30분 (127.5)
        if (dateNum >= 19540321 && dateNum <= 19610809) {
            return 127.5;
        }
        // 그 외: 동경 135도
        return 135.0;
    }

    /**
     * 서머타임 적용 여부 확인
     * @param {Date} date 
     * @returns {number} 서머타임 적용 시 차감할 시간 (보통 1시간 = 60분)
     */
    getDSTCorrection(date) {
        const y = date.getFullYear();
        if (!this.DST_HISTORY[y]) return 0;

        const { start, end } = this.DST_HISTORY[y];
        const current = this.formatDateMMDD(date);

        if (current >= start && current <= end) {
            return 60; // 1시간 (60분) 단축된 상태이므로, 진태양시 구할 때는 60분을 뺴야 함 (시계바늘을 미리 돌려놨으므로)
            // 논리: 서머타임 때 낮 12시는 실제로는 낮 11시임. -> 실제 태양시보다 1시간 빠름.
            // 진태양시 = 시계시간 - 서머타임보정 + 경도보정 + 균시차
            // 따라서 여기서 반환한 값을 뺄셈 로직에 사용.
        }
        return 0;
    }

    formatDateMMDD(date) {
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        return `${m}-${d}`;
    }

    /**
     * 균시차(Equation of Time) 계산 (분 단위)
     * 근사 공식 사용
     * @param {Date} date 
     * @returns {number} 균시차 (분)
     */
    getEquationOfTime(date) {
        // 1년 중 몇 번째 날인지 계산 (day of year)
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        const d = Math.floor(diff / oneDay);

        // B parameter
        const B = (360 * (d - 81)) / 365;
        const B_rad = B * (Math.PI / 180);

        // 균시차 공식 (분)
        const eot = 9.87 * Math.sin(2 * B_rad) - 7.53 * Math.cos(B_rad) - 1.5 * Math.sin(B_rad);
        return eot;
    }

    /**
     * 진태양시(True Solar Time) 계산
     * @param {Date} birthDate 양력 생년월일시 (Date 객체)
     * @param {string} city 출생 도시 이름
     * @returns {object} { adjustedDate, message }
     */
    calculateTrueSolarTime(birthDate, city) {
        // 1. 기본 정보
        const standardMeridian = this.getStandardMeridian(birthDate);
        const cityLongitude = this.CITY_LONGITUDES[city] || 126.9779; // 기본값 서울
        const dstOffset = this.getDSTCorrection(birthDate); // 서머타임이면 60

        // 2. 경도차에 의한 시간 보정 (분)
        // 경도 1도 차이 = 4분
        // (도시 경도 - 표준 경도) * 4
        const longitudeCorrection = (cityLongitude - standardMeridian) * 4;

        // 3. 균시차 보정 (분)
        const eotCorrection = this.getEquationOfTime(birthDate);

        // 4. 총 보정 시간 (분)
        // 진태양시 = 시계시간 - 서머타임 + 경도보정 + 균시차
        // 주의: 서머타임은 '시계가 빠른' 것이므로, 본래 태양시를 찾으려면 뺴야 함.
        const totalCorrectionMinutes = -dstOffset + longitudeCorrection + eotCorrection;

        // 5. 날짜 객체 조정
        // birthDate는 불변성을 유지하기 위해 복사
        const adjustedDate = new Date(birthDate.getTime() + totalCorrectionMinutes * 60 * 1000);

        return {
            originalTime: birthDate,
            adjustedTime: adjustedDate,
            corrections: {
                standardMeridian,
                cityLongitude,
                longitudeDiffMin: longitudeCorrection,
                dstMin: -dstOffset,
                eotMin: eotCorrection,
                totalMin: totalCorrectionMinutes
            }
        };
    }
}
