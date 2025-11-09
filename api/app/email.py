import os
import smtplib
from email.message import EmailMessage

SMTP_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("EMAIL_PORT", "587"))
SMTP_USER = os.getenv("EMAIL_USER")
SMTP_PASSWORD = os.getenv("EMAIL_PASSWORD")
DEFAULT_SENDER = os.getenv("EMAIL_SENDER", SMTP_USER or "noreply@example.com")

def send_email(to: str, subject: str, body: str):
    if SMTP_USER and SMTP_PASSWORD:
        msg = EmailMessage()
        msg["From"] = DEFAULT_SENDER
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as smtp:
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(msg)
    else:
        print(f"""
--- EMAIL (stub) ---
To: {to}
Subject: {subject}

{body}
--------------------
""")
