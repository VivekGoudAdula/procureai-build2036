"""
LLM Service for ProcureAI.
Provides reusable helper functions for calling Groq with JSON output.
"""
import os
import json
import logging
from typing import Optional, Any, Dict

logger = logging.getLogger(__name__)


def chat_json(
    system: str,
    user: str,
    model: str = "llama-3.1-8b-instant",
    temperature: float = 0.3,
    max_tokens: int = 600,
) -> Optional[Dict[str, Any]]:
    """
    Executes a chat completion with JSON mode enabled.
    Handles missing GROQ_API_KEY and API errors gracefully by returning None.
    Never crashes.
    """
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        logger.info("[LLMService] GROQ_API_KEY is not configured. Skipping LLM call.")
        return None

    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = completion.choices[0].message.content
        if not content:
            return None
        return json.loads(content)
    except Exception as e:
        logger.error(f"[LLMService] Groq API call failed: {e}")
        return None

