'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, CSSProperties } from 'react';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf';
import { useParams } from 'next/navigation';

type PageRender = {
  pageIndex: number;
  dataUrl: string;
  width: number;
  height: number;
  scale: number;
  baseWidth: number;
  baseHeight: number;
};

type CompletionResult = {
  message: string;
  sealed?: boolean;
  waitingOn?: number;
  status?: string;
  sha?: string;
};

export default function SignPage() {
  if (typeof window !== 'undefined') {
    GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<PageRender[]>([]);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);
  const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

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
    let cancelled = false;
    const preferFinal = Boolean((completion && completion.sealed) || data?.final_artifact?.sha256_final);
    setPdfError(null);
    setPdfPages([]);
    setPdfLoading(true);
    const loadPdf = async () => {
      try {
        const loadFromEndpoint = async (endpoint: 'pdf' | 'final-pdf') => {
          const r = await fetch(`${base}/api/sign/${token}/${endpoint}`);
          return r;
        };
        let response = await loadFromEndpoint(preferFinal ? 'final-pdf' : 'pdf');
        if (preferFinal && response.status === 404) {
          response = await loadFromEndpoint('pdf');
        }
        if (!response.ok) {
          throw new Error(`PDF HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        const pages = await renderPdfPages(buffer);
        if (!cancelled) setPdfPages(pages);
      } catch (e) {
        if (!cancelled) setPdfError(String(e));
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    };
    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [token, completion?.sealed, data?.final_artifact?.sha256_final]);

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
        required: meta.required,
      },
    ]);
    return Object.fromEntries(entries);
  }, [fieldValues]);

  useEffect(() => {
    if (!data?.signer?.status) return;
    if (data.signer.status !== 'completed') return;
    const finalSha = data.final_artifact?.sha256_final;
    const waiting = data.waiting_on ?? 0;
    const sealed = Boolean(finalSha);
    let message = 'Your signature has been recorded.';
    if (sealed && finalSha) {
      message = `All signers complete. Final SHA256: ${finalSha}`;
    } else if (waiting > 0) {
      const noun = waiting === 1 ? 'signer' : 'signers';
      message = `You're all set. Waiting on ${waiting} ${noun} before sealing.`;
    }
    setCompletion({
      message,
      sealed,
      waitingOn: waiting,
      status: sealed ? 'sealed' : waiting > 0 ? 'waiting' : 'completed',
      sha: finalSha,
    });
    setStatusMessage(message);
  }, [data?.signer?.status, data?.final_artifact?.sha256_final, data?.waiting_on]);

  const handleFieldChange = (field: any, value: any) => {
    const key = String(field.id);
    setFieldValues((prev) => ({
      ...prev,
      [key]: { ...field, value },
    }));
  };

  const documentLabel =
    data?.envelope?.subject ||
    data?.envelope?.name ||
    data?.document?.filename ||
    'Document';
  const showFinalPdf = Boolean((completion && completion.sealed) || data?.final_artifact?.sha256_final);

  const hasMissingRequired = useMemo(() => {
    return fields.some((field: any) => {
      const mustFill =
        Boolean(field?.required) || field.type === 'signature' || field.type === 'initials';
      if (!mustFill) return false;
      const meta = fieldValues[String(field.id)];
      if (!meta) return true;
      if (field.type === 'checkbox') return meta.value !== true;
      return !meta.value;
    });
  }, [fields, fieldValues]);

  const mainContent = completion ? (
    <CompletionView
      info={completion}
      pages={pdfPages}
      loading={pdfLoading}
      error={pdfError}
      fields={fields}
      values={fieldValues}
      renderOverlays={!showFinalPdf}
    />
  ) : (
    <div className="sign-content">
      <div className="sign-columns">
        <section className="sign-doc-section">
          <PdfSigningSurface
            pages={pdfPages}
            loading={pdfLoading}
            error={pdfError}
            fields={fields}
            values={fieldValues}
            onChange={handleFieldChange}
          />
        </section>
        <aside className="sign-sidebar">
          <div className="sign-sidebar-card">
            <Consent token={token} consented={consented} onToggle={setConsented} />
            <div className="sign-sidebar-action">
              <Complete
                token={token}
                values={payloadValues}
                disabled={!consented || hasMissingRequired}
                onSuccess={(info) => {
                  setStatusMessage(info.message);
                  setCompletion(info);
                }}
                onError={(msg) => setStatusMessage(msg)}
              />
            </div>
          </div>
          {!completion && statusMessage && <p className="status-message">{statusMessage}</p>}
        </aside>
      </div>
    </div>
  );

  if (!token) {
    return <div>Missing token in URL.</div>;
  }
  if (error) {
    return <div>Error: {error}</div>;
  }
  if (!data) {
    return <div>Loading…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Document</p>
          <strong style={{ fontSize: 18 }}>{documentLabel}</strong>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Signer</p>
          <strong style={{ fontSize: 16 }}>{data.signer?.name}</strong>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{data.signer?.email}</div>
        </div>
      </header>
      {mainContent}
      <style jsx>{`
        .sign-content {
          flex: 1;
          padding: 24px;
        }
        .sign-columns {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 24px;
          align-items: flex-start;
        }
        .sign-doc-section {
          max-height: calc(100vh - 160px);
          min-height: calc(100vh - 160px);
          overflow-y: auto;
          padding-right: 8px;
          padding-bottom: 32px;
        }
        .sign-sidebar {
          position: sticky;
          top: 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .sign-sidebar.completion {
          position: static;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 24px 28px;
          background: #fff;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .sign-sidebar-card {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 24px 28px;
          background: #fff;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .sign-sidebar-action {
          padding-top: 4px;
        }
        .status-message {
          margin-top: 8px;
          color: #2563eb;
        }
        .sign-content.completion {
          height: calc(100vh - 78px);
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 24px;
          overflow: hidden;
        }
        .completion-wrapper {
          flex: 1;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          min-height: 0;
        }
        .completion-panel {
          position: sticky;
          top: 80px;
          z-index: 10;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          padding: 24px 28px;
          border: 1px solid #e5e7eb;
          border-radius: 20px;
          background: #ffffff;
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.06);
        }
        .completion-panel .label {
          margin: 0;
          font-size: 12px;
          color: #6b7280;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }
        .completion-panel .status-title {
          font-size: 22px;
          margin: 4px 0 0;
          color: #0f172a;
        }
        .completion-panel .message {
          margin: 0;
          font-size: 14px;
          color: #0f172a;
          line-height: 1.5;
          max-width: 440px;
        }
        .completion-viewer {
          flex: 1;
          min-height: 0;
          border: 1px solid #e5e7eb;
          border-radius: 24px;
          background: #fff;
          padding: 28px;
          box-shadow: 0 20px 60px rgba(12, 19, 43, 0.08);
          overflow-y: auto;
        }
        @media (max-width: 1080px) {
          .sign-columns {
            grid-template-columns: 1fr;
          }
          .sign-sidebar {
            position: static;
          }
          .sign-sidebar-card {
            order: 2;
          }
        }
        @media (max-width: 640px) {
          .sign-sidebar-card {
            padding: 20px;
          }
        }
      `}</style>
    </div>
  );
}

function Consent({ token, consented, onToggle }: { token: string; consented: boolean; onToggle: (value: boolean) => void }) {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
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
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={consented}
        onChange={onChange}
        style={{ width: 20, height: 20, marginTop: 2 }}
      />
      <span style={{ fontSize: 14, lineHeight: 1.4 }}>I agree to use electronic records & signatures</span>
    </label>
  );
}

