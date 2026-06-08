# doil-sb BFF — production image
# 소스와 의존성을 이미지에 굽고 node로 직접 실행한다 (nodemon / 볼륨 마운트 없음).
FROM node:20-alpine

WORKDIR /app

# 의존성 레이어: package*.json만 먼저 복사해 레이어 캐시를 최대화
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 애플리케이션 소스
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "app.js"]
