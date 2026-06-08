// 한글 자모 분해 + 워들식 자모 단위 채점 유틸.

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

function isCompleteHangul(ch) {
  const code = ch.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3;
}

// 음절 → [초, 중, 종] (종성 없으면 '')
function decompose(ch) {
  const code = ch.charCodeAt(0) - 0xac00;
  const cho = Math.floor(code / 588);
  const jung = Math.floor((code % 588) / 28);
  const jong = code % 28;
  return [CHO[cho], JUNG[jung], JONG[jong]];
}

// 완성된 한글 음절로만 이루어졌고 길이가 len인지 검사
function isValidWord(word, len) {
  if (!word || [...word].length !== len) return false;
  return [...word].every(isCompleteHangul);
}

// 워들 채점: 음절별 [초,중,종] 슬롯을 정답과 비교.
// 반환: 음절 배열, 각 음절은 슬롯별 { jamo, slot, color }('correct'|'present'|'absent').
// 빈 종성 슬롯은 결과에서 제외한다.
function scoreGuess(answer, guess) {
  const aS = [...answer].map(decompose);
  const gS = [...guess].map(decompose);
  const slots = ['cho', 'jung', 'jong'];

  // 정답 자모 풀(슬롯 무관, present 판정용). green으로 쓰인 건 제거한다.
  const pool = {};
  aS.forEach((tri) => tri.forEach((j) => { if (j) pool[j] = (pool[j] || 0) + 1; }));

  // 1차: 정확한 위치(초록)
  const result = gS.map((tri, si) =>
    tri.map((j, ji) => ({ jamo: j, slot: slots[ji], color: 'absent' }))
  );
  gS.forEach((tri, si) => {
    tri.forEach((j, ji) => {
      if (j && j === aS[si][ji]) {
        result[si][ji].color = 'correct';
        pool[j]--;
      }
    });
  });
  // 2차: 다른 위치에 존재(노랑)
  gS.forEach((tri, si) => {
    tri.forEach((j, ji) => {
      const cell = result[si][ji];
      if (j && cell.color === 'absent' && pool[j] > 0) {
        cell.color = 'present';
        pool[j]--;
      }
    });
  });

  // 빈 종성 슬롯 제거
  const cleaned = result.map((tri) => tri.filter((c) => c.jamo));
  const solved = answer === guess;
  return { syllables: cleaned, solved };
}

module.exports = { decompose, isValidWord, scoreGuess, isCompleteHangul };
