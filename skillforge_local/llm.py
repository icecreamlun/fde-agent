"""Anthropic-backed LLM helper.

All AI logic in SkillForge routes through this module. There is no local
Ollama/Qwen or OpenClaw dependency anymore: every model call goes to the
Anthropic API using the official `anthropic` SDK.

Credentials are read from the ``ANTHROPIC_API_KEY`` environment variable. For
local development the key may live in a git-ignored ``.env.local`` (or ``.env``)
file at the project root; it is loaded automatically without overwriting
variables already present in the environment.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

# Default to Sonnet 4.6 — strong and noticeably cheaper than Opus, which fits the
# high-volume observe / extract / generate workload. Override with SKILLGEN_MODEL or
# ANTHROPIC_MODEL for a different tier (e.g. claude-opus-4-8 for the weekly report).
DEFAULT_MODEL = "claude-sonnet-4-6"


def default_model() -> str:
    return (
        os.environ.get("SKILLGEN_MODEL")
        or os.environ.get("ANTHROPIC_MODEL")
        or DEFAULT_MODEL
    )


def load_local_env(root: Path | str = ".") -> None:
    """Populate os.environ from a git-ignored .env.local / .env file if present.

    Existing environment variables are never overwritten.
    """
    for name in (".env.local", ".env"):
        path = Path(root) / name
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _build_client(api_key: str | None, base_url: str | None, timeout_seconds: int):
    load_local_env()
    try:
        import anthropic
    except ModuleNotFoundError as exc:  # pragma: no cover - depends on install
        raise RuntimeError(
            "The 'anthropic' package is required. Install it with: pip install anthropic"
        ) from exc

    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Add it to .env.local at the project "
            "root or export it in your shell."
        )
    kwargs: dict[str, Any] = {"api_key": key, "timeout": float(timeout_seconds)}
    resolved_base = base_url or os.environ.get("ANTHROPIC_BASE_URL")
    if resolved_base:
        kwargs["base_url"] = resolved_base
    return anthropic.Anthropic(**kwargs)


def _split_messages(messages: list[dict[str, str]]) -> tuple[str | None, list[dict[str, str]]]:
    """Convert OpenAI-style messages into (system_text, anthropic_messages)."""
    system_parts: list[str] = []
    convo: list[dict[str, str]] = []
    for message in messages:
        role = message.get("role")
        content = message.get("content", "")
        if role == "system":
            if content:
                system_parts.append(content)
            continue
        convo.append({
            "role": "assistant" if role == "assistant" else "user",
            "content": content,
        })
    if not convo:
        convo = [{"role": "user", "content": "\n\n".join(system_parts)}]
    system_text = "\n\n".join(system_parts) if system_parts else None
    return system_text, convo


def _text_from_response(response: Any) -> str:
    if getattr(response, "stop_reason", None) == "refusal":
        raise RuntimeError("Anthropic request was declined by safety classifiers.")
    parts: list[str] = []
    for block in getattr(response, "content", None) or []:
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    text = "".join(parts).strip()
    if not text:
        raise RuntimeError("Anthropic response contained no text content.")
    return text


def complete_text(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    max_tokens: int = 16000,
    timeout_seconds: int = 180,
    api_key: str | None = None,
    base_url: str | None = None,
    thinking: bool = True,
) -> str:
    """Run a single Claude completion and return the response text.

    Accepts OpenAI-style messages (a leading {"role": "system", ...} is pulled
    out into the Anthropic ``system`` parameter). Adaptive thinking is requested
    by default and gracefully skipped if the configured model rejects it. Pass
    ``thinking=False`` for small, schema-bound calls (e.g. the skill planner)
    where extended thinking only adds latency.
    """
    client = _build_client(api_key, base_url, timeout_seconds)
    system_text, convo = _split_messages(messages)
    request: dict[str, Any] = {
        "model": model or default_model(),
        "max_tokens": max_tokens,
        "messages": convo,
    }
    if system_text:
        request["system"] = system_text

    if not thinking:
        response = client.messages.create(**request)
        return _text_from_response(response)

    try:
        response = client.messages.create(thinking={"type": "adaptive"}, **request)
    except TypeError:
        # Older SDK without the `thinking` kwarg.
        response = client.messages.create(**request)
    except Exception as exc:  # noqa: BLE001 - retry only the thinking-related case
        if "thinking" in str(exc).lower():
            response = client.messages.create(**request)
        else:
            raise
    return _text_from_response(response)
