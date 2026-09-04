from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SourceResult:
    source_id: str
    events: list[dict[str, Any]] = field(default_factory=list)
    status: str = "success"
    message: str = ""

