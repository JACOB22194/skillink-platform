"""
services/milestone_service.py — Milestone splitting logic
==========================================================
Pure functions — no DB calls. Fully testable in isolation.
"""

import math
from decimal import Decimal, ROUND_HALF_UP
from typing import TypedDict


class MilestoneSplit(TypedDict):
    title:      str
    amount:     float
    percentage: float
    order:      int


_PHASE_TITLES = [
    "Phase 1 — Kickoff & Setup",
    "Phase 2 — Core Development",
    "Phase 3 — Delivery & Review",
    "Phase 4 — Final Handoff",
    "Phase 5 — Completion",
]


def _title(index: int) -> str:
    return _PHASE_TITLES[index] if index < len(_PHASE_TITLES) else f"Phase {index + 1}"


def split_milestones(total_amount: float) -> list[MilestoneSplit]:
    """
    Enforces the platform's tiered milestone split rules:

      total < $500         → 2 milestones: 50% / 50%
      $500 ≤ total ≤ $3000 → 3 milestones: 30% / 40% / 30%
      total > $3000        → ceil(total / 1500) milestones, each capped at $1500,
                             last milestone absorbs the remainder

    Returns a list of dicts ordered by milestone sequence.
    All amounts are rounded to 2 decimal places; the last milestone
    gets the residual to ensure the sum equals total_amount exactly.
    """
    total = Decimal(str(total_amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if total <= 0:
        raise ValueError("Total amount must be greater than 0.")

    if total < Decimal("500"):
        percentages = [Decimal("0.50"), Decimal("0.50")]
    elif total <= Decimal("3000"):
        percentages = [Decimal("0.30"), Decimal("0.40"), Decimal("0.30")]
    else:
        # Cap each milestone at $1500; last one absorbs remainder
        count = math.ceil(float(total) / 1500)
        cap = Decimal("1500.00")
        splits: list[MilestoneSplit] = []
        remaining = total
        for i in range(count):
            amount = cap if remaining > cap else remaining
            remaining -= amount
            splits.append(
                MilestoneSplit(
                    title=_title(i),
                    amount=float(amount),
                    percentage=round(float(amount / total) * 100, 2),
                    order=i + 1,
                )
            )
        return splits

    # For 2-milestone and 3-milestone cases
    splits = []
    allocated = Decimal("0")
    for i, pct in enumerate(percentages):
        is_last = i == len(percentages) - 1
        if is_last:
            amount = total - allocated
        else:
            amount = (total * pct).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            allocated += amount
        splits.append(
            MilestoneSplit(
                title=_title(i),
                amount=float(amount),
                percentage=round(float(pct) * 100, 2),
                order=i + 1,
            )
        )

    return splits
