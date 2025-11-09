
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from io import BytesIO
from pypdf import PdfReader, PdfWriter

def _overlay_page(width, height, draw_ops):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    for op in draw_ops:
        t = op.get("type")
        if t == "text":
            c.setFont("Helvetica", 10)
            c.drawString(op["x"], op["y"], op.get("text", ""))
        elif t == "checkbox":
            x, y = op["x"], op["y"]
            c.rect(x, y, 10, 10, stroke=1, fill=0)
            if op.get("checked"):
                c.line(x, y, x+10, y+10); c.line(x, y+10, x+10, y)
        elif t == "signature":
            png = ImageReader(BytesIO(op["png"]))
            c.drawImage(png, op["x"], op["y"], width=op["w"], height=op["h"], mask='auto')
    c.showPage(); c.save()
    return buf.getvalue()

def stamp_pdf(original_pdf_bytes: bytes, values: dict) -> bytes:
    reader = PdfReader(BytesIO(original_pdf_bytes))
    writer = PdfWriter()
    for p in reader.pages:
        writer.add_page(p)
    # values: same structure as in API stub
    draw_map = {}
    for fid, v in values.items():
        p = int(v.get("page", 1)) - 1
        draw_map.setdefault(p, [])
        if v["type"] in ("text", "date"):
            draw_map[p].append({"type": "text", "x": v["x"], "y": v["y"], "text": str(v.get("value", ""))})
        elif v["type"] == "checkbox":
            draw_map[p].append({"type": "checkbox", "x": v["x"], "y": v["y"], "checked": bool(v.get("value"))})
        elif v["type"] in ("signature", "initials"):
            png = v["value"].split(",", 1)[1].encode() if "data:" in v["value"] else v["value"].encode()
            draw_map[p].append({"type": "signature", "x": v["x"], "y": v["y"], "w": v["w"], "h": v["h"], "png": BytesIO(png).getvalue()})
    for pidx, ops in draw_map.items():
        page = reader.pages[pidx]
        w = float(page.mediabox.width); h = float(page.mediabox.height)
        overlay_pdf = _overlay_page(w, h, ops)
        overlay_reader = PdfReader(BytesIO(overlay_pdf))
        writer.pages[pidx].merge_page(overlay_reader.pages[0])
    out = BytesIO(); writer.write(out)
    return out.getvalue()
