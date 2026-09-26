from typing import Any


def score_attempt(questions_blob: dict[str, Any], answers: dict[str, Any]) -> tuple[int, bool]:
    passing = int(questions_blob.get("passing_score", 60))
    qs = questions_blob.get("questions", [])
    if not qs:
        return 0, False

    correct = 0
    total = 0
    for q in qs:
        if not isinstance(q, dict):
            continue
        qid = str(q.get("id"))
        qtype = str(q.get("type", "mcq")).lower()
        total += 1
        if qtype == "mcq":
            try:
                user_val = answers.get(qid)
                if user_val is None:
                    continue
                if int(user_val) == int(q.get("correct_index")):
                    correct += 1
            except (TypeError, ValueError):
                continue
        elif qtype == "short_text":
            ref = (q.get("correct_answer") or "").strip().lower() if isinstance(q.get("correct_answer"), str) else ""
            given = str(answers.get(qid, "")).strip().lower()
            if ref:
                if given == ref:
                    correct += 1
            else:
                if len(given) >= 8:
                    correct += 1
        else:
            total -= 1

    if total <= 0:
        return 0, False
    score = int(round(100 * correct / total))
    return score, score >= passing
