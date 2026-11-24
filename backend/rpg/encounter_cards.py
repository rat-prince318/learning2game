"""Build a private, reproducible teaching card from a published challenge."""

from hashlib import sha256

from .models import RPGChallengeInternal, RPGOption


def drill_card(question: RPGChallengeInternal, tag: str, prompt: str, options: list[str],
               hint: str, explanation: str) -> RPGChallengeInternal:
    def token(*values):
        return sha256("\0".join(values).encode("utf-8")).hexdigest()[:24]

    identifier = "ec_" + token(question.challenge_id, question.prompt, tag, prompt)
    choices = [RPGOption(id="eo_" + token(identifier, label), text=label) for label in options]
    answer = choices[0].id
    choices.sort(key=lambda option: token(identifier, option.id))
    return RPGChallengeInternal(**{**question.model_dump(), "challenge_id": identifier,
        "prompt": prompt, "options": choices, "correct_option_id": answer,
        "hint": hint, "explanation": explanation, "practice_exercises": []})


def practice_card(question, index):
    exercise = question.practice_exercises[index]
    choices = list(exercise.options)
    correct = choices.pop(exercise.correct_index)
    return drill_card(question, f"lesson_{index}", exercise.prompt, [correct, *choices],
                      exercise.hint, exercise.explanation)
