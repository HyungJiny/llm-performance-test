# LLM Performance Test Solution - Implementation Plan

## 1. Goal Description
The objective is to implement an LLM Performance Test Solution to measure the token generation speed and stability of internal LLM servers (like vLLM, LiteLLM, Ollama, LM Studio). The tool will feature a web-based GUI for ease of use, concurrent load testing capabilities, and visualization of key LLM metrics (TTFT, TPOT, Latency, FPS/TPS, Token Usage).

## 2. Proposed Architecture
We will use a **Python FastAPI** backend for robust and high-performance asynchronous HTTP networking, paired with a rich **Vanilla HTML/JS/CSS** frontend to meet the high aesthetics requirement without the overhead of a heavy node framework.

### Backend Components
#### [NEW] `backend/requirements.txt`
Dependencies: `fastapi`, `uvicorn`, `httpx`, `pydantic`.

#### [NEW] `backend/main.py`
- Main FastAPI application.
- Serves static files from the `frontend` directory.
- Exposes REST/WebSocket/SSE endpoints for test configuration and live monitoring.

#### [NEW] `backend/llm_client.py`
- Handles asynchronous requests to OpenAI-compatible endpoints using `httpx`.
- Processes Streaming responses to calculate:
  - **TTFT**: Delay between request start and first parsed chunk.
  - **Latency**: Total time to stream all chunks.
  - **TPOT**: `(Latency - TTFT) / (Output Token Count - 1)`.
  - **FPS/TPS**: Tokens per second.
- Reads `prompt_tokens` and `completion_tokens` from usage stats (if provided by the API) or estimates via simple heuristics if omitted.
- Supports injecting model-specific parameters (like `reasoning_effort` or `enable_thinking`).

#### [NEW] `backend/load_tester.py`
- Engine that orchestrates concurrent workers using `asyncio`.
- Pushes realtime progress and metrics (Success/Error rates, timeouts) to a queue consumed by the FastAPI SSE endpoint to stream live updates to the frontend.

### Frontend Components
#### [NEW] `frontend/index.html`
- A single-page application structure.
- Two main sections:
  1. **Configuration Sidebar/Panel**: Server endpoint, API key, Model name, Concurrency, Iterations/Duration, Prompts, and custom JSON parameters.
  2. **Dashboard**: Live metrics and charts.

#### [NEW] `frontend/style.css`
- A premium, dynamic, and beautiful UI utilizing CSS grid/flexbox, a dark mode color palette, smooth glassmorphism effects for panels, and micro-animations on interactive elements to satisfy the "Design Aesthetics" requirement.

#### [NEW] `frontend/app.js`
- Handles DOM manipulation and user events.
- Establishes SSE (Server-Sent Events) connection to receive real-time streaming metrics.
- Uses **Chart.js** (loaded via CDN) to plot concurrent load metrics in real-time.
- Implements CSV export logic.

## 3. User Review Required
> [!IMPORTANT]
> The solution uses vanilla HTML/JS/CSS combined with Python FastAPI. Before starting development, please review the architecture plan. Let me know if you would prefer a different stack (e.g., Next.js entirely, or React frontend). 

## 4. Verification Plan

### Automated/Mock Tests
- I will implement a lightweight mock OpenAI-compatible endpoint route (`/v1/chat/completions`) inside the FastAPI app during development.
- This mock endpoint will artificially delay responses (to simulate TTFT and TPOT) so that we can verify the frontend metrics logic and load generator without needing an actual LLM server running.

### Manual Verification
1. Run `pip install -r backend/requirements.txt` and `python backend/main.py`.
2. Open `http://localhost:8000` in the browser.
3. Configure the test to point to either the internal mock endpoint (`http://localhost:8000/v1/chat/completions`) or a real deployed vLLM server.
4. Execute the load test and visually verify the metrics, the charting update logic, and the CSV export feature.
