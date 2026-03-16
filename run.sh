#!/bin/bash

# 프로젝트의 루트 디렉토리로 이동
cd "$(dirname "$0")"

echo "========================================="
echo "  LLM Performance Test Solution Run Script"
echo "========================================="

# 파이썬 가상환경 생성 (존재하지 않을 경우)
if [ ! -d "venv" ]; then
    echo "가상환경(venv)을 생성합니다..."
    python3 -m venv venv
fi

# 가상환경 활성화
echo "가상환경을 활성화합니다..."
source venv/bin/activate

# 의존성 패키지 설치
echo "필요한 패키지를 설치합니다..."
pip install -r backend/requirements.txt

# 서버 실행
echo "========================================="
echo "서버를 시작합니다. 브라우저에서 아래 주소로 접속하세요:"
echo "http://localhost:8000"
echo "종료하시려면 Ctrl+C를 누르세요."
echo "========================================="

cd backend
python main.py
