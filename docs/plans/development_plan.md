# LLM 성능 테스트 솔루션 개발 계획 문서

## 1. 아키텍처 개요
- **백엔드**: FastAPI 기반의 비동기 웹 애플리케이션
  - `llm_client.py`: aiohttp/httpx를 활용하여 비동기로 LLM 서버(vLLM, LiteLLM 등)와 통신하고, 스트리밍 응답을 기반으로 TTFT, TPOT, Latency를 계산하는 인터페이스 모듈.
  - `load_tester.py`: `asyncio` 기반의 다중 워커 루프를 실행하여 지정된 Concurrency(동시 접속자)와 Iterations/Duration(반복 횟수/지속 시간)만큼 부하를 발생시키고, 메트릭을 Queue에 수집.
  - `main.py`: 테스트 시작/중지 및 클라이언트(브라우저)로 지표를 실시간 전송하기 위한 SSE(Server-Sent Events) 엔드포인트 제공.
- **프론트엔드**: Vanilla HTML / JS / CSS
  - 별도의 프론트엔드 프레임워크 없이 경량화하여 개발.
  - Chart.js를 이용해 실시간 Latency와 TPS 시계열 그래프 렌더링.
  - Glassmorphism 기반의 다크 모드 UI 적용.

## 2. 세부 구현 계획 및 경과
1. **설정 및 환경 구성 (Phase 1)**
   - 프로젝트 스캐폴딩 생성 (`backend/`, `frontend/`, `docs/`)
   - 가상환경 실행 스크립트 작성 (`run.sh`)
   - `requirements.txt` 정의.
2. **코어 백엔드 엔진 개발 (Phase 2)**
   - 목표 서버 대상 HTTP 스트리밍 요청 수신 및 토큰 파싱 로직 구현.
   - `load_tester.py` 비동기 워커 로직 구성. Iterations 외에 Duration(시간) 기반 탈출 조건 추가.
3. **프론트엔드 연동 및 시각화 (Phase 3)**
   - SSE 채널 연결 및 Queue 데이터 UI 테이블 렌더링.
   - Chart.js 연동. (오류 방지를 위해 Canvas 래퍼 요소 도입)
4. **리포트 및 편의 기능 (Phase 4)**
   - 테스트 결과에 현재 설정(Config) 포함.
   - 결과물 Export (JSON, MD) 및 Clear 기능 구현. 
   - 파일명에 날짜/시간(YYYYMMDD_HHMM) 타임스탬프 스탬핑 자동화.
