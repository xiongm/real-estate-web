
# Skeleton email sender: logs to console. Replace with real SMTP/Postmark/SES later.
def send_email(to: str, subject: str, body: str):
    print(f"""
--- EMAIL (skeleton) ---
To: {to}
Subject: {subject}

{body}
-------------------------
""")
