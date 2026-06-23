"""Tests for knitweb.llmadapter — virtualpc Lens bridge."""
from __future__ import annotations

import pytest

from knitweb.llmadapter import ContextBundle, LensAdapter, LensError


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class _FakeWeb:
    """Minimal stub of a pulse Web for unit tests."""

    def __init__(self, records: dict[str, dict]) -> None:
        self._records = records
        self.nodes = list(records.keys())

    def get(self, cid: str) -> dict | None:
        return self._records.get(cid)


class _FakeCandidateSet:
    def __init__(self, query, cids, records):
        self.query = query
        self.cids = tuple(cids)
        self._records = records

    def records(self, web):
        return {cid: self._records.get(cid) for cid in self.cids if cid in self._records}


def _make_adapter(records: dict[str, dict], subscription=None) -> LensAdapter:
    web = _FakeWeb(records)
    adapter = LensAdapter(web=web, subscription=subscription)
    return adapter, web


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------


def test_requires_web_or_base_url():
    with pytest.raises(ValueError, match="web.*base_url"):
        LensAdapter()


def test_cannot_provide_both():
    web = _FakeWeb({})
    with pytest.raises(ValueError, match="not both"):
        LensAdapter(web=web, base_url="http://localhost:8765")


def test_base_url_trailing_slash_stripped():
    adapter = LensAdapter(base_url="http://localhost:8765/")
    assert adapter._base_url == "http://localhost:8765"


# ---------------------------------------------------------------------------
# Direct mode via monkeypatching
# ---------------------------------------------------------------------------


def _patch_retrieve(monkeypatch, cids, records):
    """Monkeypatch knitweb.interpret.retrieve.retrieve."""
    def _fake_retrieve(query, subscription, web, *, depth=2, **kwargs):
        return _FakeCandidateSet(query, cids, records)

    # Patch the import inside llmadapter
    import knitweb.llmadapter as mod
    monkeypatch.setattr(mod, "_query_direct_retrieve", None, raising=False)

    import importlib, sys
    # Insert a fake module so the import in _query_direct resolves
    fake_mod = type(sys)("knitweb.interpret.retrieve")
    fake_mod.retrieve = _fake_retrieve
    monkeypatch.setitem(sys.modules, "knitweb.interpret.retrieve", fake_mod)
    monkeypatch.setitem(sys.modules, "knitweb.interpret", fake_mod)


def test_query_returns_context_bundle(monkeypatch):
    records = {
        "bafyreia1": {"kind": "chemistry-node", "name_en": "Water", "reputation": 10},
        "bafyreia2": {"kind": "chemistry-node", "name_en": "Salt"},
    }
    _patch_retrieve(monkeypatch, list(records.keys()), records)
    adapter, _ = _make_adapter(records)
    bundle = adapter.query("H2O")

    assert isinstance(bundle, ContextBundle)
    assert bundle.query == "H2O"
    assert len(bundle.cids) == 2
    assert bundle.record_count == 2
    assert bundle.token_estimate > 0
    assert "Knitweb Lens" in bundle.context
    assert "H2O" in bundle.context


def test_empty_query_raises(monkeypatch):
    adapter, _ = _make_adapter({})
    with pytest.raises(ValueError, match="non-empty"):
        adapter.query("")


def test_non_string_query_raises():
    adapter, _ = _make_adapter({})
    with pytest.raises(ValueError, match="non-empty"):
        adapter.query(None)  # type: ignore[arg-type]


def test_savings_pct_between_0_and_100(monkeypatch):
    records = {"bafyreia1": {"kind": "node", "name_en": "Test"}}
    _patch_retrieve(monkeypatch, ["bafyreia1"], records)
    big_web_records = {f"cid{i:04d}": {"kind": "node", "text": "x" * 200} for i in range(100)}
    big_web_records["bafyreia1"] = records["bafyreia1"]
    adapter, _ = _make_adapter(big_web_records)
    bundle = adapter.query("test")

    assert 0.0 <= bundle.savings_pct <= 100.0


def test_per_call_subscription_overrides_default(monkeypatch):
    """subscription kwarg on query() is forwarded to retrieve."""
    calls = []

    def _fake_retrieve(query, subscription, web, *, depth=2, **kwargs):
        calls.append({"subscription": subscription})
        return _FakeCandidateSet(query, [], {})

    import sys
    fake_mod = type(sys)("knitweb.interpret.retrieve")
    fake_mod.retrieve = _fake_retrieve
    monkeypatch.setitem(sys.modules, "knitweb.interpret.retrieve", fake_mod)
    monkeypatch.setitem(sys.modules, "knitweb.interpret", fake_mod)

    web = _FakeWeb({})
    adapter = LensAdapter(web=web, subscription=["chemistry"])
    adapter.query("test", subscription=["finance"])

    assert calls[0]["subscription"] == ("finance",)


def test_depth_override(monkeypatch):
    calls = []

    def _fake_retrieve(query, subscription, web, *, depth=2, **kwargs):
        calls.append({"depth": depth})
        return _FakeCandidateSet(query, [], {})

    import sys
    fake_mod = type(sys)("knitweb.interpret.retrieve")
    fake_mod.retrieve = _fake_retrieve
    monkeypatch.setitem(sys.modules, "knitweb.interpret.retrieve", fake_mod)
    monkeypatch.setitem(sys.modules, "knitweb.interpret", fake_mod)

    web = _FakeWeb({})
    adapter = LensAdapter(web=web)
    adapter.query("test", depth=5)

    assert calls[0]["depth"] == 5


# ---------------------------------------------------------------------------
# ContextBundle immutability
# ---------------------------------------------------------------------------


def test_context_bundle_is_frozen(monkeypatch):
    records = {"bafyreia1": {"kind": "node", "name_en": "X"}}
    _patch_retrieve(monkeypatch, ["bafyreia1"], records)
    adapter, _ = _make_adapter(records)
    bundle = adapter.query("x")

    with pytest.raises((AttributeError, TypeError)):
        bundle.query = "mutated"  # type: ignore[misc]


# ---------------------------------------------------------------------------
# HTTP mode — unreachable server
# ---------------------------------------------------------------------------


def test_http_mode_raises_lens_error_on_connect_fail():
    adapter = LensAdapter(base_url="http://127.0.0.1:1", timeout=1)
    with pytest.raises(LensError, match="unreachable"):
        adapter.query("test")
