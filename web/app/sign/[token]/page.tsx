'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useParams } from 'next/navigation';

export default function SignPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [completeStatus, setCompleteStatus] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const base = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

  useEffect(() => {
    if (!token) return;
    fetch(`${base}/api/sign/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [token]);

  useEffect(() => {
    if (!data?.fields) return;
    const signerId = data.signer?.id;
    const signerRole = data.signer?.role;
    const filteredFields = (data.fields || []).filter((field: any) => {
      if (field.signer_id && signerId) {
        return field.signer_id === signerId;
      }
      if (field.role && signerRole) {
        return field.role === signerRole;
      }
      return true;
    });
    setFieldValues((prev) => {
      const next = { ...prev };
      filteredFields.forEach((field: any) => {
        const key = String(field.id);
        if (next[key]) return;
        let defaultValue: any = '';
        if (field.type === 'checkbox') defaultValue = false;
        if (field.type === 'date') defaultValue = new Date().toISOString().slice(0, 10);
        next[key] = { ...field, value: defaultValue };
      });
      return next;
    });
  }, [data?.fields, data?.signer?.role, data?.signer?.id]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setPdfError(null);
    setPdfUrl(null);
    fetch(`${base}/api/sign/${token}/pdf`)
      .then((r) => {
        if (!r.ok) throw new Error(`PDF HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      })
      .catch((e) => {
        if (!active) return;
        setPdfError(String(e));
      });
    return () => {
      active = false;
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [token]);

  const signerRole = data?.signer?.role;
  const signerId = data?.signer?.id;
  const fields = (data?.fields || []).filter((field: any) => {
    if (field.signer_id && signerId) {
      return field.signer_id === signerId;
    }
    if (field.role && signerRole) {
      return field.role === signerRole;
    }
    return true;
  });
  const payloadValues = useMemo(() => {
    const entries = Object.entries(fieldValues).map(([fid, meta]) => [
      fid,
      {
        type: meta.type,
        page: meta.page,
        x: meta.x,
        y: meta.y,
        w: meta.w,
        h: meta.h,
        value: meta.value,
      },
    ]);
    return Object.fromEntries(entries);
  }, [fieldValues]);

  if (!token) return <div>Missing token in URL.</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data) return <div>Loading…</div>;

  const handleFieldChange = (field: any, value: any) => {
    const key = String(field.id);
    setFieldValues((prev) => ({
      ...prev,
      [key]: { ...field, value },
    }));
  };

  return (
    <main>
      <h2>Sign: {data.envelope?.subject}</h2>
      <p>Signer: {data.signer?.name} ({data.signer?.email})</p>
      <Consent token={token} consented={consented} onToggle={setConsented} />
      <FieldInputs fields={fields} values={fieldValues} onChange={handleFieldChange} />
      <PdfViewer pdfUrl={pdfUrl} error={pdfError} />
      <Complete
        token={token}
        values={payloadValues}
        disabled={!consented}
        onResult={setCompleteStatus}
      />
      {completeStatus && <p style={{ marginTop: 12 }}>{completeStatus}</p>}
    </main>
  );
}

function Consent({ token, consented, onToggle }: { token: string; consented: boolean; onToggle: (value: boolean) => void }) {
  const base = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    if (!checked) {
      onToggle(false);
      return;
    }
    await fetch(`${base}/api/sign/${token}/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accepted: true }),
    });
    onToggle(true);
  };
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
      <input type="checkbox" checked={consented} onChange={onChange} />
      <span>I agree to use electronic records & signatures</span>
    </label>
  );
}

function Complete({
  token,
  values,
  disabled,
  onResult,
}: {
  token: string;
  values: Record<string, any>;
  disabled: boolean;
  onResult: (msg: string) => void;
}) {
  const base = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
  const onComplete = async () => {
    const missingRequired = Object.values(values).some((meta: any) => {
      if (!meta?.required) return false;
      if (meta.type === 'checkbox') return meta.value !== true;
      return !meta.value;
    });
    if (missingRequired) {
      alert('Please fill all required fields before completing.');
      return;
    }
    const payload = { values };
    const r = await fetch(`${base}/api/sign/${token}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) {
      onResult(j?.detail || 'Failed to complete.');
      return;
    }
    if (j.sealed && j.sha256_final) {
      onResult(`All signers complete. Final SHA256: ${j.sha256_final}`);
    } else if (j.status === 'waiting') {
      const remaining =
        typeof j.waiting_on === 'number' ? `${j.waiting_on} signer(s)` : 'other signers';
      onResult(`Thanks! Waiting on ${remaining} before sealing.`);
    } else if (j.sha256_final) {
      onResult(`Document sealed. SHA256: ${j.sha256_final}`);
    } else {
      onResult('Completion recorded. We will email the final packet once all signers finish.');
    }
  };
  return (
    <button style={{ marginTop: 12 }} onClick={onComplete} disabled={disabled}>
      Complete
    </button>
  );
}

