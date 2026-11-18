from typing import Any


class AgentError(Exception):
    """Safe error exposed to callers; never contains provider response bodies."""

    def __init__(self, code: str, message: str, *, retryable: bool = False,
                 details: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.details = details

    def as_dict(self) -> dict:
        return {"code": self.code, "message": self.message,
                "retryable": self.retryable, "details": self.details}
