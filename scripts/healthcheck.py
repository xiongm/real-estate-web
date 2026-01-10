#!/usr/bin/env python3
import os
import smtplib
import ssl
import sys
import urllib.request
from email.message import EmailMessage
from pathlib import Path


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        if not line or line.strip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def bool_env(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def fetch_health(url: str, timeout: float) -> tuple[bool, str]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "healthcheck/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.status
            ok = 200 <= status < 400
            return ok, f"status={status}"
    except Exception as err:  # noqa: BLE001
        return False, f"error={err}"


def resolve_smtp_value(env_key: str, fallback_key: str) -> str:
    return os.environ.get(env_key) or os.environ.get(fallback_key) or ""


def send_email(subject: str, body: str) -> None:
    host = resolve_smtp_value("SMTP_HOST", "EMAIL_HOST")
    port = resolve_smtp_value("SMTP_PORT", "EMAIL_PORT")
    user = resolve_smtp_value("SMTP_USER", "EMAIL_USER")
    password = resolve_smtp_value("SMTP_PASS", "EMAIL_PASSWORD")
    sender = resolve_smtp_value("SMTP_FROM", "EMAIL_SENDER") or user or "healthcheck@localhost"
    recipients_raw = os.environ.get("SMTP_TO") or os.environ.get("EMAIL_TO") or sender
    recipients = [r.strip() for r in recipients_raw.split(",") if r.strip()]
    if not host or not recipients:
        raise RuntimeError("EMAIL_HOST/SMTP_HOST and EMAIL_SENDER/SMTP_TO are required to send email.")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.set_content(body)

    use_ssl = bool_env("SMTP_USE_SSL", False)
    use_tls = bool_env("SMTP_USE_TLS", True)

    if use_ssl:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, int(port or 465), context=context) as server:
            if user and password:
                server.login(user, password)
            server.send_message(msg)
        return

    with smtplib.SMTP(host, int(port or 587)) as server:
        server.ehlo()
        if use_tls:
            context = ssl.create_default_context()
            server.starttls(context=context)
            server.ehlo()
        if user and password:
            server.login(user, password)
        server.send_message(msg)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    load_env(root / ".env")
    env_override = os.environ.get("HEALTHCHECK_ENV_FILE", "")
    if env_override:
        load_env(Path(env_override))

    url = os.environ.get("HEALTHCHECK_URL", "http://localhost:3000/api/health")
    timeout = float(os.environ.get("HEALTHCHECK_TIMEOUT", "5"))
    ok, detail = fetch_health(url, timeout)
    if ok:
        return 0

    prefix = os.environ.get("HEALTHCHECK_SUBJECT_PREFIX", "[healthcheck]")
    subject = f"{prefix} failed {url}"
    body = f"Healthcheck failed for {url}\n{detail}\n"
    send_email(subject, body)
    return 2


if __name__ == "__main__":
    sys.exit(main())
