'use client';

import { useCallback, useEffect, useMemo, useRef, useState, PointerEvent as ReactPointerEvent, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import InvestorsPage from '../investors/page';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf';
import { theme } from '../../lib/theme';

if (typeof window !== 'undefined') {
  GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

type FieldType = 'signature' | 'text' | 'date' | 'checkbox';

type FontChoice = 'sans' | 'serif' | 'times' | 'mono' | 'script';
const TEXT_FONT_OPTIONS: Array<{ id: FontChoice; label: string }> = [
  { id: 'sans', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'times', label: 'Times New Roman' },
  { id: 'mono', label: 'Mono' },
  { id: 'script', label: 'Script' },
];
const FONT_LABELS = TEXT_FONT_OPTIONS.reduce(
  (acc, option) => ({ ...acc, [option.id]: option.label }),
  {} as Record<FontChoice, string>,
);
const DEFAULT_FONT: FontChoice = 'sans';

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
  fontFamily?: FontChoice;
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

type EnvelopeDetail = {
  id: number;
  subject: string;
  message: string;
  document?: { id: number; filename: string };
  signers: Array<{ id: number; name: string; email: string; role: string; routing_order: number }>;
  requester_name?: string | null;
  requester_email?: string | null;
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
const FIELD_ICONS: Record<FieldType, string> = {
  signature: '✍️',
  text: '📝',
  date: '📅',
  checkbox: '☑️',
};

const palette = {
  pageBackground: theme.colors.gradient,
  headerBackground: theme.colors.surface,
  headerBorder: `1px solid ${theme.colors.border}`,
  cardBorder: `1px solid ${theme.colors.border}`,
  cardShadow: theme.shadows.card,
  cardSurface: theme.colors.panel,
  accent: theme.colors.accent,
  accentMuted: theme.colors.textMuted,
  textSubtle: theme.colors.textMuted,
  textStrong: theme.colors.text,
  chip: theme.colors.accentSoft,
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
  const baseApi = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectParamError, setProjectParamError] = useState<string | null>(null);
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
  const [confirmEnvelopeId, setConfirmEnvelopeId] = useState<number | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmDrawerOpen, setConfirmDrawerOpen] = useState(false);
  const [confirmDetail, setConfirmDetail] = useState<EnvelopeDetail | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
const [confirmMessage, setConfirmMessage] = useState('');
const [confirmSending, setConfirmSending] = useState(false);
const selectedField = useMemo(
  () => fields.find((field) => field.id === selectedFieldId) || null,
  [fields, selectedFieldId],
);
  const updateField = useCallback((id: string, updates: Partial<Field>) => {
    setFields((prev) => prev.map((field) => (field.id === id ? { ...field, ...updates } : field)));
  }, []);
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [adminVerified, setAdminVerified] = useState(false);
  const [adminTokenLoading, setAdminTokenLoading] = useState(true);
  const [adminTokenError, setAdminTokenError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [verifyingLocally, setVerifyingLocally] = useState(false);
  const readyToReview = Boolean(documentInfo && fields.length > 0);
  const [isMobile, setIsMobile] = useState(false);
  const activeProject = selectedProjectId ? projects.find((project) => project.id === selectedProjectId) ?? null : null;
  const activeProjectName = activeProject?.name || (selectedProjectId ? `Project #${selectedProjectId}` : 'No project selected');
  const canUploadDocument = Boolean(selectedProjectId && !projectParamError);
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
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setIsMobile(window.innerWidth <= 960);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const verifyAdminToken = useCallback(
    async (candidate: string) => {
      setAdminTokenLoading(true);
      setAdminTokenError(null);
      try {
        const resp = await fetch(`${baseApi}/api/projects`, {
          headers: { 'X-Access-Token': candidate },
        });
        if (!resp.ok) throw new Error('Invalid token');
        setAdminToken(candidate);
        setAdminVerified(true);
        if (typeof window !== 'undefined') {
          localStorage.setItem('adminAccessToken', candidate);
        }
      } catch (err) {
        setAdminToken('');
        setAdminVerified(false);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('adminAccessToken');
        }
        setAdminTokenError(err instanceof Error ? err.message : 'Invalid token');
      } finally {
        setAdminTokenLoading(false);
      }
    },
    [baseApi],
  );

  const logout = useCallback(() => {
    setAdminToken('');
    setAdminVerified(false);
    setAdminTokenError(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('adminAccessToken');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setAdminTokenLoading(false);
      return;
    }
    const saved = localStorage.getItem('adminAccessToken');
    if (saved) {
      verifyAdminToken(saved);
    } else {
      setAdminTokenLoading(false);
    }
  }, [verifyAdminToken]);

  const refreshProjects = async () => {
    if (!adminToken) return;
    try {
      const resp = await fetch(`${baseApi}/api/projects`, {
        headers: { 'X-Access-Token': adminToken },
      });
      if (!resp.ok) throw new Error(`Failed to load projects (${resp.status})`);
      const list = await resp.json();
      setProjects(list || []);
    } catch (err) {
      console.warn('project load failed', err);
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    }
  };

  useEffect(() => {
    if (!adminVerified || !adminToken) return;
    refreshProjects();
  }, [adminVerified, adminToken]);

  const projectParam = searchParams.get('project');

  useEffect(() => {
    const numeric = projectParam ? Number(projectParam) : NaN;
    if (projectParam && !Number.isNaN(numeric)) {
      setProjectParamError(null);
      setSelectedProjectId((prev) => (prev === numeric ? prev : numeric));
      if (typeof window !== 'undefined') {
        localStorage.setItem('requestSignProject', String(numeric));
      }
      return;
    }
    if (!projectParam) {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('requestSignProject');
        if (stored) {
          const storedId = Number(stored);
          if (!Number.isNaN(storedId)) {
            setProjectParamError(null);
            setSelectedProjectId((prev) => (prev === storedId ? prev : storedId));
            return;
          }
        }
      }
      setProjectParamError(null);
      setSelectedProjectId(null);
      return;
    }
    if (Number.isNaN(numeric)) {
      setProjectParamError('Invalid project id provided in the URL.');
      setSelectedProjectId(null);
    }
  }, [projectParam]);

  const refreshInvestors = useCallback(
    async (projectId: number) => {
      if (!projectId || !adminToken) return;
      setInvestorsLoading(true);
      try {
        const resp = await fetch(`${baseApi}/api/projects/${projectId}/investors`, {
          headers: { 'X-Access-Token': adminToken },
        });
        if (!resp.ok) throw new Error(`Failed to load investors (${resp.status})`);
        const list = await resp.json();
        setProjectInvestors(list || []);
      } catch (err) {
        console.warn('investor load failed', err);
        setError(err instanceof Error ? err.message : 'Failed to load investors');
      } finally {
        setInvestorsLoading(false);
      }
    },
    [adminToken, baseApi],
  );

  useEffect(() => {
    if (selectedProjectId && adminToken) {
      refreshInvestors(selectedProjectId);
    } else if (!selectedProjectId) {
      setProjectInvestors([]);
    }
  }, [selectedProjectId, adminToken, refreshInvestors]);

  useEffect(() => {
    if (!confirmVisible) {
      setConfirmDrawerOpen(false);
      return;
    }
    const raf = requestAnimationFrame(() => setConfirmDrawerOpen(true));
    return () => cancelAnimationFrame(raf);
  }, [confirmVisible]);

  useEffect(() => {
    if (!confirmEnvelopeId || !confirmVisible || !adminToken) return;
    let cancelled = false;
    setConfirmLoading(true);
    setConfirmError(null);
    setConfirmDetail(null);
    fetch(`${baseApi}/api/envelopes/${confirmEnvelopeId}`, {
      headers: { 'X-Access-Token': adminToken ?? '' },
    })
      .then((resp) => {
        if (!resp.ok) throw new Error(`Unable to load envelope (${resp.status})`);
        return resp.json();
      })
      .then((data) => {
        if (cancelled) return;
        setConfirmDetail(data);
        setConfirmMessage(data.message ?? '');
        setSubject((prev) => (data.subject !== undefined && data.subject !== null ? data.subject : prev));
        setRequesterName((prev) => (data.requester_name !== undefined && data.requester_name !== null ? data.requester_name : prev));
        setRequesterEmail((prev) => (data.requester_email !== undefined && data.requester_email !== null ? data.requester_email : prev));
      })
      .catch((err) => {
        if (!cancelled) setConfirmError(err instanceof Error ? err.message : 'Failed to load envelope');
      })
      .finally(() => {
        if (!cancelled) setConfirmLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [confirmEnvelopeId, confirmVisible, baseApi, adminToken]);

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
      setError('Open Request Sign from Admin so a project is selected before uploading.');
      throw new Error('Missing project id');
    }
    if (!adminToken) {
      setError('Admin token required before uploading.');
      throw new Error('Missing admin token');
    }
    setUploadingDoc(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${baseApi}/api/projects/${projectNumeric}/documents`, {
        method: 'POST',
        headers: { 'X-Access-Token': adminToken ?? '' },
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
      setError('Open Request Sign from Admin so a project is selected before adding investors.');
      return;
    }
    if (!adminToken) {
      setError('Admin token required to create investors.');
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
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Token': adminToken ?? '',
        },
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
      fontFamily: DEFAULT_FONT,
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
        font_family: field.fontFamily || DEFAULT_FONT,
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
      font_family: string;
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


  const closeConfirmPanel = () => {
    setConfirmDrawerOpen(false);
    setTimeout(() => {
      setConfirmVisible(false);
      setConfirmEnvelopeId(null);
      setConfirmDetail(null);
      setConfirmError(null);
      setConfirmLoading(false);
      setConfirmMessage('');
      setConfirmSending(false);
    }, 320);
  };

  const sendConfirmedEnvelope = async () => {
    if (!confirmEnvelopeId) return;
    if (!requesterName.trim() || !requesterEmail.trim()) {
      setConfirmError('Provide your name and email so recipients know who invited them.');
      return;
    }
    if (!adminToken) {
      setConfirmError('Admin token required to send envelopes.');
      return;
    }
    setConfirmSending(true);
    setConfirmError(null);
    try {
      const resp = await fetch(`${baseApi}/api/envelopes/${confirmEnvelopeId}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Token': adminToken ?? '',
        },
        body: JSON.stringify({
          subject,
          message: confirmMessage,
          requester_name: requesterName.trim(),
          requester_email: requesterEmail.trim(),
        }),
      });
      if (!resp.ok) {
        const detail = await safeParseError(resp);
        throw new Error(detail || 'Failed to send envelope');
      }
      closeConfirmPanel();
      router.push(`/request-sign/sent/${confirmEnvelopeId}`);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Failed to send envelope');
    } finally {
      setConfirmSending(false);
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
      setError('Open Request Sign from Admin so a project is selected.');
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
    if (!adminToken) {
      setError('Admin token required to submit envelope.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const createResp = await fetch(`${baseApi}/api/envelopes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Token': adminToken,
        },
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
      setConfirmEnvelopeId(created.id);
      setConfirmMessage(message);
      setConfirmVisible(true);
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit envelope');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminTokenSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = tokenInput.trim();
    if (!candidate) return;
    setVerifyingLocally(true);
    await verifyAdminToken(candidate);
    setVerifyingLocally(false);
    setTokenInput('');
  };

  if (adminTokenLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: palette.pageBackground,
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div className="spinner" aria-hidden="true" />
        <p>Verifying admin access…</p>
        <style jsx>{`
          .spinner {
            width: 54px;
            height: 54px;
            border-radius: 50%;
            border: 6px solid rgba(255, 255, 255, 0.35);
            border-top-color: #2563eb;
            animation: spin 0.9s linear infinite;
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  if (!adminVerified) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: palette.pageBackground }}>
        <form
          onSubmit={handleAdminTokenSubmit}
          style={{
            background: '#fff',
            padding: 32,
            borderRadius: 20,
            boxShadow: theme.shadows.card,
            width: 'min(360px, 90vw)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <h2 style={{ margin: 0, color: palette.accent }}>Admin Access</h2>
          <p style={{ margin: 0, fontSize: 14, color: palette.accentMuted }}>Enter the admin access token to configure envelopes.</p>
          <input
            type="password"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="Admin token"
            style={{
              padding: 10,
              borderRadius: 10,
              border: `1px solid ${theme.colors.border}`,
              background: '#fff',
              color: theme.colors.text,
            }}
            disabled={verifyingLocally}
          />
          {adminTokenError && <p style={{ color: '#f87171', margin: 0 }}>{adminTokenError}</p>}
          <button
            type="submit"
            disabled={verifyingLocally}
            style={{
              border: 'none',
              borderRadius: 8,
              padding: '10px 12px',
              background: verifyingLocally ? 'rgba(37,99,235,0.6)' : palette.accent,
              color: '#fff',
              fontWeight: 600,
              cursor: verifyingLocally ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {verifyingLocally && (
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: '#fff',
                  animation: 'reqMiniSpin 0.8s linear infinite',
                }}
              />
            )}
            {verifyingLocally ? 'Verifying…' : 'Continue'}
          </button>
          <style jsx>{`
            @keyframes reqMiniSpin {
              to {
                transform: rotate(360deg);
              }
            }
          `}</style>
        </form>
      </div>
    );
  }
  if (isMobile) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: palette.pageBackground,
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            background: '#fff',
            borderRadius: 24,
            padding: 32,
            textAlign: 'center',
            boxShadow: theme.shadows.card,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <h2 style={{ marginTop: 0, color: palette.textStrong }}>Use a desktop browser</h2>
          <p style={{ color: palette.accentMuted, fontSize: 14, lineHeight: 1.6 }}>
            The Request Sign designer is optimized for larger screens. Please continue from a laptop or desktop computer
            to upload documents, place fields, and send envelopes.
          </p>
          <a
            href={selectedProjectId ? `/admin?project=${selectedProjectId}` : '/admin'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 16,
              padding: '10px 18px',
              borderRadius: 999,
              background: palette.accent,
              color: '#fff',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Back to Admin
          </a>
        </div>
      </div>
    );
  }

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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: palette.pageBackground,
        color: palette.textStrong,
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: palette.headerBackground,
          borderBottom: palette.headerBorder,
          padding: '16px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          boxShadow: '0 12px 30px rgba(15,23,42,0.08)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a
            href={selectedProjectId ? `/admin?project=${selectedProjectId}` : '/admin'}
            style={{
              borderRadius: 999,
              border: `1px solid ${palette.accent}`,
              color: palette.accent,
              padding: '6px 14px',
              textDecoration: 'none',
              fontWeight: 600,
              background: 'transparent',
              fontSize: 13,
            }}
          >
            ← Back to Admin
          </a>
          <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>Active document</p>
          <strong style={{ fontSize: 18, color: palette.textStrong }}>{documentLabel}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>Project</p>
            <strong style={{ fontSize: 18, color: palette.textStrong }}>{activeProjectName}</strong>
            {selectedProjectId && (
              <span style={{ display: 'block', fontSize: 12, color: palette.accentMuted }}>ID #{selectedProjectId}</span>
            )}
            {projectParamError && (
              <span style={{ display: 'block', fontSize: 12, color: '#ef4444', marginTop: 4 }}>{projectParamError}</span>
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            style={{
              border: '1px solid rgba(148,163,184,0.5)',
              background: 'transparent',
              color: '#e2e8f0',
              borderRadius: 999,
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <div style={{ flex: 1, padding: 32, paddingBottom: 160 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) 380px', gap: 28, alignItems: 'flex-start' }}>
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
          disabled={!canUploadDocument || uploadingDoc}
          style={{ display: 'none' }}
        />
        {!documentInfo ? (
          <div
            style={{
              marginTop: 24,
              padding: 32,
              border: `2px dashed ${palette.accent}`,
              borderRadius: 20,
              textAlign: 'center',
              background: '#fff',
              boxShadow: theme.shadows.card,
            }}
          >
            <p style={{ marginBottom: 12, color: palette.accentMuted }}>
              {projectParamError || 'Upload a PDF to begin placing fields.'}
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canUploadDocument || uploadingDoc}
              style={{
                padding: '10px 22px',
                borderRadius: 999,
                border: 'none',
                background: canUploadDocument ? palette.accent : theme.colors.border,
                color: canUploadDocument ? '#fff' : palette.accentMuted,
                fontWeight: 600,
                cursor: !canUploadDocument || uploadingDoc ? 'not-allowed' : 'pointer',
                boxShadow: canUploadDocument ? theme.shadows.pill : 'none',
              }}
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
                  style={{
                    margin: '0 auto',
                    background: '#fff',
                    borderRadius: 18,
                    boxShadow: '0 30px 70px rgba(15,23,42,0.18)',
                    padding: 24,
                  }}
                  onClick={() => setSelectedFieldId(null)}
                >
                  <div
                    ref={registerPageRef(page.pageIndex)}
                    data-page-container
                    style={{
                      position: 'relative',
                      width: page.width,
                      margin: '0 auto',
                    }}
                  >
                    <img
                      src={page.dataUrl}
                      alt={`Page ${page.pageIndex + 1}`}
                      style={{ width: '100%', display: 'block', borderRadius: 8 }}
                    />
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
                            border: field.id === selectedFieldId ? `2px solid ${palette.accent}` : '1px solid rgba(17,24,39,0.6)',
                            background: 'rgba(56,189,248,0.18)',
                            color: theme.colors.text,
                            fontSize: 12,
                            fontWeight: 600,
                            letterSpacing: 0.2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'move',
                            userSelect: 'none',
                            borderRadius: 6,
                            boxShadow: '0 6px 18px rgba(15,23,42,0.15)',
                          }}
                        >
                        {field.type === 'checkbox' ? (
                          <span
                            style={{
                              fontSize: Math.max(12, field.height * 0.6),
                              color: '#0f172a',
                              lineHeight: 1,
                            }}
                          >
                            ✕
                          </span>
                        ) : (
                          <span>{field.name || FIELD_LABELS[field.type]}</span>
                        )}
                        {['signature', 'text', 'date'].includes(field.type) && (
                          <span
                            style={{
                              position: 'absolute',
                              top: 6,
                              left: 6,
                              fontSize: 16,
                              lineHeight: 1,
                              pointerEvents: 'none',
                            }}
                            aria-hidden="true"
                          >
                            {FIELD_ICONS[field.type as FieldType]}
                          </span>
                        )}
                        {field.type === 'text' && (
                          <span
                            style={{
                              position: 'absolute',
                              top: -18,
                              left: 0,
                              fontSize: 10,
                              padding: '2px 6px',
                              borderRadius: 6,
                              background: 'rgba(15,23,42,0.85)',
                              border: '1px solid rgba(255,255,255,0.2)',
                              color: '#fff',
                              pointerEvents: 'none',
                            }}
                          >
                            {FONT_LABELS[field.fontFamily || DEFAULT_FONT]}
                          </span>
                        )}
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
                        {selectedFieldId === field.id && field.type === 'checkbox' && (
                          <div
                            style={{
                              position: 'absolute',
                              top: field.height + 6,
                              left: 0,
                              padding: '4px 8px',
                              borderRadius: 6,
                              background: 'rgba(15,23,42,0.9)',
                              color: '#fff',
                              fontSize: 11,
                              whiteSpace: 'nowrap',
                              boxShadow: '0 4px 10px rgba(15,23,42,0.25)',
                            }}
                          >
                            {field.name || FIELD_LABELS[field.type]}
                          </div>
                        )}
                        {selectedFieldId === field.id && field.type === 'text' && (
                            <div
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => event.stopPropagation()}
                              style={{
                                position: 'absolute',
                                top: -field.height - 20,
                                left: 0,
                                background: '#fff',
                                borderRadius: 12,
                                border: '1px solid rgba(148,163,184,0.5)',
                                padding: 10,
                                boxShadow: '0 12px 25px rgba(15,23,42,0.2)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                                minWidth: 200,
                                zIndex: 30,
                              }}
                            >
                              <label style={{ fontSize: 11, color: palette.accentMuted }}>Font</label>
                              <select
                                value={field.fontFamily || DEFAULT_FONT}
                                onChange={(event) => updateField(field.id, { fontFamily: event.target.value as FontChoice })}
                                style={{
                                  padding: 6,
                                  borderRadius: 6,
                                  border: '1px solid rgba(148,163,184,0.6)',
                                  fontSize: 12,
                                }}
                              >
                                {TEXT_FONT_OPTIONS.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
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
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div
          style={{
            border: palette.cardBorder,
            borderRadius: 24,
            padding: 24,
            background: palette.cardSurface,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxShadow: palette.cardShadow,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, color: palette.textStrong }}>Investors</h3>
              <p style={{ fontSize: 12, color: palette.accentMuted, margin: 4 }}>
                Drag a signer’s field onto the PDF to place it.
              </p>
            </div>
          </div>
          {!projectInvestors.length ? (
            <p style={{ fontSize: 13, color: palette.accentMuted }}>Add investors to this project before placing any fields.</p>
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
                      border: isSelectedInvestor ? `1px solid ${palette.accent}` : `1px solid ${palette.cardBorder}`,
                      borderRadius: 16,
                      padding: 16,
                      background: isSelectedInvestor ? palette.chip || theme.colors.accentSoft : '#fff',
                      transition: 'border-color 0.2s ease, background 0.2s ease',
                      boxShadow: isSelectedInvestor ? theme.shadows.card : '0 6px 16px rgba(15,23,42,0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: palette.chip,
                            color: palette.accent,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontSize: 14,
                          }}
                        >
                          {avatarLetter}
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ fontSize: 14, color: palette.textStrong }}>{investor.name}</strong>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: palette.accentMuted }}>
                            {investor.email}
                            {typeof investor.units_invested === 'number' && (
                              <span style={{ marginLeft: 6, fontSize: 12, color: palette.accentMuted }}>
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
                          border: `1px solid ${palette.cardBorder}`,
                          background: '#fff',
                          color: palette.textStrong,
                          borderRadius: 999,
                          padding: '4px 12px',
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
                          const icon = FIELD_ICONS[value as FieldType];
                          const fullLabel = `${label} field`;
                          return (
                            <button
                              key={value}
                              type="button"
                              onPointerDown={(event) => beginToolDrag(event, value as FieldType, investor)}
                              style={{
                                padding: '8px 14px',
                                borderRadius: 14,
                                border: isActive ? `2px solid ${palette.accent}` : '1px solid rgba(148,163,184,0.4)',
                                background: isActive ? 'rgba(56,189,248,0.15)' : '#fff',
                                color: palette.textStrong,
                                cursor: isActive ? 'grabbing' : 'grab',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 13,
                                boxShadow: isActive ? '0 6px 12px rgba(56,189,248,0.25)' : '0 4px 10px rgba(15,23,42,0.08)',
                                transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
                              }}
                              onMouseEnter={(event) => {
                                if (isActive) return;
                                event.currentTarget.style.background = 'rgba(148,163,184,0.12)';
                                event.currentTarget.style.boxShadow = '0 6px 12px rgba(15,23,42,0.15)';
                                event.currentTarget.style.transform = 'translateY(-1px)';
                              }}
                              onMouseLeave={(event) => {
                                if (isActive) return;
                                event.currentTarget.style.background = '#fff';
                                event.currentTarget.style.boxShadow = '0 4px 10px rgba(15,23,42,0.08)';
                                event.currentTarget.style.transform = 'translateY(0)';
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: '50%',
                                  background: 'rgba(15,23,42,0.05)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 14,
                                }}
                              >
                                {icon}
                              </span>
                              {fullLabel}
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
        {error && (
          <div
            style={{
              border: '1px solid rgba(248,113,113,0.5)',
              borderRadius: 16,
              padding: 16,
              background: 'rgba(185,28,28,0.12)',
              color: '#fecaca',
              boxShadow: '0 15px 25px rgba(185,28,28,0.25)',
            }}
          >
            {error}
          </div>
        )}

      </section>
    </div>
  </div>
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(248,250,252,0.95)',
          borderTop: '1px solid #e5e7eb',
          padding: '16px 32px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          zIndex: 60,
          backdropFilter: 'blur(4px)',
        }}
      >
        <button
          type="button"
          onClick={submitEnvelope}
          disabled={submitting || !readyToReview}
          style={{
            background: submitting || !readyToReview ? '#cbd5f5' : '#2563eb',
            color: submitting || !readyToReview ? '#64748b' : '#fff',
            border: 'none',
            borderRadius: 999,
            padding: '14px 32px',
            fontSize: 16,
            fontWeight: 600,
            cursor: submitting || !readyToReview ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.85 : 1,
            boxShadow: submitting || !readyToReview ? 'none' : '0 15px 35px rgba(37,99,235,0.35)',
          }}
        >
          {submitting ? 'Preparing…' : 'Review & Send'}
        </button>
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
            background: theme.colors.overlay,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            padding: '40px 24px',
            zIndex: 100,
            overflowY: 'auto',
          }}
        >
          <div style={{ width: 'min(1200px, 100%)', background: '#fff', borderRadius: 12, boxShadow: theme.shadows.modal, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Investors</h3>
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
              {adminToken && (
                <InvestorsPage
                  onAnyChange={handleProjectsChange}
                  initialProjectId={selectedProjectId ?? undefined}
                  accessToken={adminToken}
                />
              )}
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
      {confirmVisible && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: theme.colors.overlay,
            backdropFilter: 'blur(2px)',
            zIndex: 120,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={closeConfirmPanel}
        >
          <div
            style={{
              width: 'min(720px, 50vw)',
              height: '100%',
              background: '#f8fafc',
              boxShadow: theme.shadows.modal,
              transform: confirmDrawerOpen ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.35s ease',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <header
              style={{
                padding: '18px 28px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#fff',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Document</p>
                <strong style={{ fontSize: 20 }}>
                  {confirmDetail?.document?.filename || documentInfo?.filename || 'Envelope review'}
                </strong>
              </div>
              <button
                type="button"
                onClick={closeConfirmPanel}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#6b7280',
                  fontSize: 24,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div style={{ flex: 1, padding: 28, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {confirmError && (
                <div style={{ padding: 12, borderRadius: 8, background: '#fee2e2', color: '#991b1b' }}>{confirmError}</div>
              )}
              {confirmLoading || !confirmDetail ? (
                <p>Loading details…</p>
              ) : (
                <>
                  <section
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      padding: 20,
                      background: '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                <div>
                  <label htmlFor="confirm-subject" style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                    Subject
                  </label>
                  <input
                    id="confirm-subject"
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    style={{
                      width: '100%',
                      border: '1px solid #cbd5f5',
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontSize: 14,
                    }}
                    placeholder="Subject line"
                  />
                </div>
                <div>
                  <p style={{ margin: '8px 0 4px', fontSize: 12, color: '#6b7280' }}>Recipients</p>
                  <p style={{ fontSize: 13, color: '#475569', margin: '0 0 8px' }}>Please review signers before sending.</p>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {confirmDetail.signers.map((signer) => (
                          <div
                            key={signer.id}
                            style={{
                              border: '1px solid #e5e7eb',
                              borderRadius: 10,
                              padding: 12,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <div>
                              <strong style={{ display: 'block' }}>{signer.name}</strong>
                              <span style={{ fontSize: 13, color: '#475569' }}>{signer.email}</span>
                            </div>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>Order {signer.routing_order}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                  <section
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      padding: 20,
                      background: '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    }}
                  >
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Your name</label>
                  <input
                    type="text"
                    value={requesterName}
                    onChange={(event) => setRequesterName(event.target.value)}
                    placeholder="e.g. Alex Chen"
                    required
                    style={{
                      width: '100%',
                      border: '1px solid #cbd5f5',
                      borderRadius: 8,
                      padding: '8px 10px',
                      marginBottom: 12,
                      borderColor: !requesterName.trim() ? '#f87171' : '#cbd5f5',
                    }}
                  />
                  <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Your email</label>
                  <input
                    type="email"
                    value={requesterEmail}
                    onChange={(event) => setRequesterEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                    style={{
                      width: '100%',
                      border: '1px solid #cbd5f5',
                      borderRadius: 8,
                      padding: '8px 10px',
                      marginBottom: 12,
                      borderColor: !requesterEmail.trim() ? '#f87171' : '#cbd5f5',
                    }}
                  />
                  <label htmlFor="confirm-message" style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                    Email message
                  </label>
                  <textarea
                    id="confirm-message"
                        value={confirmMessage}
                        onChange={(event) => setConfirmMessage(event.target.value)}
                        rows={6}
                        style={{
                          width: '100%',
                          border: '1px solid #cbd5f5',
                          borderRadius: 8,
                          padding: 10,
                          resize: 'vertical',
                          background: '#f8fafc',
                        }}
                        placeholder="Add a custom note for recipients…"
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={closeConfirmPanel}
                        disabled={confirmSending}
                        style={{
                          border: '1px solid #cbd5f5',
                          background: '#fff',
                          color: '#1f2937',
                          borderRadius: 999,
                          padding: '12px 26px',
                          fontSize: 15,
                          cursor: confirmSending ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={sendConfirmedEnvelope}
                        disabled={confirmSending}
                        style={{
                          background: '#2563eb',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 999,
                          padding: '14px 32px',
                          fontSize: 16,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          cursor: confirmSending ? 'not-allowed' : 'pointer',
                          opacity: confirmSending ? 0.7 : 1,
                        }}
                      >
                        {confirmSending && <Spinner />}
                        {confirmSending ? 'Sending…' : 'Submit'}
                      </button>
                    </div>
                  </section>
                </>
              )}
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

function Spinner() {
  return (
    <>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.5)',
          borderTopColor: '#fff',
          display: 'inline-block',
          animation: 'spinner-rotate 0.9s linear infinite',
        }}
      />
      <style>{`
        @keyframes spinner-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
