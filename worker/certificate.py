
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from io import BytesIO

def render_certificate(info: dict) -> bytes:
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(72, 750, "Certificate of Completion")
    c.setFont("Helvetica", 10)
    y = 720
    for k, v in info.items():
        txt = f"{k}: {v}"
        c.drawString(72, y, txt[:95])
        y -= 14
        if y < 72:
            c.showPage(); y = 750
    c.showPage(); c.save()
    return buf.getvalue()
