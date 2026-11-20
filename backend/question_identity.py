"""Compare the exercise a player solves, independently of record IDs and option order."""

import unicodedata


def exercise_key(prompt: str, correct_answer_text: str) -> tuple[str, str]:
    def normalize(text):
        # Keep significant whitespace in code, literal strings and indented samples.
        normalized = unicodedata.normalize("NFC", text).replace("\r\n", "\n").strip()
        if any(marker in normalized for marker in ("`", '"', "'", "\n    ", "\n\t")):
            return normalized
        return " ".join(normalized.split())

    return normalize(prompt).rstrip("?？").rstrip(), normalize(correct_answer_text)
