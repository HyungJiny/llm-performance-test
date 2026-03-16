import asyncio
import json
import logging
import time
from typing import Dict, Any

from fastapi import FastAPI, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel

from llm_client import LLMClient
from load_tester import LoadTester

# Setup logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LLM Performance Test Solution")

# Note: We will mount frontend static files after defining API routes to avoid path conflicts
# app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")

# Global state
class TestState:
    def __init__(self):
        self.tester: LoadTester = None
        self.active_test_id = None
        self.start_time = 0

state = TestState()

class TestConfig(BaseModel):
    base_url: str
    api_key: str = "EMPTY"
    model: str
    concurrency: int = 1
    iterations: int = 0
    duration: int = 60
    prompt: str = "Explain the theory of relativity in 100 words."
    custom_params: Dict[str, Any] = {}

class StopRequest(BaseModel):
    pass

@app.post("/api/start_test")
async def start_test(config: TestConfig):
    if state.tester and state.tester.is_running:
        return {"status": "error", "message": "A test is already running"}
    
    client = LLMClient(base_url=config.base_url, api_key=config.api_key)
    state.tester = LoadTester(client)
    
    payload = {
        "model": config.model,
        "messages": [{"role": "user", "content": config.prompt}],
        "stream": True,
        **config.custom_params
    }
    
    state.start_time = time.time()
    await state.tester.run_test(concurrency=config.concurrency, iterations=config.iterations, duration=config.duration, payload=payload)
    
    return {"status": "started", "message": f"Test started with concurrency {config.concurrency}"}

@app.post("/api/stop_test")
async def stop_test():
    if state.tester:
        state.tester.stop_test()
        return {"status": "stopped", "message": "Test stop requested"}
    return {"status": "error", "message": "No test running"}

@app.get("/api/stream_metrics")
async def stream_metrics():
    async def event_generator():
        try:
            while True:
                if not state.tester:
                    await asyncio.sleep(1)
                    continue
                    
                metric = await state.tester.metrics_queue.get()
                
                # If metric is status completed
                if metric.get("type") == "status":
                    yield f"data: {json.dumps(metric)}\n\n"
                    break
                
                # Prepare data to send
                data = {
                    "type": "metric",
                    "success": metric.get("success", False),
                    "error": metric.get("error"),
                    "ttft": metric.get("ttft", 0),
                    "latency": metric.get("latency", 0),
                    "output_tokens": metric.get("output_tokens", 0),
                    "prompt_tokens": metric.get("prompt_tokens", 0)
                }

                # Calculate TPOT
                out_tokens = data["output_tokens"]
                latency = data["latency"]
                ttft = data["ttft"]
                
                tpot = 0
                if out_tokens > 1 and latency > ttft:
                    tpot = (latency - ttft) / (out_tokens - 1)
                data["tpot"] = tpot

                yield f"data: {json.dumps(data)}\n\n"
                
                state.tester.metrics_queue.task_done()
                
        except asyncio.CancelledError:
            logger.info("Client disconnected from SSE stream")
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

# Mount frontend
import os
frontend_dir = os.path.join(os.path.dirname(__file__), "../frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    logger.warning("Frontend directory not found. Please create it first.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
