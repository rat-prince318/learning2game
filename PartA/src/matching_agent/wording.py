"""Validate wording used on cards, in explanations and in learning reports."""

import re


_UNWANTED = re.compile(
    r"[\u00b7\u30fb]|并不|并非|而非|而是|不是|不代表|不等于|不等同|不意味|"
    r"不保证|不构成|不必然|不一定|不完全|不证明|不只|不单|不光|不仅|不能|"
    r"[只仅]能(?:说明|证明)|不足以|无法(?:证明|说明)|更准确地说|"
    r"\bnot\s+(?:only|just|simply|merely)\b|\bnot\b[^.!?\n]{0,180}\b(?:but|rather|instead)\b|"
    r"\brather than\b",
    re.IGNORECASE,
)


def has_unwanted_wording(text: str) -> bool:
    """Apply the same publication rules as the browser before accepting a card."""
    return _UNWANTED.search(text) is not None
