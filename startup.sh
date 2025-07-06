#!/bin/bash

# doil-sb Development Server Startup Script (Docker-Optimized)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starting doil-sb development server..."

# npm run dev가 존재하는지 확인
if ! npm run | grep -q "dev"; then
    echo "❌ 'dev' script not found in package.json"
    echo "   Please add a dev script (e.g., \"dev\": \"nodemon app.js\")"
    exit 1
fi

# foreground 실행 → 컨테이너 PID 1 유지
cd "$SCRIPT_DIR"
exec npm run dev
