"""
MarketCap — mathematical bounds of the knitweb economy.

The maximum possible market cap is determined by three independent 256-bit
address spaces:

  Dimension      | Math graph concept | knitweb element | Max elements
  ───────────────┼────────────────────┼─────────────────┼──────────────
  Fiber space    | Node / Vertex      | Spider           | 2^256
  Dot space      | Edge / Arc         | Connection       | 2^256
  Knot space     | Content unit       | Post             | 2^256

Total addressable elements = 3 × 2^256

The 3D connectivity (fiber × dot × knot) means no central authority can
exhaust or pre-allocate the space.  The network is open to 2^256 unique
participants, connections, and content units — a number that exceeds the
estimated number of atoms in the observable universe by many orders of
magnitude.

FBR (Fiber token) max mintable supply:
  Each of the 2^256 possible knots can mint at most:
    POSTER_REWARD + (VALIDATORS_REQUIRED × VALIDATOR_REWARD)  µFBR
  Practical supply is determined by actual participation, not a hard cap.
"""

from __future__ import annotations

from dataclasses import dataclass

from .addressing import ADDR_BITS
from .fbr import (
    FBR_POSTER_REWARD,
    FBR_VALIDATOR_REWARD,
    VALIDATORS_REQUIRED,
    BURN_AFTER_DAYS,
)


ADDR_SPACE: int = 2 ** ADDR_BITS   # elements per dimension

# Three independent 256-bit dimensions
DIMENSIONS: int = 3                  # fiber + dot + knot

# Theoretical maximum elements in the knitweb
MAX_ELEMENTS: int = DIMENSIONS * ADDR_SPACE

# Theoretical maximum µFBR ever mintable (one reward event per knot)
_FBR_PER_KNOT: int = FBR_POSTER_REWARD + VALIDATORS_REQUIRED * FBR_VALIDATOR_REWARD
MAX_FBR_SUPPLY: int = ADDR_SPACE * _FBR_PER_KNOT


@dataclass(frozen=True)
class MarketCap:
    """
    Immutable summary of the knitweb's mathematical capacity bounds.

    All values are exact integers.  The numbers are astronomically large by
    design — the point is that no central authority can exhaust or pre-mint
    the space.
    """

    addr_bits: int        = ADDR_BITS
    dimensions: int       = DIMENSIONS
    fiber_space: int      = ADDR_SPACE
    dot_space: int        = ADDR_SPACE
    knot_space: int       = ADDR_SPACE
    total_elements: int   = MAX_ELEMENTS
    max_fbr_supply: int   = MAX_FBR_SUPPLY
    fbr_per_knot: int     = _FBR_PER_KNOT
    burn_after_days: int  = BURN_AFTER_DAYS

    def summary(self) -> dict:
        """Human-readable summary (large integers as hex + approximate)."""
        return {
            "addr_bits": self.addr_bits,
            "dimensions": {
                "fiber": "node  (graph vertex) — spider / participant",
                "dot":   "edge  (graph arc)    — connection between elements",
                "knot":  "content unit         — 2-line post (SHA-256 addressed)",
            },
            "capacity": {
                "per_dimension_hex": hex(self.fiber_space),
                "per_dimension_approx": "~1.16 × 10^77",
                "total_elements_hex": hex(self.total_elements),
                "total_elements_approx": "~3.47 × 10^77",
            },
            "fbr_token": {
                "max_supply_hex": hex(self.max_fbr_supply),
                "max_supply_approx": f"~{_FBR_PER_KNOT} × 10^77 µFBR",
                "micro_fbr_per_confirmed_knot": self.fbr_per_knot,
                "poster_reward": FBR_POSTER_REWARD,
                "validator_reward": FBR_VALIDATOR_REWARD,
                "validators_required": VALIDATORS_REQUIRED,
                "burn_after_days": self.burn_after_days,
                "note": (
                    "Practical supply << theoretical max. "
                    "FBR circulates or burns — no pre-mine, no reserve."
                ),
            },
        }

    def utilisation(self, fibers: int, dots: int, knots: int) -> dict:
        """
        Compute current network utilisation as a fraction of the theoretical max.
        All fractions are expressed as (numerator, denominator) tuples because
        the denominator (2^256) is too large for floating-point precision.
        """
        return {
            "fiber_utilisation": (fibers, self.fiber_space),
            "dot_utilisation":   (dots,   self.dot_space),
            "knot_utilisation":  (knots,  self.knot_space),
            "combined_elements": fibers + dots + knots,
            "combined_vs_max":   (fibers + dots + knots, self.total_elements),
        }
