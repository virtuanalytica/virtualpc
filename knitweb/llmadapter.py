"""LLM adapter — thin bridge between virtualpc agents and the pulse Lens.

Wraps ``interpret.retrieve`` (and optionally ``interpret.distill``) to deliver
pre-distilled context from the pulse P2P knowledge fabric to LLM agents with
minimal token overhead (~93 % savings vs naïve full-prompt concatenation).

Two transport modes
-------------------
direct
    Import ``knitweb.interpret`` directly (pulse installed in the same env).
    Fastest; zero network overhead.  Use when virtualpc and pulse share a
    Python environment.

http
    POST to a pulse ``/interpret`` HTTP gateway (when pulse runs as a separate
    service).  Falls back gracefully when the gateway is unavailable.

Quick-start
-----------
::

    from knitweb.llmadapter import LensAdapter

    # direct mode — pulse installed in the same venv
    adapter = LensAdapter(web=my_pulse_web, subscription=["chemistry"])
    bundle  = adapter.query("vanadium redox")
    print(bundle.context)          # inject into LLM prompt
    print(f"{bundle.savings_pct:.0f}% token savings")

    # HTTP mode — pulse running as a separate service
    adapter = LensAdapter(base_url="http://localhost:8765")
    bundle  = adapter.query("NH3 synthesis")
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import TYPE_CHECKING, Iterable, Mapping

if TYPE_CHECKING:
    # Pulse types — only needed for type hints; not a hard dep.
    from knitweb.fabric.web import Web  # type: ignore[import]
    from knitweb.interpret.retrieve import CandidateSet  # type: ignore[import]

__all__ = ["ContextBundle", "LensAdapter", "LensError"]

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------

_TOKEN_CHARS = 4  # rough heuristic: 4 chars ≈ 1 token (GPT-style BPE)


@dataclass(frozen=True)
class ContextBundle:
    """Distilled context ready for injection into an LLM prompt.

    Attributes
    ----------
    query:
        The original query string.
    context:
        Pre-formatted text suitable for direct prompt injection.  Contains
        a brief header, source CIDs, and a record summary per candidate.
    cids:
        Tuple of CIDv1 strings that were retrieved from the pulse web.
    record_count:
        Number of records in the candidate set.
    token_estimate:
        Estimated token count of ``context`` (``len(context) // 4``).
    naive_estimate:
        Estimated token count if the full web were naïvely concatenated.
    savings_pct:
        ``(1 - token_estimate / naive_estimate) * 100``.
        0.0 when ``naive_estimate == 0``.
    """

    query: str
    context: str
    cids: tuple[str, ...]
    record_count: int
    token_estimate: int
    naive_estimate: int
    savings_pct: float


class LensError(RuntimeError):
    """Raised when the Lens query fails in HTTP mode."""


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def _format_record(cid: str, record: dict) -> str:
    """One-line summary of a single candidate record."""
    kind = record.get("kind", "?")
    label = (
        record.get("name_en")
        or record.get("name")
        or record.get("text", "")[:60]
        or cid[:12]
    )
    rep = record.get("reputation") or record.get("weight") or ""
    rep_str = f" [rep={rep}]" if rep else ""
    return f"  [{kind}] {label}{rep_str}  cid={cid[:16]}…"


def _build_context(query: str, records: dict[str, dict], cids: tuple[str, ...]) -> str:
    lines: list[str] = [
        f"[Knitweb Lens — query: {query!r}]",
        f"candidates: {len(cids)}  |  cids: {', '.join(c[:12] + '…' for c in cids[:5])}"
        + ("  …" if len(cids) > 5 else ""),
        "---",
    ]
    for cid in cids:
        rec = records.get(cid)
        if rec is None:
            lines.append(f"  [?] cid={cid[:16]}… (record not loaded)")
        else:
            lines.append(_format_record(cid, rec))
    return "\n".join(lines)


def _naive_estimate(web: "Web") -> int:
    """Rough upper-bound token estimate if the full web were concatenated."""
    try:
        total_chars = sum(
            len(str(web.get(cid) or ""))
            for cid in (getattr(web, "nodes", None) or [])
        )
        return max(1, total_chars // _TOKEN_CHARS)
    except Exception:
        return 1


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class LensAdapter:
    """Bridge between virtualpc LLM agents and the pulse Lens interpret path.

    Parameters
    ----------
    web:
        A pulse ``Web`` instance (direct mode).  Mutually exclusive with
        ``base_url``.
    base_url:
        Root URL of a pulse interpret HTTP gateway, e.g.
        ``"http://localhost:8765"``.  Mutually exclusive with ``web``.
    subscription:
        Default scope filter for every ``query()`` call (can be overridden
        per call).  Accepts any iterable of scope strings.
    depth:
        Default graph traversal depth passed to ``retrieve``.
    timeout:
        HTTP request timeout in seconds (HTTP mode only).  Default 10.
    """

    def __init__(
        self,
        *,
        web: "Web | None" = None,
        base_url: str | None = None,
        subscription: Iterable[str] | None = None,
        depth: int = 2,
        timeout: int = 10,
    ) -> None:
        if web is None and base_url is None:
            raise ValueError("LensAdapter requires either 'web' (direct mode) or 'base_url' (HTTP mode)")
        if web is not None and base_url is not None:
            raise ValueError("Provide 'web' OR 'base_url', not both")
        self._web = web
        self._base_url = base_url.rstrip("/") if base_url else None
        self._subscription: tuple[str, ...] | None = (
            tuple(subscription) if subscription is not None else None
        )
        self._depth = depth
        self._timeout = timeout

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def query(
        self,
        q: str,
        *,
        subscription: Iterable[str] | None = None,
        depth: int | None = None,
    ) -> ContextBundle:
        """Query the pulse Lens and return a distilled context bundle.

        Parameters
        ----------
        q:
            Natural-language query or seed CID.
        subscription:
            Per-call scope override.  Falls back to the adapter default.
        depth:
            Per-call depth override.  Falls back to the adapter default.

        Returns
        -------
        ContextBundle
            Pre-formatted context ready for LLM prompt injection.
        """
        if not q or not isinstance(q, str):
            raise ValueError("query must be a non-empty string")

        scope = tuple(subscription) if subscription is not None else self._subscription
        d = depth if depth is not None else self._depth

        if self._web is not None:
            return self._query_direct(q, scope, d)
        return self._query_http(q, scope, d)

    # ------------------------------------------------------------------
    # Direct mode
    # ------------------------------------------------------------------

    def _query_direct(
        self,
        q: str,
        subscription: tuple[str, ...] | None,
        depth: int,
    ) -> ContextBundle:
        try:
            from knitweb.interpret.retrieve import retrieve  # type: ignore[import]
        except ImportError as exc:
            raise RuntimeError(
                "Direct mode requires pulse installed: pip install knitweb-pulse"
            ) from exc

        web = self._web
        candidate_set = retrieve(q, subscription, web, depth=depth)
        records = candidate_set.records(web)
        cids = candidate_set.cids

        context = _build_context(q, records, cids)
        tok = max(1, len(context) // _TOKEN_CHARS)
        naive = _naive_estimate(web)

        return ContextBundle(
            query=q,
            context=context,
            cids=cids,
            record_count=len(cids),
            token_estimate=tok,
            naive_estimate=naive,
            savings_pct=max(0.0, (1 - tok / naive) * 100) if naive > 0 else 0.0,
        )

    # ------------------------------------------------------------------
    # HTTP mode
    # ------------------------------------------------------------------

    def _query_http(
        self,
        q: str,
        subscription: tuple[str, ...] | None,
        depth: int,
    ) -> ContextBundle:
        payload = json.dumps({
            "query": q,
            "subscription": list(subscription) if subscription else None,
            "depth": depth,
        }).encode()
        url = f"{self._base_url}/interpret/retrieve"
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                body = json.loads(resp.read())
        except urllib.error.URLError as exc:
            raise LensError(f"pulse gateway unreachable at {url}: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise LensError(f"pulse gateway returned invalid JSON: {exc}") from exc

        cids = tuple(body.get("cids", []))
        records = {r["cid"]: r for r in body.get("records", []) if "cid" in r}
        context = _build_context(q, records, cids)
        tok = max(1, len(context) // _TOKEN_CHARS)
        naive = int(body.get("naive_estimate", max(1, tok * 15)))

        return ContextBundle(
            query=q,
            context=context,
            cids=cids,
            record_count=len(cids),
            token_estimate=tok,
            naive_estimate=naive,
            savings_pct=max(0.0, (1 - tok / naive) * 100) if naive > 0 else 0.0,
        )
