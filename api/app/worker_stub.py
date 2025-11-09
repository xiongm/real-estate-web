
# Inline sealing implementation using pypdf + reportlab.
# In production, this should be called from a Celery task in the worker container.

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from io import BytesIO
from pypdf import PdfReader, PdfWriter
import json, base64, hashlib, datetime

def _overlay_page(width, height, draw_ops):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    for op in draw_ops:
        t = op.get("type")
        if t == "text":
            c.setFont("Helvetica", 10)
            x, y, txt = op["x"], op["y"], op["text"]
            c.drawString(x, y, txt)
        elif t == "checkbox":
            x, y = op["x"], op["y"]
            c.rect(x, y, 10, 10, stroke=1, fill=0)
            if op.get("checked"):
                c.line(x, y, x+10, y+10); c.line(x, y+10, x+10, y)
        elif t == "signature":
            x, y, w, h = op["x"], op["y"], op["w"], op["h"]
            png = base64.b64decode(op["png_b64"])
            c.drawImage(ImageReader(BytesIO(png)), x, y, width=w, height=h, mask='auto')
    c.showPage()
    c.save()
    return buf.getvalue()

def _append_certificate(writer: PdfWriter, audit: dict):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(72, 750, "Certificate of Completion")
    c.setFont("Helvetica", 10)
    y = 720
    for k, v in audit.items():
        line = f"{k}: {v}"
        c.drawString(72, y, line[:95])
        y -= 14
        if y < 72:
            c.showPage(); y = 750
    c.showPage(); c.save()
    buf.seek(0)
    cert_reader = PdfReader(buf)
    writer.append_pages_from_reader(cert_reader)

def seal_pdf(original_pdf_bytes: bytes, envelope_id: int, values: dict):
    reader = PdfReader(BytesIO(original_pdf_bytes))
    writer = PdfWriter()
    draw_map = {}  # page_index -> [ops]
    # values expected: { field_id: {"type": "...", "page": int, "x": float, "y": float, "w": float, "h": float, "value": any} }
    num_pages = len(reader.pages)
    for i in range(num_pages):
        writer.add_page(reader.pages[i])
    for fid, v in values.items():
        t = v.get("type")
        if not v.get("value"):
            continue
        p = max(0, min(num_pages - 1, int(v.get("page", 1)) - 1))
        draw_map.setdefault(p, [])
        if t in ("text", "date"):
            draw_map[p].append({"type": "text", "x": v["x"], "y": v["y"], "text": str(v.get("value", ""))})
        elif t == "checkbox":
            draw_map[p].append({"type": "checkbox", "x": v["x"], "y": v["y"], "checked": bool(v.get("value"))})
        elif t in ("signature", "initials"):
            draw_map[p].append({
                "type": "signature",
                "x": v["x"],
                "y": v["y"],
                "w": v.get("w") or 180.0,
                "h": v.get("h") or 80.0,
                "png_b64": v["value"],
            })

    # Paint overlays per page
    for pidx, ops in draw_map.items():
        page = reader.pages[pidx]
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        overlay_pdf = _overlay_page(width, height, ops)
        overlay_reader = PdfReader(BytesIO(overlay_pdf))
        # Merge (stamp) overlay on page
        writer.pages[pidx].merge_page(overlay_reader.pages[0])

    # Build audit summary
    sha_before = hashlib.sha256(original_pdf_bytes).hexdigest()
    now = datetime.datetime.utcnow().isoformat() + "Z"
    audit = {
        "envelope_id": envelope_id,
        "sha256_original": sha_before,
        "sealed_at": now,
        "events_summary": "See DB events table for hash chain",
    }

    # Append certificate page
    _append_certificate(writer, audit)

    out_buf = BytesIO()
    writer.write(out_buf)
    final_bytes = out_buf.getvalue()
    sha_final = hashlib.sha256(final_bytes).hexdigest()
    audit_json = json.dumps({**audit, "sha256_final": sha_final})
    return final_bytes, audit_json, sha_final
