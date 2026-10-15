# 🏖️ doil-sb (Doil Sandbox)

정적 웹페이지 호스팅을 위한 Express 기반 샌드박스 프로젝트입니다.  
포트폴리오, 학습 프로젝트, 실험적인 웹 개발을 위한 개발 환경을 제공합니다.

## 📋 프로젝트 정보

- **프로젝트명**: doil-sb (Doil Sandbox)
- **목적**: 포트폴리오 및 학습용 정적 웹페이지 호스팅
- **기술스택**: Node.js, Express, Docker
- **접속 URL**: https://doil.chickenkiller.com/sandbox/

## 🚀 시작하기

### 전제조건

- Docker
- Node.js 20+ (컨테이너 내부)
- Git

### 로컬 개발 환경 설정

#### 1. Docker 이미지 빌드
```bash
# 개발용 Dockerfile.dev가 있는 디렉토리에서
docker build -f Dockerfile.dev -t doil-sb:dev .
```

#### 2. 컨테이너 실행
```bash
docker run -d \
  --name doil-sb \
  --network dev-net \
  -p 13001:3000 \
  doil-sb:dev
```

#### 3. 컨테이너 접속 및 개발
```bash
# 컨테이너에 접속
docker exec -it doil-sb sh

# 프로젝트 디렉토리로 이동
cd /app/doil-sb

# 의존성 설치
npm install

# 개발 서버 실행
npm start
```

#### 4. 접속 확인
- 로컬: http://localhost:13001
- 프로덕션: https://doil.chickenkiller.com/sandbox/

## 📁 프로젝트 구조

```
doil-sb/
├── app.js              # Express 서버 메인 파일
├── package.json        # npm 설정 및 의존성
├── .gitignore         # Git 제외 파일 목록
├── README.md          # 프로젝트 문서
├── public/            # 정적 파일 (HTML, CSS, JS, 이미지)
│   ├── css/
│   ├── js/
│   ├── images/
│   └── index.html
├── routes/            # Express 라우트 파일들
└── views/             # 템플릿 파일들 (필요시)
```

## 🔧 사용법

### 정적 파일 추가
`public/` 디렉토리에 HTML, CSS, JavaScript, 이미지 파일을 추가하면 자동으로 서빙됩니다.

```bash
# 예시: 새로운 페이지 추가
echo '<h1>새로운 페이지</h1>' > public/new-page.html
# 접속: https://doil.chickenkiller.com/sandbox/new-page.html
```

### 라우트 추가
새로운 API 엔드포인트나 동적 페이지가 필요한 경우 `app.js`에 라우트를 추가합니다.

```javascript
// app.js에 추가
app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello from doil-sb!' });
});
```

## 📦 배포

### Docker 컨테이너 관리
```bash
# 컨테이너 중지
docker stop doil-sb

# 컨테이너 시작
docker start doil-sb

# 로그 확인
docker logs doil-sb

# 컨테이너 재시작
docker restart doil-sb
```

### Git 워크플로우
```bash
# 변경사항 커밋
git add .
git commit -m "Add new feature"
git push origin main

# 원격 저장소에서 풀
git pull origin main
```

## 🧠 Notion 페이지 임베딩 (page-level retrieval)

6시간 Notion 스캔(`routes/graph.js`) 직후, 페이지마다 bge-m3(1024-d) 벡터 1개를 `data/notion_meta.db`의 `page_vec_bge_m3` 테이블에 쓴다. doil-console 이 이 인덱스를 읽기 전용으로 사용한다. 그래프 노드/엣지 커밋 뒤 비동기로 돌아 스캔을 기다리게 하지 않는다. 기존 `nodes_vec`(3072-d)와 `mcp/djinn.js` 는 건드리지 않는다.

