#!/bin/bash

# doil-sb Development Server Startup Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.dev-server.pid"
LOG_FILE="$SCRIPT_DIR/logs/dev-server.log"

# 로그 디렉토리 생성
mkdir -p "$SCRIPT_DIR/logs"

# 이미 실행 중인지 확인
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 $PID 2>/dev/null; then
        echo "❌ Development server is already running (PID: $PID)"
        echo "   Use './shutdown.sh' to stop it first."
        exit 1
    else
        echo "🧹 Cleaning up stale PID file..."
        rm -f "$PID_FILE"
    fi
fi

echo "🚀 Starting doil-sb development server..."

# npm run dev가 있는지 확인
if ! npm run | grep -q "dev"; then
    echo "❌ 'dev' script not found in package.json"
    echo "   Please add a dev script (e.g., \"dev\": \"nodemon app.js\")"
    exit 1
fi

# 이전 nohup.out 파일 정리 (선택사항)
[ -f nohup.out ] && rm -f nohup.out

# Development server 시작 (nohup으로 터미널 독립적 실행)
cd "$SCRIPT_DIR"
nohup npm run dev > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# PID 저장
echo $SERVER_PID > "$PID_FILE"

# 잠시 대기 후 서버 상태 확인
sleep 3

if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ Development server started successfully!"
    echo "   PID: $SERVER_PID"
    echo "   Log: $LOG_FILE"
    echo "   URL: http://localhost:3000"
    echo ""
    echo "📋 Commands:"
    echo "   View logs: tail -f $LOG_FILE"
    echo "   Stop server: ./shutdown.sh"
    echo "   Check status: ps -p $SERVER_PID"
    echo ""
    echo "💡 Server will continue running even if terminal is closed (nohup)"
else
    echo "❌ Failed to start development server"
    echo "   Check logs: cat $LOG_FILE"
    rm -f "$PID_FILE"
    exit 1
fi