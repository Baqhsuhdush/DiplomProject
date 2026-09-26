import logging

import httpx

logger = logging.getLogger(__name__)


def send_telegram_message(
    *,
    bot_token: str,
    chat_id: int,
    text: str,
    reply_markup: dict[str, object] | None = None,
    open_app_url: str | None = None,
    open_app_label: str | None = None,
    disable_notification: bool = False,
) -> tuple[bool, str]:
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload: dict[str, object] = {"chat_id": chat_id, "text": text}
    if disable_notification:
        payload["disable_notification"] = True
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    elif open_app_url:
        payload["reply_markup"] = {
            "inline_keyboard": [
                [
                    {
                        "text": open_app_label or "Open Qadam App",
                        "url": open_app_url,
                    }
                ]
            ]
        }
    try:
        resp = httpx.post(
            url,
            json=payload,
            timeout=20.0,
        )
        if resp.status_code == 200:
            return True, "ok"
        return False, f"http_{resp.status_code}: {resp.text[:500]}"
    except Exception as exc:
        logger.exception("telegram send failed")
        return False, str(exc)
