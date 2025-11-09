'use client';

import { useEffect, useRef, useState, PointerEvent as ReactPointerEvent } from 'react';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf';

if (typeof window !== 'undefined') {
  GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

type FieldType = 'signature' | 'text' | 'date' | 'checkbox';

type Field = {
  id: string;
  pageIndex: number;
  type: FieldType;
  name: string;
  role: string;
  required: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  signerClientId: string | null;
};

type PageRender = {
  pageIndex: number;
  dataUrl: string;
  width: number;
  height: number;
  scale: number;
  baseWidth: number;
  baseHeight: number;
};

type DevMagicLink = {
  signer: { id: number; name: string; email: string };
  link: string;
  token: string;
};

type ProjectSummary = {
  id: number;
  name: string;
};

type ProjectInvestor = {
  id: number;
  name: string;
  email: string;
  role: string;
  routing_order: number;
  units_invested: number;
};


const FIELD_DEFAULTS: Record<FieldType, { width: number; height: number }> = {
  signature: { width: 240, height: 90 },
  text: { width: 200, height: 36 },
  date: { width: 140, height: 32 },
  checkbox: { width: 24, height: 24 },
};

const FIELD_LABELS: Record<FieldType, string> = {
  signature: 'Signature',
  text: 'Text',
  date: 'Date',
  checkbox: 'Checkbox',
};

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createSigner = (order: number): SignerForm => ({
  id: randomId(),
  projectInvestorId: null,
  name: '',
  email: '',
  role: 'Signer',
  routing_order: order,
});

export default function DesignerPage() {
  const baseApi = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectInvestors, setProjectInvestors] = useState<ProjectInvestor[]>([]);
  const [investorsLoading, setInvestorsLoading] = useState(false);
  const [documentInfo, setDocumentInfo] = useState<{ id: number; filename: string } | null>(null);
  const [pdfPages, setPdfPages] = useState<PageRender[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [activeTool, setActiveTool] = useState<FieldType | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [subject, setSubject] = useState('Please sign');
  const [message, setMessage] = useState('Kindly review and sign this packet.');
  const [exportJson, setExportJson] = useState('');
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [magicLinks, setMagicLinks] = useState<DevMagicLink[]>([]);
  const defaultFieldRole = 'Investor';
  const dragRef = useRef<null | {
    id: string;
    mode: 'move' | 'resize';
    rectLeft: number;
    rectTop: number;
    offsetX: number;
    offsetY: number;
    startWidth: number;
    startHeight: number;
    startPointerX: number;
    startPointerY: number;
    pageIndex: number;
  }>(null);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

const refreshProjects = async () => {
  setProjectsLoading(true);
  try {
    const resp = await fetch(`${baseApi}/api/projects`);
    if (!resp.ok) throw new Error(`Failed to load projects (${resp.status})`);
      const list = await resp.json();
      setProjects(list || []);
      if (list?.length && !selectedProjectId) {
        setSelectedProjectId(list[0].id);
      }
    } catch (err) {
      console.warn('project load failed', err);
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setProjectsLoading(false);
  }
};

useEffect(() => {
  refreshProjects();
}, [baseApi]);

const refreshInvestors = async (projectId: number) => {
  if (!projectId) return;
  setInvestorsLoading(true);
  try {
    const resp = await fetch(`${baseApi}/api/projects/${projectId}/investors`);
    if (!resp.ok) throw new Error(`Failed to load investors (${resp.status})`);
    const list = await resp.json();
    setProjectInvestors(list || []);
  } catch (err) {
    console.warn('investor load failed', err);
    setError(err instanceof Error ? err.message : 'Failed to load investors');
  } finally {
    setInvestorsLoading(false);
  }
};

useEffect(() => {
  if (selectedProjectId) {
    refreshInvestors(selectedProjectId);
  } else {
    setProjectInvestors([]);
  }
}, [selectedProjectId]);

useEffect(() => {
  setFields((prev) => prev.map((field) => ({ ...field, role: field.role || defaultFieldRole })));
}, [defaultFieldRole]);
useEffect(() => {
  if (!projectInvestors.length) return;
  setFields((prev) =>
    prev.map((field) => {
      if (!field.signerClientId) return field;
      const exists = projectInvestors.some(
        (inv) => String(inv.id) === field.signerClientId,
      );
      if (exists) return field;
      const fallback = projectInvestors[0];
      return { ...field, signerClientId: fallback?.id?.toString() || null };
    }),
  );
}, [projectInvestors.map((inv) => inv.id).join('|')]);

  const onPointerMove = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const meta = pdfPages.find((p) => p.pageIndex === drag.pageIndex);
    if (!meta) return;
    setFields((prev) =>
      prev.map((field) => {
        if (field.id !== drag.id) return field;
        if (drag.mode === 'move') {
          const nextX = clamp(event.clientX - drag.rectLeft - drag.offsetX, 0, meta.width - field.width);
          const nextY = clamp(event.clientY - drag.rectTop - drag.offsetY, 0, meta.height - field.height);
          return { ...field, x: nextX, y: nextY };
        }
        const deltaX = event.clientX - drag.startPointerX;
        const deltaY = event.clientY - drag.startPointerY;
        const resizedWidth = clamp(drag.startWidth + deltaX, 16, meta.width - field.x);
        const resizedHeight = clamp(drag.startHeight + deltaY, 16, meta.height - field.y);
        return { ...field, width: resizedWidth, height: resizedHeight };
      }),
    );
  };

  const onPointerUp = () => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>, field: Field, mode: 'move' | 'resize') => {
    event.preventDefault();
    const container = event.currentTarget.closest('[data-page-container]') as HTMLElement | null;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    dragRef.current = {
      id: field.id,
      mode,
      rectLeft: rect.left,
      rectTop: rect.top,
      offsetX: event.clientX - rect.left - field.x,
      offsetY: event.clientY - rect.top - field.y,
      startWidth: field.width,
      startHeight: field.height,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      pageIndex: field.pageIndex,
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const loadPdfFromArrayBuffer = async (buffer: ArrayBuffer) => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf');
    setLoadingPdf(true);
    setError(null);
    try {
      const typedArray = new Uint8Array(buffer);
      const pdf = await pdfjs.getDocument({ data: typedArray }).promise;
      const pages: PageRender[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const maxWidth = Math.min(900, window.innerWidth - 80);
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
      setPdfPages(pages);
      setFields([]);
      setSelectedFieldId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse PDF');
      throw err;
    } finally {
      setLoadingPdf(false);
    }
  };

  const uploadDocumentToProject = async (file: File) => {
    const projectNumeric = selectedProjectId;
    if (!projectNumeric) {
      setError('Select a project before uploading a PDF.');
      throw new Error('Missing project id');
    }
    setUploadingDoc(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${baseApi}/api/projects/${projectNumeric}/documents`, {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        const detail = await safeParseError(response);
        throw new Error(detail || `Upload failed (${response.status})`);
      }
      const doc = await response.json();
      setDocumentInfo(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
      throw err;
    } finally {
      setUploadingDoc(false);
    }
  };

const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await loadPdfFromArrayBuffer(await file.arrayBuffer());
      await uploadDocumentToProject(file);
    } catch {
      /* handled in helpers */
    }
  };

  const handleUrlLoad = async () => {
    const url = prompt('Enter direct PDF URL');
    if (!url) return;
    try {
      setLoadingPdf(true);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch PDF (${response.status})`);
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      await loadPdfFromArrayBuffer(buffer);
      const filename = url.split('/').pop() || 'remote.pdf';
      const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
      await uploadDocumentToProject(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PDF');
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleCreateInvestor = async () => {
    if (!selectedProjectId) {
      setError('Select a project before adding investors.');
      return;
    }
    if (!investorForm.name.trim() || !investorForm.email.trim()) {
      setError('Investor name and email are required.');
      return;
    }
    try {
      setInvestorsLoading(true);
      const resp = await fetch(`${baseApi}/api/projects/${selectedProjectId}/investors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: investorForm.name,
          email: investorForm.email,
          units_invested: Number(investorForm.units) || 0,
        }),
      });
      if (!resp.ok) {
        const detail = await safeParseError(resp);
        throw new Error(detail || 'Failed to create investor');
      }
      setInvestorForm({ name: '', email: '', units: 0 });
      await refreshInvestors(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create investor');
    } finally {
      setInvestorsLoading(false);
    }
  };

  const handlePageClick = (event: ReactPointerEvent<HTMLDivElement>, page: PageRender) => {
    if (!activeTool) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    const defaults = FIELD_DEFAULTS[activeTool];
    const defaultSignerKey = projectInvestors[0]?.id?.toString() || null;
  const newField: Field = {
    id: randomId(),
    pageIndex: page.pageIndex,
    type: activeTool,
    name: `${FIELD_LABELS[activeTool]} ${fields.length + 1}`,
    role: defaultFieldRole,
    required: true,
    x: clamp(clickX - defaults.width / 2, 0, Math.max(0, page.width - defaults.width)),
    y: clamp(clickY - defaults.height / 2, 0, Math.max(0, page.height - defaults.height)),
    width: defaults.width,
    height: defaults.height,
    signerClientId: defaultSignerKey,
  };
    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newField.id);
  };

  const updateField = (id: string, patch: Partial<Field>) => {
    setFields((prev) => prev.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  };

  const buildFieldPayload = () => {
    if (!pdfPages.length) return [];
    return fields
      .map((field) => {
        const meta = pdfPages.find((p) => p.pageIndex === field.pageIndex);
        if (!meta) return null;
        const pdfX = Number((field.x / meta.scale).toFixed(2));
        const pdfWidth = Number((field.width / meta.scale).toFixed(2));
        const pdfHeight = Number((field.height / meta.scale).toFixed(2));
        const pdfY = Number((meta.baseHeight - (field.y + field.height) / meta.scale).toFixed(2));
        return {
          page: field.pageIndex + 1,
          x: pdfX,
          y: pdfY,
          w: pdfWidth,
          h: pdfHeight,
          type: field.type,
          required: field.required,
          role: field.role,
          name: field.name || undefined,
          signer_key: field.signerClientId || undefined,
        };
      })
      .filter(Boolean) as Array<{
      page: number;
      x: number;
      y: number;
      w: number;
      h: number;
      type: FieldType;
      required: boolean;
      role: string;
      name?: string;
    }>;
  };

  const exportFields = () => {
    const payload = buildFieldPayload();
    setExportJson(payload.length ? JSON.stringify(payload, null, 2) : '');
  };

  const copyExport = async () => {
    if (!exportJson) return;
    try {
      await navigator.clipboard.writeText(exportJson);
      alert('Copied JSON to clipboard');
    } catch {
      alert('Clipboard copy failed. Select and copy manually.');
    }
  };


  const submitEnvelope = async () => {
    const fieldPayload = buildFieldPayload();
    const projectNumeric = selectedProjectId;
    const investorIds = Array.from(
      new Set(
        fields
          .map((field) => field.signerClientId)
          .filter((key): key is string => Boolean(key)),
      ),
    );
    const readySigners = investorIds
      .map((id) => {
        const investor = projectInvestors.find((inv) => String(inv.id) === id);
        if (!investor) return null;
        return {
          project_investor_id: investor.id,
          name: investor.name,
          email: investor.email,
          role: investor.role,
          routing_order: investor.routing_order,
        };
      })
      .filter(Boolean);
    if (!projectNumeric) {
      setError('Select a project.');
      return;
    }
    if (!documentInfo) {
      setError('Upload a PDF to this project before submitting.');
      return;
    }
    if (!fieldPayload.length) {
      setError('Place at least one field on the PDF.');
      return;
    }
    if (!readySigners.length) {
      setError('Assign each field to a project investor.');
      return;
    }
    setSubmitting(true);
    setSubmissionStatus('Creating envelope…');
    setError(null);
    setMagicLinks([]);
    try {
      const createResp = await fetch(`${baseApi}/api/envelopes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectNumeric,
          document_id: documentInfo.id,
          subject,
          message,
          signers: readySigners.map((signer, index) => ({
            client_id: `investor-${signer.project_investor_id}`,
            project_investor_id: signer.project_investor_id,
            name: signer.name,
            email: signer.email,
            role: signer.role,
            routing_order: index + 1,
          })),
          fields: fieldPayload,
        }),
      });
      if (!createResp.ok) {
        const detail = await safeParseError(createResp);
        throw new Error(detail || `Create envelope failed (${createResp.status})`);
      }
      const created = await createResp.json();
      setSubmissionStatus(`Envelope ${created.id} created. Sending…`);

      const sendResp = await fetch(`${baseApi}/api/envelopes/${created.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!sendResp.ok) {
        const detail = await safeParseError(sendResp);
        throw new Error(detail || 'Failed to send envelope');
      }

      const linksResp = await fetch(`${baseApi}/api/envelopes/${created.id}/dev-magic-links`);
      if (!linksResp.ok) {
        const detail = await safeParseError(linksResp);
        throw new Error(detail || 'Failed to fetch magic links');
      }
      const linksJson = await linksResp.json();
      const withToken = (linksJson.links || []).map((entry: DevMagicLink) => {
        const token = entry.link.split('/').pop() || '';
        return { ...entry, token };
      });
      setMagicLinks(withToken);
      setSubmissionStatus('Envelope sent. Magic link ready below.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit envelope');
      setSubmissionStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'flex-start' }}>
      <section>
        <header style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <h2>Document setup</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Project</span>
              <select
                value={selectedProjectId ?? ''}
                onChange={(event) => setSelectedProjectId(event.target.value ? Number(event.target.value) : null)}
                style={{ padding: 6 }}
              >
                <option value="" disabled>
                  {projectsLoading ? 'Loading projects…' : 'Select a project'}
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} (#{project.id})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Upload PDF</span>
              <input type="file" accept="application/pdf" onChange={handleFileChange} disabled={!selectedProjectId || uploadingDoc} />
            </label>
            <button type="button" onClick={handleUrlLoad} disabled={!selectedProjectId} style={{ alignSelf: 'end', height: 38 }}>
              Load via URL
            </button>
            <button type="button" onClick={refreshProjects} style={{ alignSelf: 'end', height: 38 }}>
              {projectsLoading ? 'Refreshing…' : 'Refresh projects'}
            </button>
          </div>
          <p style={{ marginTop: 8, fontSize: 13, color: '#555' }}>
            Uploading here stores the PDF in <strong>{projectLabel(selectedProjectId, projects)}</strong> so you can immediately build an envelope.
          </p>
          {documentInfo && (
            <p style={{ marginTop: 4, fontSize: 13 }}>
              Active document: <strong>{documentInfo.filename}</strong> (id {documentInfo.id})
            </p>
          )}
          {(loadingPdf || uploadingDoc) && <p style={{ color: '#2563eb', marginTop: 8 }}>Processing PDF…</p>}
          {error && <p style={{ color: 'red', marginTop: 8 }}>{error}</p>}
        </header>

        {selectedProjectId && (
          <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Project investors</h3>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" onClick={() => refreshInvestors(selectedProjectId)}>
                  {investorsLoading ? 'Refreshing…' : 'Refresh'}
                </button>
                <a href="/projects" style={{ alignSelf: 'center', fontSize: 13, color: '#2563eb' }}>
                  Manage in Projects →
                </a>
              </div>
            </div>
            {!projectInvestors.length ? (
              <p style={{ fontSize: 13, color: '#555' }}>No investors yet. Use the Projects page to add them.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {projectInvestors.map((inv) => (
                  <li key={inv.id} style={{ fontSize: 13 }}>
                    {inv.name} — {inv.email} ({inv.units_invested} units)
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <Toolbar activeTool={activeTool} onSelect={setActiveTool} />
        {!pdfPages.length && <p style={{ marginTop: 16 }}>Upload a PDF to begin placing fields.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginTop: 24 }}>
          {pdfPages.map((page) => (
            <div
              key={page.pageIndex}
              data-page-container
              style={{ position: 'relative', width: page.width, margin: '0 auto' }}
              onClick={(event) => handlePageClick(event, page)}
            >
              <img src={page.dataUrl} alt={`Page ${page.pageIndex + 1}`} style={{ width: '100%', display: 'block' }} />
              {fields
                .filter((field) => field.pageIndex === page.pageIndex)
                .map((field) => (
                  <div
                    key={field.id}
                    onPointerDown={(event) => startDrag(event, field, 'move')}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedFieldId(field.id);
                    }}
                    style={{
                      position: 'absolute',
                      left: field.x,
                      top: field.y,
                      width: field.width,
                      height: field.height,
                      border: field.id === selectedFieldId ? '2px solid #2563eb' : '1px solid #111',
                      background: 'rgba(37,99,235,0.1)',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'move',
                      userSelect: 'none',
                    }}
                  >
                    {FIELD_LABELS[field.type]}
                    <div
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        startDrag(event, field, 'resize');
                      }}
                      style={{
                        position: 'absolute',
                        right: -7,
                        bottom: -7,
                        width: 14,
                        height: 14,
                        background: '#2563eb',
                        borderRadius: '50%',
                        cursor: 'nwse-resize',
                      }}
                    />
                  </div>
                ))}
            </div>
          ))}
        </div>
      </section>

      <section style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <h3>Fields</h3>
          {!fields.length && <p>No fields yet. Select a tool and click on the PDF.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {fields.map((field) => (
              <div
                key={field.id}
                style={{
                  border: field.id === selectedFieldId ? '2px solid #2563eb' : '1px solid #ddd',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{field.name || FIELD_LABELS[field.type]}</strong>
                  <button type="button" onClick={() => setFields((prev) => prev.filter((f) => f.id !== field.id))}>
                    Remove
                  </button>
                </div>
                <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Display name</label>
                <input
                  type="text"
                  value={field.name}
                  onChange={(event) => updateField(field.id, { name: event.target.value })}
                  style={{ width: '100%', padding: 6 }}
                />
                <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Type</label>
                <select
                  value={field.type}
                  onChange={(event) => updateField(field.id, { type: event.target.value as FieldType })}
                  style={{ width: '100%', padding: 6 }}
                >
                  {Object.entries(FIELD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Role</label>
                <input
                  type="text"
                  value={field.role}
                  onChange={(event) => updateField(field.id, { role: event.target.value })}
                  style={{ width: '100%', padding: 6 }}
                />
                <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Assigned signer</label>
                <select
                  value={field.signerClientId || ''}
                  onChange={(event) => {
                    const value = event.target.value || null;
                    const investor =
                      value && projectInvestors.find((inv) => String(inv.id) === value);
                    updateField(field.id, {
                      signerClientId: value,
                      name: investor ? `${investor.name} signature` : field.name,
                    });
                  }}
                  style={{ width: '100%', padding: 6 }}
                >
                  <option value="">(Any signer)</option>
                  {projectInvestors.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.email})
                    </option>
                  ))}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) => updateField(field.id, { required: event.target.checked })}
                  />
                  Required
                </label>
                <p style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                  Page {field.pageIndex + 1} · X {Math.round(field.x)} px · Y {Math.round(field.y)} px
                </p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Envelope settings & actions</h3>
          <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Subject</label>
          <input type="text" value={subject} onChange={(event) => setSubject(event.target.value)} style={{ width: '100%', padding: 6 }} />
          <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Message</label>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} style={{ width: '100%', padding: 6 }} />
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={exportFields} disabled={!fields.length}>
              Generate JSON
            </button>
            <button type="button" onClick={copyExport} disabled={!exportJson}>
              Copy JSON
            </button>
            <button type="button" onClick={submitEnvelope} disabled={submitting || !documentInfo || !fields.length}>
              {submitting ? 'Submitting…' : 'Submit envelope & send'}
            </button>
          </div>
          <pre style={{ marginTop: 12, maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: 12 }}>
            {exportJson || '// Generated field JSON will appear here'}
          </pre>
          {submissionStatus && <p style={{ marginTop: 12, color: '#2563eb' }}>{submissionStatus}</p>}
          {!!magicLinks.length && (
            <div style={{ marginTop: 12 }}>
              <p>Magic links (debug only):</p>
              <ul style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {magicLinks.map((entry) => (
                  <li key={entry.signer.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8 }}>
                    <strong>{entry.signer.name}</strong> —{' '}
                    <a href={entry.link} target="_blank" rel="noreferrer">
                      {entry.link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Toolbar({ activeTool, onSelect }: { activeTool: FieldType | null; onSelect: (tool: FieldType | null) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {Object.entries(FIELD_LABELS).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(activeTool === value ? null : (value as FieldType))}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: activeTool === value ? '2px solid #2563eb' : '1px solid #ccc',
            background: activeTool === value ? '#e0e7ff' : '#fff',
            cursor: 'pointer',
          }}
        >
          {label}
        </button>
      ))}
      <button type="button" onClick={() => onSelect(null)} style={{ marginLeft: 'auto' }}>
        Cancel
      </button>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function projectLabel(id: number | null, projects: ProjectSummary[]) {
  if (!id) return 'no project selected';
  const project = projects.find((p) => p.id === id);
  return project ? `${project.name} (#${project.id})` : `Project #${id}`;
}

async function safeParseError(response: Response) {
  try {
    const data = await response.json();
    if (data?.detail) {
      if (typeof data.detail === 'string') return data.detail;
      if (Array.isArray(data.detail)) {
        return data.detail.map((d) => (typeof d === 'string' ? d : d.msg || JSON.stringify(d))).join(', ');
      }
    }
  } catch {
    // ignore
  }
  return null;
}
