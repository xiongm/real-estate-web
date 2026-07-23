import os
import smtplib
import socket
import time
from email.message import EmailMessage
from email.utils import formataddr

SMTP_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("EMAIL_PORT", "587"))
SMTP_USER = os.getenv("EMAIL_USER")
SMTP_PASSWORD = os.getenv("EMAIL_PASSWORD")
DEFAULT_SENDER = os.getenv("EMAIL_SENDER", SMTP_USER or "noreply@example.com")
DEFAULT_SENDER_NAME = os.getenv("EMAIL_SENDER_NAME", "Real Estate Signing")
SMTP_TIMEOUT = float(os.getenv("EMAIL_TIMEOUT", "10"))
SMTP_RETRIES = int(os.getenv("EMAIL_RETRIES", "3"))


def _smtp_connection():
    last_error = None
    for attempt in range(SMTP_RETRIES):
        try:
            addresses = socket.getaddrinfo(
                SMTP_HOST,
                SMTP_PORT,
                family=socket.AF_INET,
                type=socket.SOCK_STREAM,
            )
            if not addresses:
                raise OSError(f"No IPv4 addresses found for {SMTP_HOST}")
            address = addresses[attempt % len(addresses)][4][0]
            smtp = smtplib.SMTP(timeout=SMTP_TIMEOUT)
            smtp._host = SMTP_HOST
            smtp.connect(address, SMTP_PORT)
            return smtp
        except (OSError, smtplib.SMTPException) as exc:
            last_error = exc
            if attempt + 1 < SMTP_RETRIES:
                time.sleep(attempt + 1)
    raise last_error or OSError(f"Unable to connect to {SMTP_HOST}:{SMTP_PORT}")

def format_sender_name(requester_name: str | None = None) -> str:
    base_label = (DEFAULT_SENDER_NAME or "Real Estate Signing").strip() or "Real Estate Signing"
    if requester_name:
        plain = requester_name.strip()
        if plain:
            return f"{plain} via {base_label}"
    return base_label

def send_email(
    to: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    attachments: list | None = None,
    sender_name: str | None = None,
    reply_to: str | None = None,
):
    attachments = attachments or []
    display_name = (sender_name or DEFAULT_SENDER_NAME).strip()
    from_value = formataddr((display_name, DEFAULT_SENDER)) if display_name else DEFAULT_SENDER
    if SMTP_USER and SMTP_PASSWORD:
        msg = EmailMessage()
        msg["From"] = from_value
        if reply_to:
            msg["Reply-To"] = reply_to
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body or "")
        if html_body:
            msg.add_alternative(html_body, subtype="html")
        for attachment in attachments:
            if not attachment:
                continue
            filename = attachment.get("filename") or "attachment"
            content = attachment.get("content")
            maintype = attachment.get("maintype", "application")
            subtype = attachment.get("subtype", "octet-stream")
            if content is None:
                continue
            msg.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)
        with _smtp_connection() as smtp:
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(msg)
    else:
        print(f"""
--- EMAIL (stub) ---
From: {from_value}
Reply-To: {reply_to or "(not set)"}
To: {to}
Subject: {subject}

{body}

HTML:
{html_body or "(none)"}

Attachments: {len(attachments)} file(s)
--------------------
""")
