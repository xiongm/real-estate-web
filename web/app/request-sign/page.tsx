'use client';

import { useEffect, useRef, useState, PointerEvent as ReactPointerEvent } from 'react';
import ProjectsPage from '../projects/page';
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

type DragDescriptor = {
  type: FieldType;
  investor: ProjectInvestor;
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

export default function RequestSignPage() {
  const baseApi = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectInvestors, setProjectInvestors] = useState<ProjectInvestor[]>([]);
  const [investorsLoading, setInvestorsLoading] = useState(false);
  const [documentInfo, setDocumentInfo] = useState<{ id: number; filename: string } | null>(null);
  const [pdfPages, setPdfPages] = useState<PageRender[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [draggingTool, setDraggingTool] = useState<DragDescriptor | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    type: FieldType;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [expandedInvestors, setExpandedInvestors] = useState<Record<number, boolean>>({});
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [projectsDirty, setProjectsDirty] = useState(false);
  const [subject, setSubject] = useState('Please sign');
  const [message] = useState('Kindly review and sign this packet.');
  const [exportJson, setExportJson] = useState('');
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [magicLinks, setMagicLinks] = useState<DevMagicLink[]>([]);
  const defaultFieldRole = 'Investor';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const toolDragHandlersRef = useRef<{
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
  } | null>(null);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (toolDragHandlersRef.current) {
        window.removeEventListener('pointermove', toolDragHandlersRef.current.move);
        window.removeEventListener('pointerup', toolDragHandlersRef.current.up);
      }
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
    if (!projectInvestors.length) {
      setExpandedInvestors({});
      return;
    }
    setExpandedInvestors((prev) => {
      const next: Record<number, boolean> = {};
      projectInvestors.forEach((inv) => {
        next[inv.id] = prev[inv.id] ?? true;
      });
      return next;
    });
  }, [projectInvestors]);
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
      setSubject(doc.filename || 'Please sign');
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

  const addFieldAtPosition = (descriptor: DragDescriptor, pageIndex: number, clickX: number, clickY: number) => {
    const pageMeta = pdfPages.find((p) => p.pageIndex === pageIndex);
    if (!pageMeta) return;
    const { type, investor } = descriptor;
    const defaults = FIELD_DEFAULTS[type];
    const newField: Field = {
      id: randomId(),
      pageIndex,
      type,
      name: `${investor.name} ${FIELD_LABELS[type]}`,
      role: investor.role || defaultFieldRole,
      required: true,
      x: clamp(clickX - defaults.width / 2, 0, Math.max(0, pageMeta.width - defaults.width)),
      y: clamp(clickY - defaults.height / 2, 0, Math.max(0, pageMeta.height - defaults.height)),
      width: defaults.width,
      height: defaults.height,
      signerClientId: investor.id ? String(investor.id) : null,
    };
    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newField.id);
  };

  const placeFieldFromDrag = (descriptor: DragDescriptor, clientX: number, clientY: number) => {
    const entries = Object.entries(pageRefs.current);
    for (const [key, node] of entries) {
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        addFieldAtPosition(descriptor, Number(key), clientX - rect.left, clientY - rect.top);
        return;
      }
    }
  };

  const beginToolDrag = (event: ReactPointerEvent<HTMLButtonElement>, type: FieldType, investor: ProjectInvestor) => {
    event.preventDefault();
    const descriptor: DragDescriptor = { type, investor };
    const defaults = FIELD_DEFAULTS[type];
    setDraggingTool(descriptor);
    setDragPreview({
      type,
      label: `${investor.name} ${FIELD_LABELS[type]}`,
      x: event.clientX,
      y: event.clientY,
      width: defaults.width,
      height: defaults.height,
    });
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      setDragPreview((prev) =>
        prev
          ? {
              ...prev,
              x: pointerEvent.clientX,
              y: pointerEvent.clientY,
            }
          : prev,
      );
    };
    const handlePointerUp = (pointerEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      toolDragHandlersRef.current = null;
      setDraggingTool(null);
      setDragPreview(null);
      placeFieldFromDrag(descriptor, pointerEvent.clientX, pointerEvent.clientY);
    };
    toolDragHandlersRef.current = { move: handlePointerMove, up: handlePointerUp };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const registerPageRef =
    (pageIndex: number) =>
    (node: HTMLDivElement | null) => {
      if (!node) {
        delete pageRefs.current[pageIndex];
        return;
      }
      pageRefs.current[pageIndex] = node;
    };

  const toggleInvestorExpansion = (investorId: number) => {
    setExpandedInvestors((prev) => ({
      ...prev,
      [investorId]: !(prev[investorId] ?? true),
    }));
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

  const documentLabel = documentInfo ? documentInfo.filename : 'No document uploaded yet';
  const selectedSignerId =
    (selectedFieldId && fields.find((field) => field.id === selectedFieldId)?.signerClientId) || null;
  const handleProjectsChange = () => {
    setProjectsDirty(true);
    refreshProjects();
    if (selectedProjectId) refreshInvestors(selectedProjectId);
  };
  const closeProjectsModal = () => {
    setShowProjectsModal(false);
    refreshProjects();
    if (selectedProjectId) refreshInvestors(selectedProjectId);
    setProjectsDirty(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Active document</p>
          <strong style={{ fontSize: 18 }}>{documentLabel}</strong>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Project</p>
          <strong style={{ fontSize: 16 }}>{projectLabel(selectedProjectId, projects)}</strong>
        </div>
      </header>
      <div style={{ flex: 1, padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'flex-start' }}>
          <section
            style={{
              maxHeight: 'calc(100vh - 160px)',
              minHeight: 'calc(100vh - 160px)',
              overflowY: 'auto',
              paddingRight: 8,
              paddingBottom: 32,
            }}
          >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={!selectedProjectId || uploadingDoc}
          style={{ display: 'none' }}
        />
        {!documentInfo ? (
          <div
            style={{
              marginTop: 24,
              padding: 32,
              border: '2px dashed #cbd5ff',
              borderRadius: 12,
              textAlign: 'center',
              background: '#f8fbff',
            }}
          >
            <p style={{ marginBottom: 12, color: '#555' }}>
              {selectedProjectId ? 'Upload a PDF to begin placing fields.' : 'Select a project before uploading a PDF.'}
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!selectedProjectId || uploadingDoc}
              style={{ padding: '10px 18px' }}
            >
              {uploadingDoc ? 'Uploading…' : 'Upload PDF'}
            </button>
          </div>
        ) : (
          <>
            {!pdfPages.length && (
              <p style={{ marginTop: 16, color: '#2563eb' }}>
                {loadingPdf || uploadingDoc ? 'Processing PDF…' : 'PDF ready. Scroll to view pages.'}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginTop: 24 }}>
              {pdfPages.map((page) => (
                <div
                  key={page.pageIndex}
                  ref={registerPageRef(page.pageIndex)}
                  data-page-container
                  style={{ position: 'relative', width: page.width, margin: '0 auto' }}
                  onClick={() => setSelectedFieldId(null)}
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
                        <span>{field.name || FIELD_LABELS[field.type]}</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setFields((prev) => prev.filter((f) => f.id !== field.id));
                          }}
                          style={{
                            position: 'absolute',
                            top: -12,
                            right: -12,
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            border: '1px solid #fff',
                            background: 'rgba(17,24,39,0.85)',
                            color: '#fff',
                            fontSize: 12,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                          }}
                          aria-label="Remove field"
                        >
                          🗑️
                        </button>
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
          </>
        )}
      </section>

      <section style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, background: '#fff' }}>
          <h3>Document setup</h3>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
            <span style={{ fontSize: 12 }}>Project</span>
            <select
              value={selectedProjectId ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                if (value === '__add__') {
                  setShowProjectsModal(true);
                  event.currentTarget.value = selectedProjectId?.toString() ?? '';
                  return;
                }
                setSelectedProjectId(value ? Number(value) : null);
              }}
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
              <option value="__add__" style={{ fontStyle: 'italic', fontWeight: 'bold' }}>
                ➕ Add new project…
              </option>
            </select>
          </label>
          <p style={{ marginTop: 12, fontSize: 13, color: '#555' }}>
            PDFs upload into <strong>{projectLabel(selectedProjectId, projects)}</strong>. Use the button in the canvas to pick a file.
          </p>
          {documentInfo && (
            <p style={{ marginTop: 4, fontSize: 13 }}>
              Active document: <strong>{documentInfo.filename}</strong> (id {documentInfo.id})
            </p>
          )}
          {(loadingPdf || uploadingDoc) && <p style={{ color: '#2563eb', marginTop: 8 }}>Processing PDF…</p>}
          {error && <p style={{ color: 'red', marginTop: 8 }}>{error}</p>}
        </div>

        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0 }}>Investors</h3>
              <p style={{ fontSize: 12, color: '#777', margin: 4 }}>Drag a signer’s field onto the PDF to place it.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowProjectsModal(true)}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}
            >
              Add Investor
            </button>
          </div>
          {!projectInvestors.length ? (
            <p style={{ fontSize: 13, color: '#555' }}>Add investors to this project before placing any fields.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {projectInvestors.map((investor) => {
                const avatarLetter =
                  investor.email?.trim()?.charAt(0)?.toUpperCase() ||
                  investor.name?.trim()?.charAt(0)?.toUpperCase() ||
                  '?';
                const isSelectedInvestor = selectedSignerId === (investor.id ? String(investor.id) : null);
                const isExpanded = expandedInvestors[investor.id] ?? true;
                return (
                  <div
                    key={investor.id}
                    style={{
                      border: `1px dashed ${isSelectedInvestor ? '#2563eb' : '#e5e7eb'}`,
                      borderRadius: 8,
                      padding: 12,
                      background: isSelectedInvestor ? 'rgba(37,99,235,0.05)' : '#fff',
                      transition: 'border-color 0.2s ease, background 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                          background: '#e0e7ff',
                          color: '#1e3a8a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        {avatarLetter}
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ fontSize: 13 }}>{investor.name}</strong>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                          {investor.email}
                          {typeof investor.units_invested === 'number' && (
                            <span style={{ marginLeft: 6, fontSize: 12, color: '#94a3b8' }}>
                              · {investor.units_invested} units
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                      <button
                        type="button"
                        onClick={() => toggleInvestorExpansion(investor.id)}
                        style={{
                          border: '1px solid #cbd5f5',
                          background: '#f1f5ff',
                          color: '#1d4ed8',
                          borderRadius: 6,
                          padding: '4px 10px',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {isExpanded ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {isExpanded && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        {Object.entries(FIELD_LABELS).map(([value, label]) => {
                          const isActive =
                            draggingTool?.investor.id === investor.id && draggingTool?.type === (value as FieldType);
                          return (
                            <button
                              key={value}
                              type="button"
                              onPointerDown={(event) => beginToolDrag(event, value as FieldType, investor)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: isActive ? '2px solid #2563eb' : '1px solid #ccc',
                                background: isActive ? '#e0e7ff' : '#fff',
                                cursor: isActive ? 'grabbing' : 'grab',
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3>Envelope settings</h3>
          <label style={{ display: 'block', fontSize: 12 }}>Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            style={{ width: '100%', padding: 6 }}
            placeholder="Subject line (defaults to document name)"
          />
          <div>
            <button type="button" onClick={exportFields} disabled={!fields.length}>
              Generate JSON
            </button>
            <button type="button" onClick={copyExport} disabled={!exportJson} style={{ marginLeft: 8 }}>
              Copy JSON
            </button>
          </div>
          <pre style={{ marginTop: 4, maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: 12 }}>
            {exportJson || '// Generated field JSON will appear here'}
          </pre>
          {submissionStatus && <p style={{ marginTop: 4, color: '#2563eb' }}>{submissionStatus}</p>}
          {!!magicLinks.length && (
            <div style={{ marginTop: 4 }}>
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
          <div
            style={{
              position: 'sticky',
              bottom: 16,
              background: '#fff',
              paddingTop: 12,
              borderTop: '1px solid #eee',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={submitEnvelope}
              disabled={submitting || !documentInfo || !fields.length}
              style={{ padding: '10px 20px' }}
            >
              {submitting ? 'Submitting…' : 'Finish And Send'}
            </button>
          </div>
        </div>
      </section>
        </div>
      </div>
      {dragPreview && (
        <div
          style={{
            position: 'fixed',
            left: dragPreview.x - dragPreview.width / 2,
            top: dragPreview.y - dragPreview.height / 2,
            width: dragPreview.width,
            height: dragPreview.height,
            border: '2px dashed #2563eb',
            background: 'rgba(37,99,235,0.12)',
            borderRadius: 6,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563eb',
            fontSize: 12,
            zIndex: 50,
          }}
        >
          {dragPreview.label}
        </div>
      )}
      {showProjectsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            padding: '40px 24px',
            zIndex: 100,
            overflowY: 'auto',
          }}
        >
          <div style={{ width: 'min(1200px, 100%)', background: '#fff', borderRadius: 12, boxShadow: '0 20px 45px rgba(15,23,42,0.35)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Projects & Investors</h3>
              <button
                type="button"
                onClick={closeProjectsModal}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: '#6b7280',
                  lineHeight: 1,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div style={{ padding: '24px 24px 12px', overflowY: 'auto' }}>
              <ProjectsPage onAnyChange={handleProjectsChange} initialProjectId={selectedProjectId ?? undefined} />
            </div>
            <div style={{ padding: '12px 24px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={closeProjectsModal}
                disabled={!projectsDirty}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 18px',
                  cursor: 'pointer',
                  opacity: projectsDirty ? 1 : 0.6,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
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