function Complete({
  token,
  values,
  disabled,
  onSuccess,
  onError,
}: {
  token: string;
  values: Record<string, any>;
  disabled: boolean;
  onSuccess: (info: CompletionResult) => void;
  onError: (msg: string) => void;
}) {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
  const [sending, setSending] = useState(false);
  const onComplete = async () => {
    const missingRequired = Object.values(values).some((meta: any) => {
      const mustFill =
        Boolean(meta?.required) || meta.type === 'signature' || meta.type === 'initials';
      if (!mustFill) return false;
      if (meta.type === 'checkbox') return meta.value !== true;
      return !meta.value;
    });
    if (missingRequired) {
      alert('Please fill all required fields before completing.');
      return;
    }
    setSending(true);
    const payload = { values };
    const r = await fetch(`${base}/api/sign/${token}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) {
      onError(j?.detail || 'Failed to complete.');
      setSending(false);
      return;
    }
    let message = 'Completion recorded. We will email the final packet once all signers finish.';
    if (j.sealed && j.sha256_final) {
      message = `All signers complete. Final SHA256: ${j.sha256_final}`;
    } else if (j.status === 'waiting') {
      const remaining =
        typeof j.waiting_on === 'number' ? `${j.waiting_on} signer(s)` : 'other signers';
      message = `Thanks! Waiting on ${remaining} before sealing.`;
    } else if (j.sha256_final) {
      message = `Document sealed. SHA256: ${j.sha256_final}`;
    } else if (j.status === 'completed') {
      message = 'Your signature has been recorded.';
    }
    onSuccess({
      message,
      status: j.status || (j.sealed ? 'sealed' : undefined),
      waitingOn: j.waiting_on,
      sealed: Boolean(j.sealed),
      sha: j.sha256_final,
    });
    setSending(false);
  };
  return (
      <button
        onClick={onComplete}
        disabled={disabled || sending}
        style={{
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '14px 36px',
          fontSize: 16,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          cursor: disabled || sending ? 'not-allowed' : 'pointer',
          opacity: disabled || sending ? 0.6 : 1,
          width: '100%',
        }}
      >
        {sending && (
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.4)',
              borderTopColor: '#fff',
              display: 'inline-block',
              animation: 'spin 0.9s linear infinite',
            }}
          />
        )}
        {sending ? 'Finishing…' : 'Finish and Sign'}
      </button>
  );
}


function PdfSigningSurface({
  pages,
  loading,
  error,
  fields,
  values,
  onChange,
  mode = 'edit',
  renderOverlays = true,
}: {
  pages: PageRender[];
  loading: boolean;
  error: string | null;
  fields: any[];
  values: Record<string, any>;
  onChange: (field: any, value: any) => void;
  mode?: 'edit' | 'view';
  renderOverlays?: boolean;
}) {
  if (error) {
    return <div style={{ marginTop: 16, color: 'red' }}>Failed to load PDF: {error}</div>;
  }
  if (loading || !pages.length) {
    return <div style={{ marginTop: 16 }}>Loading PDF…</div>;
  }
  return (
    <section style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 32 }}>
      {pages.map((page) => {
        const pageFields = fields.filter((field) => (field.page || 1) === page.pageIndex + 1);
        return (
          <div
            key={page.pageIndex}
            style={{ position: 'relative', width: page.width, margin: '0 auto', boxShadow: '0 10px 25px rgba(15,23,42,0.1)' }}
          >
            <img src={page.dataUrl} alt={`Page ${page.pageIndex + 1}`} style={{ width: '100%', display: 'block' }} />
            {renderOverlays &&
              pageFields.map((field) => (
                <FieldOverlay
                  key={field.id}
                  field={field}
                  pageMeta={page}
                  value={values[String(field.id)]?.value}
                  onChange={onChange}
                  mode={mode}
                />
              ))}
          </div>
        );
      })}
    </section>
  );
}

function FieldOverlay({
  field,
  pageMeta,
  value,
  onChange,
  mode,
}: {
  field: any;
  pageMeta: PageRender;
  value: any;
  onChange: (field: any, value: any) => void;
  mode: 'edit' | 'view';
}) {
  const screenWidth = field.w * pageMeta.scale;
  const screenHeight = field.h * pageMeta.scale;
  const screenX = field.x * pageMeta.scale;
  const screenY = (pageMeta.baseHeight - (field.y + field.h)) * pageMeta.scale;
  const baseStyle = {
    position: 'absolute' as const,
    left: screenX,
    top: screenY,
    width: screenWidth,
    height: screenHeight,
    boxSizing: 'border-box' as const,
    pointerEvents: mode === 'view' ? 'none' : ('auto' as const),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (field.type === 'text') {
    if (mode === 'view') {
      return (
        <div
          style={{
            ...baseStyle,
            border: '1px solid #cbd5f5',
            borderRadius: 4,
            background: 'rgba(255,255,255,0.9)',
            justifyContent: 'flex-start',
            padding: '0 6px',
          }}
        >
          <span style={{ fontSize: 12, color: '#0f172a' }}>{value || ''}</span>
        </div>
      );
    }
    return (
      <div style={baseStyle}>
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(field, e.target.value)}
          style={{
            width: '100%',
            height: '100%',
            padding: 6,
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid #94a3b8',
            borderRadius: 4,
            fontSize: 14,
          }}
        />
      </div>
    );
  }
  if (field.type === 'date') {
    if (mode === 'view') {
      return (
        <div
          style={{
            ...baseStyle,
            border: '1px solid #cbd5f5',
            borderRadius: 4,
            background: 'rgba(255,255,255,0.9)',
            justifyContent: 'flex-start',
            padding: '0 6px',
          }}
        >
          <span style={{ fontSize: 12, color: '#0f172a' }}>{value || ''}</span>
        </div>
      );
    }
    return (
      <div style={baseStyle}>
        <input
          type="date"
          value={value ?? ''}
          onChange={(e) => onChange(field, e.target.value)}
          style={{
            width: '100%',
            height: '100%',
            padding: 6,
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid #94a3b8',
            borderRadius: 4,
          }}
        />
      </div>
    );
  }
  if (field.type === 'checkbox') {
    if (mode === 'view') {
      return (
        <div
          style={{
            ...baseStyle,
            border: '2px solid #94a3b8',
            borderRadius: 4,
            background: 'rgba(255,255,255,0.9)',
          }}
        >
          {value ? <span style={{ fontSize: 16, color: '#0f172a' }}>✔</span> : null}
        </div>
      );
    }
    return (
      <div style={{ ...baseStyle, border: '2px solid #94a3b8', borderRadius: 4, background: 'rgba(255,255,255,0.9)' }}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(field, e.target.checked)}
          style={{ width: 20, height: 20 }}
        />
      </div>
    );
  }
  if (field.type === 'signature' || field.type === 'initials') {
    if (mode === 'view') {
      return (
        <div
          style={{
            ...baseStyle,
            border: '2px solid #2563eb',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.9)',
          }}
        >
          {value ? (
            <img
              src={`data:image/png;base64,${value}`}
              alt="Signature"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <span style={{ fontSize: 12, color: '#64748b' }}>Signature</span>
          )}
        </div>
      );
    }
    return (
      <SignatureFieldCanvas
        style={baseStyle}
        width={screenWidth}
        height={screenHeight}
        value={value}
        onChange={(val) => onChange(field, val)}
      />
    );
  }
  return null;
}

function SignatureFieldCanvas({
  style,
  width,
  height,
  value,
  onChange,
}: {
  style: CSSProperties;
  width: number;
  height: number;
  value: string | null;
  onChange: (val: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const ratioRef = useRef(1);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    ratioRef.current = ratio;
    const scaledWidth = Math.max(1, Math.round(width * ratio));
    const scaledHeight = Math.max(1, Math.round(height * ratio));
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctxRef.current = ctx;
    ctx.clearRect(0, 0, width, height);
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = `data:image/png;base64,${value}`;
    }
  }, [width, height, value]);

  const getPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

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
    ctx.lineWidth = 3;
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
    const ratio = ratioRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(ratio, ratio);
    onChange(null);
  };

  const compact = width < 200 || height < 110;
  const clearLabel = compact ? '✕' : 'Clear';
  return (
    <div
      style={{
        ...style,
        boxSizing: 'border-box',
        border: '2px dashed #2563eb',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.9)',
        overflow: 'visible',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <button
        type="button"
        onClick={clear}
        style={{
          position: 'absolute',
          top: compact ? -10 : -14,
          right: compact ? -10 : -14,
          background: 'rgba(15, 23, 42, 0.75)',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          padding: compact ? '0 6px' : '2px 10px',
          fontSize: compact ? 10 : 11,
          cursor: 'pointer',
          lineHeight: compact ? '20px' : '22px',
          minHeight: compact ? 20 : 24,
        }}
      >
        {clearLabel}
      </button>
    </div>
  );
}

function CompletionView({
  info,
  pages,
  loading,
  error,
  fields,
  values,
  renderOverlays = true,
}: {
  info: CompletionResult;
  pages: PageRender[];
  loading: boolean;
  error: string | null;
  fields: any[];
  values: Record<string, any>;
  renderOverlays?: boolean;
}) {
  return (
    <div className="completion-wrapper">
      <section className="completion-panel">
        <div>
          <p className="label">Status</p>
          <strong className="status-title">Document signed</strong>
        </div>
        <p className="message">{info.message}</p>
      </section>
      <section className="completion-viewer">
        <PdfSigningSurface
          pages={pages}
          loading={loading}
          error={error}
          fields={fields}
          values={values}
          onChange={() => {}}
          mode="view"
          renderOverlays={renderOverlays}
        />
      </section>
    </div>
  );
}

async function renderPdfPages(buffer: ArrayBuffer): Promise<PageRender[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf');
  const typedArray = new Uint8Array(buffer);
  const pdf = await pdfjs.getDocument({ data: typedArray }).promise;
  const pages: PageRender[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxWidth = Math.min(900, typeof window !== 'undefined' ? window.innerWidth - 80 : 900);
    const scale = Math.min(2, maxWidth / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to render PDF page');
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push({
      pageIndex: pageNumber - 1,
      dataUrl: canvas.toDataURL(),
      width: viewport.width,
      height: viewport.height,
      scale,
      baseWidth: baseViewport.width,
      baseHeight: baseViewport.height,
    });
  }
  return pages;
}
