import asyncio
import time
import json
import logging
from typing import Dict, Any, AsyncGenerator

import httpx

logger = logging.getLogger(__name__)

class LLMClient:
    def __init__(self, base_url: str, api_key: str = "EMPTY"):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    async def generate_stream(self, payload: Dict[str, Any]) -> AsyncGenerator[Dict[str, Any], None]:
        url = f"{self.base_url}/v1/chat/completions"
        if "stream" not in payload:
            payload["stream"] = True

        start_time = time.time()
        ttft = None
        output_tokens = 0
        prompt_tokens = 0
        
        # Keep track of error context if it fails
        error_msg = None

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", url, headers=self.headers, json=payload) as response:
                    response.raise_for_status()
                    
                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        
                        if not data_str:
                            continue

                        try:
                            chunk = json.loads(data_str)
                            
                            # First token
                            if ttft is None:
                                ttft = time.time() - start_time
                                
                            # Count output tokens
                            choices = chunk.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                if delta.get("content") or delta.get("reasoning_content") or delta.get("reasoning"):
                                    output_tokens += 1
                                
                            # Extract usage if present (some APIs send this in the last chunk)
                            if "usage" in chunk and chunk["usage"]:
                                prompt_tokens = chunk["usage"].get("prompt_tokens", 0)
                                if "completion_tokens" in chunk["usage"]:
                                    output_tokens = max(output_tokens, chunk["usage"].get("completion_tokens", 0))

                        except json.JSONDecodeError:
                            logger.warning(f"Failed to parse chunk: {data_str}")
                            continue

        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP Error: {e.response.status_code} - {e.response.text}"
        except Exception as e:
            error_msg = str(e)
            
        latency = time.time() - start_time
        
        # Heuristic for prompt tokens if usage wasn't returned
        if prompt_tokens == 0:
            content = payload.get("messages", [{}])[0].get("content", "")
            prompt_tokens = len(content.split()) * 1.3 # Rough approximation

        yield {
            "success": error_msg is None,
            "error": error_msg,
            "ttft": ttft or latency,
            "latency": latency,
            "output_tokens": output_tokens,
            "prompt_tokens": int(prompt_tokens)
        }