**본문 저장 금지 규칙**: 본문 텍스트는 스캔 중 메모리(`pageTexts`)에만 있고 임베딩 요청 후 버려진다. DB·로그·파일 어디에도 쓰지 않는다(청킹 없음, 저장되는 것은 해시와 벡터뿐). 입력 = `제목 + props + 본문`, 최대 5000자(Ollama bge-m3 로드 컨텍스트 4096 토큰, 초과분은 조용히 잘리므로 한국어 기준 여유를 둔 값).

| 환경변수 | 기본 | 설명 |
|---|---|---|
| `OMNIROUTE_URL` | - | 예 `http://omniroute:20128` (`/v1/embeddings` 호출). 없으면 임베딩 skip |
| `OMNIROUTE_API_KEY` | - | Bearer 키(루트 `.env` 에서 주입). 없으면 skip |
| `PRIVATE_PAGES_FILE` | `/app/config/notion-private.json` | 콘솔 `config/notion-private.json` 을 읽기 전용 bind mount. `{pages:[{page:<32hex>, subtree:bool}]}` |

- **비공개 페이지 제외**: 위 목록 + `subtree:true` 는 child 엣지로 하위까지 펼쳐 임베딩하지 않고 기존 행도 삭제한다. 파일이 없거나 파싱 불가면 **아무것도 임베딩/삭제하지 않는다**(fail closed).
- **증분**: `sha256(입력 + embedder)` 가 같으면 건너뜀. 오류(네트워크/4xx/5xx/차원·개수 불일치)는 기존 행을 유지하고 다음 스캔에서 재시도한다. ROOT 스캔 후에는 노드가 사라진 행을 삭제한다.
- **백필**: `POST /graph/embed/backfill` — 본문을 저장하지 않으므로 ROOT 스캔(크롤)을 다시 돌리며 해시 스킵을 끄고 전 페이지를 재임베딩한다. 보호 방식은 `POST /graph/scan` 과 동일하다.
- **상태**: `GET /graph/scan/status` 응답의 `embedState` = `{state, embedded, skipped, failed, reason, finished_at}` (`state`: idle/running/done/error/skipped).
- **테스트**: `npm test` (`node --test`, 가짜 fetch + 임시 SQLite; 실제 omniroute·DB 호출 없음).

## 🌐 네트워크 구성

- **Docker 네트워크**: dev-net
- **내부 포트**: 3000
- **외부 포트**: 13001
- **프록시**: nginx → doil-sb:3000

## 📝 개발 가이드라인

### 코딩 컨벤션
- ES6+ 문법 사용
- 2칸 들여쓰기
- 세미콜론 사용

### 파일 구조
- 정적 파일: `public/` 디렉토리
- CSS: `public/css/`
- JavaScript: `public/js/`
- 이미지: `public/images/`

### 환경변수
필요한 경우 `.env` 파일을 사용 (Git에는 포함되지 않음)

## 🐛 트러블슈팅

### 일반적인 문제들

**포트 충돌**
```bash
# 13001 포트가 사용 중인 경우
lsof -i :13001
# 해당 프로세스 종료 후 재시작
```

**컨테이너 접속 불가**
```bash
# 컨테이너 상태 확인
docker ps -a
# 컨테이너가 종료된 경우 재시작
docker start doil-sb
```

**npm 모듈 에러**
```bash
# 컨테이너 내부에서 캐시 정리
npm cache clean --force
rm -rf node_modules
npm install
```

## 🤝 기여하기

1. 이슈 생성
2. 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 커밋 (`git commit -m 'Add amazing feature'`)
4. 푸시 (`git push origin feature/amazing-feature`)
5. Pull Request 생성

## 📄 라이선스

이 프로젝트는 개인 학습 및 포트폴리오 용도로 사용됩니다.

## 📞 연락처

- **개발자**: Doil
- **프로젝트 링크**: [https://github.com/D0iloppa/doil-sb-static](https://github.com/D0iloppa/doil-sb-static)
- **라이브 사이트**: [https://doil.chickenkiller.com/sb/](https://doil.chickenkiller.com/sb/)

---

**Built with ❤️ for learning and experimentation**