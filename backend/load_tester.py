import asyncio
import time
from typing import Dict, Any, Callable
import copy

from llm_client import LLMClient

class LoadTester:
    def __init__(self, client: LLMClient):
        self.client = client
        self.metrics_queue = asyncio.Queue()
        self.is_running = False

    async def _worker(self, worker_id: int, payload: Dict[str, Any], iterations: int, duration: int, start_time: float):
        i = 0
        while True:
            if not self.is_running:
                break
                
            elapsed = time.time() - start_time
            if duration > 0 and elapsed >= duration:
                break
                
            # If duration is 0, we rely on iterations
            if duration == 0 and i >= iterations:
                break
            
            # Add some slight jitter
            await asyncio.sleep(0.01 * worker_id)
            
            worker_payload = copy.deepcopy(payload)
            
            try:
                # We only care about the final aggregated metric from the stream generator
                async for result in self.client.generate_stream(worker_payload):
                    result["worker_id"] = worker_id
                    result["iteration"] = i
                    await self.metrics_queue.put(result)
            except Exception as e:
                await self.metrics_queue.put({
                    "success": False,
                    "error": str(e),
                    "worker_id": worker_id,
                    "iteration": i,
                    "ttft": 0,
                    "latency": 0,
                    "output_tokens": 0,
                    "prompt_tokens": 0
                })
            
            i += 1

    async def run_test(self, concurrency: int, iterations: int, duration: int, payload: Dict[str, Any]):
        self.is_running = True
        start_time = time.time()
        
        # Clear queue
        while not self.metrics_queue.empty():
            self.metrics_queue.get_nowait()
            
        tasks = []
        for i in range(concurrency):
            task = asyncio.create_task(self._worker(i, payload, iterations, duration, start_time))
            tasks.append(task)
            
        # Add a sentinel to mark completion? We can do that by awaiting the tasks
        # But we also want to return immediately and let the test run in the background.
        # Actually, we will just run them and when all are done, put a sentinel dict.
        
        async def waiter():
            await asyncio.gather(*tasks, return_exceptions=True)
            self.is_running = False
            await self.metrics_queue.put({"type": "status", "status": "completed"})
            
        asyncio.create_task(waiter())

    def stop_test(self):
        self.is_running = False
