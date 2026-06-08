// 게임용 단어 데이터 (MVP). 추후 외부 파일/DB로 확장 가능.

// 라이어게임: 카테고리별 제시어
const LIAR_WORDS = [
  { category: '음식', word: '김치찌개' },
  { category: '음식', word: '떡볶이' },
  { category: '음식', word: '삼겹살' },
  { category: '동물', word: '코끼리' },
  { category: '동물', word: '펭귄' },
  { category: '장소', word: '놀이공원' },
  { category: '장소', word: '도서관' },
  { category: '직업', word: '소방관' },
  { category: '스포츠', word: '농구' },
  { category: '사물', word: '냉장고' },
  { category: '영화', word: '기생충' },
  { category: '계절', word: '겨울' },
];

// 워들(한글): 2글자 단어
const WORDLE_WORDS = [
  '사과', '바다', '구름', '학교', '친구', '가방', '노래', '우산', '시계', '거울',
  '나무', '하늘', '바람', '겨울', '여행', '음악', '사진', '편지', '강물', '고래',
  '햇살', '눈물', '미소', '약속', '추억', '용기', '행복', '저녁', '아침', '주말',
];

module.exports = { LIAR_WORDS, WORDLE_WORDS };