function PdfViewer({ pdfUrl, error }: { pdfUrl: string | null; error: string | null }) {
  if (error) {
    return <div style={{ marginTop: 16, color: 'red' }}>Failed to load PDF: {error}</div>;
  }
  if (!pdfUrl) {
    return <div style={{ marginTop: 16 }}>Loading PDF…</div>;
  }
  return (
    <iframe
      title="Document preview"
      src={pdfUrl}
      style={{ marginTop: 16, width: '100%', height: 600, border: '1px solid #ccc' }}
    />
  );
}

function FieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: any[];
  values: Record<string, any>;
  onChange: (field: any, value: any) => void;
}) {
  if (!fields.length) {
    return <p style={{ marginTop: 16 }}>No signing fields configured.</p>;
  }
  return (
    <section style={{ marginTop: 16 }}>
      <h3>Fields</h3>
      {fields.map((field) => {
        const key = String(field.id);
        const current = values[key]?.value;
        return (
          <div key={key} style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600 }}>
              {field.name || field.type} {field.required ? '*' : ''}
            </label>
            <FieldInput field={field} value={current} onChange={(val) => onChange(field, val)} />
          </div>
        );
      })}
    </section>
  );
}

function FieldInput({ field, value, onChange }: { field: any; value: any; onChange: (val: any) => void }) {
  if (field.type === 'text') {
    return (
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', padding: 6 }}
      />
    );
  }
  if (field.type === 'date') {
    return (
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: 6 }}
      />
    );
  }
  if (field.type === 'checkbox') {
    return (
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span>Check to confirm</span>
      </label>
    );
  }
  if (field.type === 'signature' || field.type === 'initials') {
    return <SignaturePad value={value} onChange={onChange} />;
  }
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', padding: 6 }}
    />
  );
}

function SignaturePad({ value, onChange }: { value: string | null; onChange: (val: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const getPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;
    const handleResize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = width;
      canvas.height = height;
      ctxRef.current?.clearRect(0, 0, width, height);
      if (value) {
        const img = new Image();
        img.onload = () => ctxRef.current?.drawImage(img, 0, 0, width, height);
        img.src = `data:image/png;base64,${value}`;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [value]);

  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPoint.current = getPoint(event);
  };

  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    event.preventDefault();
    const ctx = ctxRef.current;
    if (!ctx || !lastPoint.current) return;
    const point = getPoint(event);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
  };

  const stopDrawing = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1] || dataUrl;
    onChange(base64);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: 8 }}>
      <div
        style={{
          marginBottom: 8,
          fontSize: 12,
          color: '#555',
        }}
      >
        Draw with your mouse or finger. Your strokes are captured as you release.
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 220, border: '1px solid #ddd', touchAction: 'none' }}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button type="button" onClick={clear}>
          Clear
        </button>
        <span style={{ fontSize: 12, color: '#777' }}>Signature preview updates when you lift your finger/mouse.</span>
      </div>
      {value ? (
        <div style={{ marginTop: 8 }}>
          <small>Captured</small>
          <img src={`data:image/png;base64,${value}`} alt="Signature preview" style={{ display: 'block', marginTop: 4 }} />
        </div>
      ) : (
        <small>Draw your signature above.</small>
      )}
    </div>
  );
}
