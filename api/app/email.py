import os
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

SMTP_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("EMAIL_PORT", "587"))
SMTP_USER = os.getenv("EMAIL_USER")
SMTP_PASSWORD = os.getenv("EMAIL_PASSWORD")
DEFAULT_SENDER = os.getenv("EMAIL_SENDER", SMTP_USER or "noreply@example.com")
DEFAULT_SENDER_NAME = os.getenv("EMAIL_SENDER_NAME", "Real Estate Signing")

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
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as smtp:
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
