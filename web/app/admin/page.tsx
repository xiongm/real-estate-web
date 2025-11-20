'use client';

import { useCallback, useEffect, useMemo, useState, FormEvent, CSSProperties, KeyboardEvent, ChangeEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { theme } from '../../lib/theme';

type Project = {
  id: number;
  name: string;
  status: string;
  access_token?: string | null;
};

type FinalArtifact = {
  envelope_id: number;
  document_id: number;
  document_name: string;
  completed_at: string;
  sha256_final: string;
};

type EnvelopeSummary = {
  id: number;
  subject: string;
  status: string;
  created_at: string;
  document?: { id: number | null; filename: string | null };
  total_signers: number;
  completed_signers: number;
  signers: Array<{
    id: number;
    name: string;
    email: string;
    status: string;
    role: string;
    routing_order: number;
    completed_at?: string | null;
    magic_link?: string | null;
  }>;
};

type Investor = {
  id: number;
  name: string;
  email: string;
  units_invested: number;
  role: string;
  mailing_address?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_routing_number?: string | null;
};

type ProjectFile = {
  id: number;
  display_name: string;
  stored_filename: string;
  content_type: string | null;
  uploaded_at: string;
};

const palette = {
  bg: theme.colors.page,
  panel: theme.colors.panel,
  accent: theme.colors.accent,
  accentMuted: theme.colors.textMuted,
  accentSoft: theme.colors.accentSoft,
  text: theme.colors.text,
  textStrong: theme.colors.text,
  border: theme.colors.border,
  chip: theme.colors.chip,
  overlay: theme.colors.overlay,
  code: theme.colors.code,
};
const shadows = theme.shadows;
const completedChipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  background: 'var(--color-success-soft)',
  color: theme.colors.success,
  padding: '2px 8px',
  fontSize: 12,
  fontWeight: 600,
};
const awaitingChipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  background: 'var(--color-warning-soft)',
  color: 'var(--color-warning)',
  padding: '2px 8px',
  fontSize: 12,
  fontWeight: 600,
};
const documentLinkStyle: CSSProperties = {
  fontSize: 16,
  color: palette.accent,
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};
const usePrimaryButtonStyle = (
  enabled: boolean,
  hovered: boolean,
): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minWidth: 84,
  height: 44,
  borderRadius: 12,
  border: 'none',
  padding: '0 20px',
  background: enabled
    ? hovered
      ? 'rgba(37,99,235,0.9)'
      : palette.accent
    : '#cbd5f5',
  color: enabled ? '#fff' : '#64748b',
  fontSize: 14,
  fontWeight: 700,
  cursor: enabled ? 'pointer' : 'not-allowed',
  boxShadow: enabled ? '0 2px 8px rgba(37,99,235,0.35)' : 'none',
  transition: 'background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
});

const normalizeTimestamp = (value: string) => {
  if (!value) return value;
  if (value.endsWith('Z')) return value;
  if (/[+-]\d\d:\d\d$/.test(value)) return value;
  return `${value}Z`;
};

const formatLocalDateTime = (timestamp?: string | null) => {
  if (!timestamp) return null;
  const date = new Date(normalizeTimestamp(timestamp));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const formatSentLabel = (timestamp?: string | null) => {
  const formatted = formatLocalDateTime(timestamp);
  return formatted ? `Sent ${formatted}` : 'Sent time unavailable';
};

export default function AdminPage() {
  const baseApi = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
  const [adminToken, setAdminToken] = useState('');
  const [adminVerified, setAdminVerified] = useState(false);
  const [adminTokenLoading, setAdminTokenLoading] = useState(true);
  const [adminTokenError, setAdminTokenError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [verifyingLocally, setVerifyingLocally] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [finals, setFinals] = useState<FinalArtifact[]>([]);
  const [envelopes, setEnvelopes] = useState<EnvelopeSummary[]>([]);
  const [expandedEnvelopes, setExpandedEnvelopes] = useState<Record<number, boolean>>({});
  const [expandedFinals, setExpandedFinals] = useState<Record<number, boolean>>({});
  const [selectedEnvelopeIds, setSelectedEnvelopeIds] = useState<number[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedFinalIds, setSelectedFinalIds] = useState<number[]>([]);
  const [loadingInvestors, setLoadingInvestors] = useState(false);
  const [manageInvestorsMode, setManageInvestorsMode] = useState(false);
  const [selectedInvestorIds, setSelectedInvestorIds] = useState<number[]>([]);
const [showInvestorForm, setShowInvestorForm] = useState(false);
const [newInvestorName, setNewInvestorName] = useState('');
const [newInvestorEmail, setNewInvestorEmail] = useState('');
const [newInvestorUnits, setNewInvestorUnits] = useState<string>('');
const [newInvestorMailing, setNewInvestorMailing] = useState('');
const [newInvestorBankName, setNewInvestorBankName] = useState('');
const [newInvestorBankAccount, setNewInvestorBankAccount] = useState('');
const [newInvestorBankRouting, setNewInvestorBankRouting] = useState('');
const [creatingInvestor, setCreatingInvestor] = useState(false);
const [hoveredInvestorId, setHoveredInvestorId] = useState<number | null>(null);
const [editingInvestorId, setEditingInvestorId] = useState<number | null>(null);
const [editingInvestorName, setEditingInvestorName] = useState('');
const [editingInvestorEmail, setEditingInvestorEmail] = useState('');
const [editingInvestorUnits, setEditingInvestorUnits] = useState<string>('');
const [editingInvestorMailing, setEditingInvestorMailing] = useState('');
const [editingInvestorBankName, setEditingInvestorBankName] = useState('');
const [editingInvestorBankAccount, setEditingInvestorBankAccount] = useState('');
const [editingInvestorBankRouting, setEditingInvestorBankRouting] = useState('');
const [editingInvestorSaving, setEditingInvestorSaving] = useState(false);
const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
const [projectFilesLoading, setProjectFilesLoading] = useState(false);
const [projectFileUploadName, setProjectFileUploadName] = useState('');
const [projectFileUploadFile, setProjectFileUploadFile] = useState<File | null>(null);
const [projectFileUploading, setProjectFileUploading] = useState(false);
const [projectFileDeletingId, setProjectFileDeletingId] = useState<number | null>(null);
const [showDocumentUpload, setShowDocumentUpload] = useState(false);
const [hoveredProjectFileId, setHoveredProjectFileId] = useState<number | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [editingProjectSaving, setEditingProjectSaving] = useState(false);
  const [manageSignedMode, setManageSignedMode] = useState(false);
  const [manageEnvelopesMode, setManageEnvelopesMode] = useState(false);
  const [manageDocumentsMode, setManageDocumentsMode] = useState(false);
  const [hoveredFinalId, setHoveredFinalId] = useState<number | null>(null);
  const [hoveredEnvelopeId, setHoveredEnvelopeId] = useState<number | null>(null);
  const [hoveredProjectId, setHoveredProjectId] = useState<number | null>(null);
  const [hoveredSignerKey, setHoveredSignerKey] = useState<string | null>(null);
  const [revokingEnvelopes, setRevokingEnvelopes] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [manageProjectsMode, setManageProjectsMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
const [centerTab, setCenterTab] = useState<'signatures' | 'documents' | 'share' | 'investors'>('documents');
  const [deletingInvestors, setDeletingInvestors] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [requestButtonHovered, setRequestButtonHovered] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectDetailsLoaded, setProjectDetailsLoaded] = useState(false);
  const [initialPageReady, setInitialPageReady] = useState(false);
  const closeDrawers = () => {
    setProjectDrawerOpen(false);
  };
  const searchParams = useSearchParams();
  const projectParamRaw = searchParams?.get('project') ?? null;
  const projectParamId = projectParamRaw && !Number.isNaN(Number(projectParamRaw)) ? Number(projectParamRaw) : undefined;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setIsMobile(window.innerWidth <= 900);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useEffect(() => {
    if (!isMobile) {
      closeDrawers();
    }
  }, [isMobile]);
  const rememberProjectSelection = (id: number | null) => {
    if (typeof window === 'undefined') return;
    if (id !== null && id !== undefined) {
      localStorage.setItem('adminSelectedProjectId', String(id));
    } else {
      localStorage.removeItem('adminSelectedProjectId');
    }
  };
  const clearProjectQueryParam = () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('project')) {
      url.searchParams.delete('project');
      window.history.replaceState({}, '', url.toString());
    }
  };
  const selectProject = (id: number | null) => {
    if (id === null) {
      setProjectDetailsLoaded(true);
    } else if (id !== selectedProjectId) {
      setProjectDetailsLoaded(false);
    }
    setSelectedProjectId(id);
    rememberProjectSelection(id);
    if (isMobile) {
      setProjectDrawerOpen(false);
    }
  };

  const cancelProjectEdit = () => {
    setEditingProjectId(null);
    setEditingProjectName('');
    setEditingProjectSaving(false);
  };

  const beginProjectEdit = (project: Project) => {
    if (!project.id) return;
    setEditingProjectId(project.id);
    setEditingProjectName(project.name ?? '');
    setEditingProjectSaving(false);
  };

  const saveProjectEdit = async () => {
    if (!adminToken || !editingProjectId) return;
    const trimmedName = editingProjectName.trim();
    if (!trimmedName) {
      setError('Project name is required.');
      return;
    }
    setEditingProjectSaving(true);
    try {
      const resp = await fetch(`${baseApi}/api/projects/${editingProjectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Token': adminToken,
        },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!resp.ok) throw new Error(`Failed to update project (${resp.status})`);
      const updated = await resp.json();
      setProjects((prev) => prev.map((proj) => (proj.id === updated.id ? { ...proj, ...updated } : proj)));
      cancelProjectEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setEditingProjectSaving(false);
    }
  };

  const handleProjectKeyDown = (event: KeyboardEvent<HTMLDivElement>, projectId: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectProject(projectId);
    }
  };

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
    setProjectsLoaded(false);
    setProjectDetailsLoaded(false);
    setInitialPageReady(false);
    setProjects([]);
    setSelectedProjectId(null);
    setFinals([]);
    setEnvelopes([]);
    setInvestors([]);
    closeDrawers();
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

  const loadProjects = async (focusId?: number) => {
    if (!adminToken) return;
    setProjectsLoaded(false);
    try {
      const resp = await fetch(`${baseApi}/api/projects`, {
        headers: { 'X-Access-Token': adminToken },
      });
      if (!resp.ok) throw new Error(`Failed to load projects (${resp.status})`);
      const data = await resp.json();
      const sorted = Array.isArray(data) ? [...data].sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0)) : [];
      setProjects(sorted);
      cancelProjectEdit();
      const rawSaved = typeof window !== 'undefined' ? localStorage.getItem('adminSelectedProjectId') : null;
      const savedId = rawSaved ? Number(rawSaved) : null;
      const savedValid = typeof savedId === 'number' && Number.isFinite(savedId) && sorted.some((p) => p.id === savedId);

      if (typeof focusId === 'number' && sorted.some((project) => project.id === focusId)) {
        selectProject(focusId);
        clearProjectQueryParam();
      } else if (savedValid && savedId !== null) {
        selectProject(savedId);
      } else if (sorted.length) {
        selectProject(sorted[0].id);
      } else {
        selectProject(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setProjectsLoaded(true);
    }
  };

useEffect(() => {
  if (!adminVerified || !adminToken) return;
  loadProjects(projectParamId);
}, [adminVerified, adminToken, projectParamId]);

  useEffect(() => {
    if (!adminToken) return;
    if (!selectedProjectId) {
      setProjectDetailsLoaded(true);
      return;
    }
    let cancelled = false;
    const fetchProjectDetails = async () => {
      setProjectDetailsLoaded(false);
      setLoading(true);
      setError(null);
      try {
        const [finalsData, envelopesData] = await Promise.all([
          fetch(`${baseApi}/api/projects/${selectedProjectId}/final-artifacts`, {
            headers: { 'X-Access-Token': adminToken },
          }).then((r) => r.json()),
          fetch(`${baseApi}/api/projects/${selectedProjectId}/envelopes`, {
            headers: { 'X-Access-Token': adminToken },
          }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setFinals(finalsData || []);
        setEnvelopes(envelopesData || []);
        setSelectedFinalIds([]);
        setExpandedEnvelopes({});
        await loadInvestors(selectedProjectId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load project details');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setProjectDetailsLoaded(true);
        }
      }
    };
    fetchProjectDetails();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, adminToken]);

useEffect(() => {
  if (!selectedProjectId || !adminToken) {
    setProjectFiles([]);
    return;
  }
  loadProjectFiles(selectedProjectId);
}, [selectedProjectId, adminToken]);

useEffect(() => {
  setCenterTab('documents');
}, [selectedProjectId]);

  useEffect(() => {
    if (initialPageReady) return;
    if (adminTokenLoading) return;
    if (!adminVerified) return;
    if (!projectsLoaded) return;
    if (!projectDetailsLoaded) return;
    setInitialPageReady(true);
  }, [initialPageReady, adminTokenLoading, adminVerified, projectsLoaded, projectDetailsLoaded]);

  const resetInvestorForm = () => {
    setShowInvestorForm(false);
    setNewInvestorName('');
    setNewInvestorEmail('');
    setNewInvestorUnits('');
    setNewInvestorMailing('');
    setNewInvestorBankName('');
    setNewInvestorBankAccount('');
    setNewInvestorBankRouting('');
  };

  const loadProjectFiles = async (projectId: number) => {
    if (!adminToken) return;
    setProjectFilesLoading(true);
    try {
      const resp = await fetch(`${baseApi}/api/projects/${projectId}/files`, {
        headers: { 'X-Access-Token': adminToken },
      });
      if (!resp.ok) throw new Error(`Failed to load documents (${resp.status})`);
      const list = await resp.json();
      setProjectFiles(list || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setProjectFilesLoading(false);
    }
  };

  const handleProjectFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setProjectFileUploadFile(file);
    if (file) {
      setProjectFileUploadName(file.name);
      setShowDocumentUpload(true);
    }
    setHoveredProjectFileId(null);
  };

  const uploadProjectFile = async () => {
    if (!selectedProjectId || !adminToken || !projectFileUploadFile) {
      setError('Select a project and document to upload.');
      return;
    }
    const label = projectFileUploadName.trim() || projectFileUploadFile.name || 'Project document';
    const formData = new FormData();
    formData.append('file', projectFileUploadFile);
    formData.append('label', label);
    setProjectFileUploading(true);
    try {
      const resp = await fetch(`${baseApi}/api/projects/${selectedProjectId}/files`, {
        method: 'POST',
        headers: { 'X-Access-Token': adminToken },
        body: formData,
      });
      if (!resp.ok) throw new Error(`Failed to upload document (${resp.status})`);
      const created = await resp.json();
      setProjectFiles((prev) => [created, ...prev]);
      setProjectFileUploadFile(null);
      setProjectFileUploadName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setProjectFileUploading(false);
    }
  };

  const deleteProjectFile = async (fileId: number) => {
    if (!selectedProjectId || !adminToken) return;
    const confirmed = window.confirm('Delete this document?');
    if (!confirmed) return;
    setProjectFileDeletingId(fileId);
    try {
      const resp = await fetch(`${baseApi}/api/projects/${selectedProjectId}/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'X-Access-Token': adminToken },
      });
      if (!resp.ok) throw new Error(`Failed to delete document (${resp.status})`);
      setProjectFiles((prev) => prev.filter((file) => file.id !== fileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setProjectFileDeletingId((prev) => (prev === fileId ? null : prev));
    }
  };

  const loadInvestors = async (projectId: number) => {
    if (!adminToken) return;
    setLoadingInvestors(true);
    try {
      const resp = await fetch(`${baseApi}/api/projects/${projectId}/investors`, {
        headers: { 'X-Access-Token': adminToken },
      });
      if (!resp.ok) throw new Error(`Failed to load investors (${resp.status})`);
      const list = await resp.json();
      setInvestors(list || []);
      setSelectedInvestorIds([]);
      setManageInvestorsMode(false);
      resetInvestorForm();
      setEditingInvestorId(null);
      setEditingInvestorName('');
      setEditingInvestorEmail('');
      setEditingInvestorUnits('');
      setEditingInvestorMailing('');
      setEditingInvestorBankName('');
      setEditingInvestorBankAccount('');
      setEditingInvestorBankRouting('');
      setEditingInvestorSaving(false);
      setHoveredInvestorId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load investors');
    } finally {
      setLoadingInvestors(false);
    }
  };

  const selectedProject = useMemo(() => {
    const project = projects.find((p) => p.id === selectedProjectId) || null;
    // Reset manage modes when switching projects so states don't leak.
    setManageDocumentsMode(false);
    setManageSignedMode(false);
    setManageEnvelopesMode(false);
    setSelectedFinalIds([]);
    setSelectedEnvelopeIds([]);
    setExpandedEnvelopes({});
    setExpandedFinals({});
    setRevokingEnvelopes(false);
    setManageInvestorsMode(false);
    setSelectedInvestorIds([]);
    resetInvestorForm();
    setEditingInvestorId(null);
    setEditingInvestorName('');
    setEditingInvestorEmail('');
    setEditingInvestorUnits('');
    setEditingInvestorMailing('');
    setEditingInvestorBankName('');
    setEditingInvestorBankAccount('');
    setEditingInvestorBankRouting('');
    setEditingInvestorSaving(false);
    setHoveredInvestorId(null);
    setProjectFiles([]);
    setProjectFileUploadFile(null);
    setProjectFileUploadName('');
    setProjectFileUploading(false);
    setProjectFileDeletingId(null);
    setHoveredProjectFileId(null);
    return project;
  }, [projects, selectedProjectId]);
  const selectedProjectToken = selectedProject?.access_token ?? null;
  const outstandingEnvelopes = useMemo(() => envelopes.filter((env) => env.status !== 'completed'), [envelopes]);
  const envelopeMap = useMemo(() => {
    const map: Record<number, EnvelopeSummary> = {};
    envelopes.forEach((env) => {
      map[env.id] = env;
    });
    return map;
  }, [envelopes]);
  const tokenParam = adminToken ? `?token=${encodeURIComponent(adminToken)}` : '';
  const shareLink = useMemo(() => {
    if (!selectedProject || !selectedProjectToken) return '';
    const origin =
      typeof window !== 'undefined' && window.location?.origin ? window.location.origin : process.env.NEXT_PUBLIC_WEB_BASE;
    const base = origin || 'http://localhost:3000';
    return `${base}/projects/${selectedProject.id}/${selectedProjectToken}`;
  }, [selectedProject, selectedProjectToken]);
  const hasInvestors = investors.length > 0;
  const hasOutstandingEnvelopes = outstandingEnvelopes.length > 0;
  const documentEntries = useMemo(
    () => [
      ...outstandingEnvelopes.map((env) => ({ kind: 'awaiting' as const, env })),
      ...finals.map((finalItem) => ({ kind: 'signed' as const, final: finalItem })),
    ],
    [outstandingEnvelopes, finals],
  );
  const hasSignaturesAvailable = documentEntries.length > 0;
  const hasProjectFiles = projectFiles.length > 0;
  const canRequestSignatures = Boolean(selectedProjectId && hasInvestors);
  const totalInvestorUnits = useMemo(
    () => investors.reduce((sum, investor) => sum + (investor.units_invested || 0), 0),
    [investors],
  );
  const totalDocumentsCount = documentEntries.length + projectFiles.length;
  const docStats = useMemo(
    () => [
      {
        label: 'Investors',
        value: investors.length.toString(),
        icon: (
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="1.7" fill="none">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="3" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
      {
        label: 'Shares committed',
        value: `$${totalInvestorUnits.toLocaleString('en-US')}`,
        icon: (
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="1.7" fill="none">
            <path d="M12 1v22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        ),
      },
      {
        label: 'Documents',
        value: totalDocumentsCount.toString(),
        icon: (
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="1.7" fill="none">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
          </svg>
        ),
      },
      {
        label: 'Awaiting signatures',
        value: outstandingEnvelopes.length.toString(),
        icon: (
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="1.7" fill="none">
            <path d="M21 2l-6 6" />
            <path d="M12 3a9 9 0 1 0 9 9" />
            <path d="M12 7v5l2.5 2.5" />
          </svg>
        ),
      },
    ],
    [totalDocumentsCount, outstandingEnvelopes.length, investors.length, totalInvestorUnits],
  );
  const pageTitle = useMemo(
    () => (selectedProject ? `${selectedProject.name} | Admin` : 'Admin Portal'),
    [selectedProject],
  );
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = pageTitle;
    }
  }, [pageTitle]);

  useEffect(() => {
    if (!hasSignaturesAvailable && manageDocumentsMode) {
      setManageDocumentsMode(false);
      setManageSignedMode(false);
      setManageEnvelopesMode(false);
      setSelectedFinalIds([]);
      setSelectedEnvelopeIds([]);
      setRevokingEnvelopes(false);
    }
  }, [hasSignaturesAvailable, manageDocumentsMode]);

  const toggleFinalSelection = (id: number) => {
    setSelectedFinalIds((prev) => (prev.includes(id) ? prev.filter((fid) => fid !== id) : [...prev, id]));
  };

  const toggleEnvelopeSelection = (id: number) => {
    setSelectedEnvelopeIds((prev) => (prev.includes(id) ? prev.filter((eid) => eid !== id) : [...prev, id]));
  };

  const revokeSelectedEnvelopes = async (options?: { skipConfirm?: boolean }) => {
    if (!selectedProjectId || !selectedEnvelopeIds.length) return false;
    const envelopeIds = [...selectedEnvelopeIds];
    let proceed = true;
    if (!options?.skipConfirm) {
      proceed = window.confirm(
        `Revoke ${envelopeIds.length} envelope${envelopeIds.length > 1 ? 's' : ''}? Pending signees will lose access immediately.`,
      );
    }
    if (!proceed) return false;
    setRevokingEnvelopes(true);
    try {
      for (const envelopeId of envelopeIds) {
        const resp = await fetch(`${baseApi}/api/projects/${selectedProjectId}/envelopes/${envelopeId}`, {
          method: 'DELETE',
          headers: { 'X-Access-Token': adminToken ?? '' },
        });
        if (!resp.ok) throw new Error(`Failed to revoke envelope (${resp.status})`);
      }
      setEnvelopes((prev) => prev.filter((env) => !envelopeIds.includes(env.id)));
      setSelectedEnvelopeIds([]);
      setSelectedFinalIds((prev) => prev.filter((id) => !envelopeIds.includes(id)));
      setExpandedEnvelopes((prev) => {
        const next = { ...prev };
        envelopeIds.forEach((envelopeId) => {
          delete next[envelopeId];
        });
        return next;
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke envelopes');
      return false;
    } finally {
      setRevokingEnvelopes(false);
    }
  };

  const toggleDocumentsManage = () => {
    setManageDocumentsMode((prev) => {
      const next = !prev;
      if (next) {
        setManageSignedMode(true);
        setManageEnvelopesMode(true);
      } else {
        setManageSignedMode(false);
        setManageEnvelopesMode(false);
        setSelectedFinalIds([]);
        setSelectedEnvelopeIds([]);
        setRevokingEnvelopes(false);
      }
      return next;
    });
  };

  const deleteSelectedDocuments = async () => {
    if (!selectedProjectId) return;
    const signedCount = selectedFinalIds.length;
    const awaitingCount = selectedEnvelopeIds.length;
    if (!signedCount && !awaitingCount) return;
    const parts: string[] = [];
    if (signedCount) parts.push(`${signedCount} completed document${signedCount > 1 ? 's' : ''}`);
    if (awaitingCount) parts.push(`${awaitingCount} awaiting document${awaitingCount > 1 ? 's' : ''}`);
    const confirmRemove = window.confirm(
      `Delete ${parts.join(' and ')}? This cannot be undone. Awaiting documents will be revoked.`,
    );
    if (!confirmRemove) return;
    if (signedCount) {
      await deleteSelectedFinals({ skipConfirm: true });
    }
    if (awaitingCount) {
      await revokeSelectedEnvelopes({ skipConfirm: true });
    }
  };

  const deleteSelectedFinals = async (options?: { skipConfirm?: boolean }) => {
    if (!selectedProjectId || !selectedFinalIds.length) return false;
    let proceed = true;
    if (!options?.skipConfirm) {
      proceed = window.confirm(`Delete ${selectedFinalIds.length} signed packet${selectedFinalIds.length > 1 ? 's' : ''}? This cannot be undone.`);
    }
    if (!proceed) return false;
    setActionLoading(true);
    try {
      for (const id of selectedFinalIds) {
        const resp = await fetch(`${baseApi}/api/projects/${selectedProjectId}/final-artifacts/${id}`, {
          method: 'DELETE',
          headers: { 'X-Access-Token': adminToken ?? '' },
        });
        if (!resp.ok) throw new Error(`Delete failed (${resp.status})`);
      }
      setFinals((prev) => prev.filter((item) => !selectedFinalIds.includes(item.envelope_id)));
      setSelectedFinalIds([]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete signed packets');
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const toggleInvestorsManage = () => {
    if (!selectedProjectId) return;
    setManageInvestorsMode((prev) => {
      if (prev) {
        setSelectedInvestorIds([]);
        resetInvestorForm();
      } else {
        setEditingInvestorId(null);
        setEditingInvestorName('');
        setEditingInvestorEmail('');
        setEditingInvestorUnits('');
        setEditingInvestorSaving(false);
      }
      return !prev;
    });
  };

  const exportInvestorsCsv = () => {
    if (!investors.length) return;
    const headers = ['Name', 'Email', 'Units', 'Mailing Address', 'Bank Name', 'Account Number', 'Routing Number'];
    const rows = investors.map((inv) => [
      inv.name,
      inv.email,
      typeof inv.units_invested === 'number' ? inv.units_invested.toString() : '',
      inv.mailing_address ?? '',
      inv.bank_name ?? '',
      inv.bank_account_number ?? '',
      inv.bank_routing_number ?? '',
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = selectedProject?.name ? `${selectedProject.name}-investors.csv` : 'investors.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleInvestorSelection = (id: number) => {
    setSelectedInvestorIds((prev) => (prev.includes(id) ? prev.filter((iid) => iid !== id) : [...prev, id]));
  };

  const deleteSelectedInvestors = async () => {
    if (!adminToken || !selectedProjectId || !selectedInvestorIds.length) return;
    const confirmRemove = window.confirm(
      `Remove ${selectedInvestorIds.length} investor(s)? This cannot be undone.`,
    );
    if (!confirmRemove) return;
    setDeletingInvestors(true);
    try {
      for (const investorId of selectedInvestorIds) {
        const resp = await fetch(`${baseApi}/api/projects/${selectedProjectId}/investors/${investorId}`, {
          method: 'DELETE',
          headers: { 'X-Access-Token': adminToken },
        });
        if (!resp.ok) throw new Error(`Failed to remove investor (${resp.status})`);
      }
      setInvestors((prev) => prev.filter((inv) => !selectedInvestorIds.includes(inv.id)));
      setSelectedInvestorIds([]);
      setManageInvestorsMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove investors');
    } finally {
      setDeletingInvestors(false);
    }
  };

  const beginInvestorEdit = (investor: Investor) => {
    if (!investor.id) return;
    setEditingInvestorId(investor.id);
    setEditingInvestorName(investor.name ?? '');
    setEditingInvestorEmail(investor.email ?? '');
    setEditingInvestorUnits(
      typeof investor.units_invested === 'number' ? String(investor.units_invested) : '',
    );
    setEditingInvestorMailing(investor.mailing_address ?? '');
    setEditingInvestorBankName(investor.bank_name ?? '');
    setEditingInvestorBankAccount(investor.bank_account_number ?? '');
    setEditingInvestorBankRouting(investor.bank_routing_number ?? '');
  };

  const cancelInvestorEdit = () => {
    setEditingInvestorId(null);
    setEditingInvestorName('');
    setEditingInvestorEmail('');
    setEditingInvestorUnits('');
    setEditingInvestorMailing('');
    setEditingInvestorBankName('');
    setEditingInvestorBankAccount('');
    setEditingInvestorBankRouting('');
    setEditingInvestorSaving(false);
  };

  const saveInvestorEdit = async () => {
    if (!selectedProjectId || !adminToken || !editingInvestorId) return;
    const name = editingInvestorName.trim();
    const email = editingInvestorEmail.trim();
    if (!name || !email) {
      setError('Name and email are required to update an investor.');
      return;
    }
    const payload: Record<string, unknown> = {
      name,
      email,
      mailing_address: editingInvestorMailing.trim(),
      bank_name: editingInvestorBankName.trim(),
      bank_account_number: editingInvestorBankAccount.trim(),
      bank_routing_number: editingInvestorBankRouting.trim(),
    };
    const unitsTrimmed = editingInvestorUnits.trim();
    if (unitsTrimmed.length) {
      const parsedUnits = Number(unitsTrimmed);
      if (Number.isNaN(parsedUnits)) {
        setError('Units invested must be a valid number.');
        return;
      }
      payload.units_invested = parsedUnits;
    }
    setEditingInvestorSaving(true);
    try {
      const resp = await fetch(
        `${baseApi}/api/projects/${selectedProjectId}/investors/${editingInvestorId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Access-Token': adminToken,
          },
          body: JSON.stringify(payload),
        },
      );
      if (!resp.ok) throw new Error(`Failed to update investor (${resp.status})`);
      const updated = await resp.json();
      setInvestors((prev) => prev.map((inv) => (inv.id === updated.id ? { ...inv, ...updated } : inv)));
      cancelInvestorEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update investor');
    } finally {
      setEditingInvestorSaving(false);
    }
  };

  const createInvestor = async () => {
    if (!adminToken || !selectedProjectId) return;
    const name = newInvestorName.trim();
    const email = newInvestorEmail.trim();
    const units = Number(newInvestorUnits) || 0;
    if (!name || !email) {
      setError('Name and email are required to add an investor.');
      return;
    }
    setCreatingInvestor(true);
    try {
      const payload = {
        name,
        email,
        role: 'Investor',
        routing_order: investors.length + 1,
        units_invested: units,
        mailing_address: newInvestorMailing.trim(),
        bank_name: newInvestorBankName.trim(),
        bank_account_number: newInvestorBankAccount.trim(),
        bank_routing_number: newInvestorBankRouting.trim(),
        metadata_json: '{}',
      };
      const resp = await fetch(`${baseApi}/api/projects/${selectedProjectId}/investors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Token': adminToken,
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(`Failed to add investor (${resp.status})`);
      const created = await resp.json();
      setInvestors((prev) => [...prev, created]);
      resetInvestorForm();
      setShowInvestorForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add investor');
    } finally {
      setCreatingInvestor(false);
    }
  };

  const goToRequestSign = () => {
    if (!canRequestSignatures || !selectedProjectId) return;
    window.location.href = `/request-sign?project=${selectedProjectId}`;
  };

  const createProject = async () => {
    if (!adminToken) return;
    const name = newProjectName.trim();
    if (!name) {
      setError('Project name required');
      return;
    }
    setCreatingProject(true);
    setError(null);
    try {
      const resp = await fetch(`${baseApi}/api/projects?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'X-Access-Token': adminToken },
      });
      if (!resp.ok) throw new Error(`Failed to create project (${resp.status})`);
      const project = await resp.json();
      setNewProjectName('');
      setShowProjectForm(false);
      await loadProjects(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const toggleProjectManage = () => {
    setManageProjectsMode((prev) => {
      if (prev) {
        setSelectedProjectIds([]);
      } else {
        cancelProjectEdit();
      }
      return !prev;
    });
  };

  const toggleProjectSelection = (id: number) => {
    setSelectedProjectIds((prev) => (prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]));
  };

  const deleteSelectedProjects = async () => {
    if (!selectedProjectIds.length) return;
    const confirmRemove = window.confirm(
      `Deleting ${selectedProjectIds.length} project(s) will remove all related documents, investors, and envelopes. This cannot be undone. Continue?`,
    );
    if (!confirmRemove) return;
    setActionLoading(true);
    try {
      for (const projectId of selectedProjectIds) {
        const resp = await fetch(`${baseApi}/api/projects/${projectId}`, {
          method: 'DELETE',
          headers: { 'X-Access-Token': adminToken ?? '' },
        });
        if (!resp.ok) throw new Error(`Failed to delete project (${resp.status})`);
        if (projectId === selectedProjectId) {
          selectProject(null);
        }
      }
      setSelectedProjectIds([]);
      setManageProjectsMode(false);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete projects');
    } finally {
      setActionLoading(false);
    }
  };

  const regenerateProjectToken = async (projectId: number) => {
    if (!adminToken) return;
    try {
      const resp = await fetch(`${baseApi}/api/projects/${projectId}/access-token`, {
        method: 'POST',
        headers: { 'X-Access-Token': adminToken },
      });
      if (!resp.ok) throw new Error(`Failed to regenerate token (${resp.status})`);
      await loadProjects(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate token');
    }
  };

  const copyProjectToken = async (token?: string | null) => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      alert('Token copied to clipboard.');
    } catch {
      alert('Unable to copy token automatically.');
    }
  };

  const handleTokenSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
          background: palette.bg,
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div className="spinner" aria-hidden="true" />
        <p>Verifying access…</p>
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: palette.bg }}>
        <form
          onSubmit={handleTokenSubmit}
          style={{
            background: '#fff',
            padding: 32,
            borderRadius: 20,
            boxShadow: '0 30px 60px rgba(15,23,42,0.12)',
            width: 'min(360px, 90vw)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            border: `1px solid ${palette.border}`,
          }}
        >
          <h2 style={{ margin: 0, color: palette.text }}>Admin Access</h2>
          <p style={{ margin: 0, fontSize: 14, color: palette.accentMuted }}>Enter the admin access token to continue.</p>
          <input
            type="password"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="Admin token"
            style={{
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${palette.border}`,
              background: '#fff',
              color: palette.text,
            }}
            disabled={verifyingLocally}
          />
          {adminTokenError && <p style={{ color: '#f87171', margin: 0 }}>{adminTokenError}</p>}
          <button
            type="submit"
            disabled={verifyingLocally}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '10px 16px',
              background: verifyingLocally ? 'rgba(37,99,235,0.6)' : palette.accent,
              color: '#fff',
              fontWeight: 600,
              cursor: verifyingLocally ? 'wait' : 'pointer',
              boxShadow: '0 12px 25px rgba(37,99,235,0.35)',
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
                  animation: 'adminMiniSpin 0.8s linear infinite',
                }}
              />
            )}
            {verifyingLocally ? 'Verifying…' : 'Continue'}
          </button>
          <style jsx>{`
            @keyframes adminMiniSpin {
              to {
                transform: rotate(360deg);
              }
            }
          `}</style>
        </form>
      </div>
    );
  }

  if (!initialPageReady) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: palette.bg,
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div className="spinner" aria-hidden="true" />
        <p>Preparing dashboard…</p>
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

  const projectSidebarContent = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: palette.text }}>Projects</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            onClick={toggleProjectManage}
            style={{
              border: `1px solid ${palette.border}`,
              background: manageProjectsMode ? palette.accent : '#fff',
              color: manageProjectsMode ? '#fff' : palette.text,
              borderRadius: 999,
              padding: '4px 10px',
              fontSize: 12,
              cursor: 'pointer',
              boxShadow: manageProjectsMode ? '0 8px 18px rgba(37,99,235,0.25)' : 'none',
            }}
          >
            {manageProjectsMode ? 'Done' : 'Manage'}
          </button>
          {manageProjectsMode && (
            <button
              type="button"
              onClick={deleteSelectedProjects}
              disabled={!selectedProjectIds.length || actionLoading}
              style={{
                border: '1px solid #dc2626',
                color: '#fff',
                background: '#dc2626',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 12,
                cursor: !selectedProjectIds.length || actionLoading ? 'not-allowed' : 'pointer',
                opacity: !selectedProjectIds.length || actionLoading ? 0.5 : 1,
                boxShadow: !selectedProjectIds.length || actionLoading ? 'none' : '0 10px 18px rgba(220,38,38,0.25)',
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {isMobile && (
        <div className="drawer-mobile-close">
          <button type="button" onClick={() => setProjectDrawerOpen(false)}>
            Close ✕
          </button>
        </div>
      )}
      <div className="project-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {projects.map((project, idx) => {
          const active = project.id === selectedProjectId;
          const hovered = hoveredProjectId === project.id;
          const isEditing = project.id === editingProjectId;
          const baseBackground = active
            ? 'linear-gradient(135deg,#f8fbff,#eef3ff)'
            : '#ffffff';
          const statusLabel = project.status ? project.status.replace(/-/g, ' ') : 'active';
          const statusColor =
            project.status === 'active'
              ? '#22c55e'
              : project.status === 'funding'
              ? '#f97316'
              : project.status === 'completed'
              ? '#94a3b8'
              : '#94a3b8';
          return (
            <div
              key={`project-${project.id ?? idx}`}
              role={!isEditing ? 'button' : undefined}
              tabIndex={!isEditing ? 0 : -1}
              onClick={!isEditing ? () => selectProject(project.id) : undefined}
              onKeyDown={!isEditing ? (event) => handleProjectKeyDown(event, project.id) : undefined}
              onMouseEnter={() => setHoveredProjectId(project.id)}
              onMouseLeave={() => setHoveredProjectId((prev) => (prev === project.id ? null : prev))}
              style={{
                padding: '18px 20px',
                borderRadius: 20,
                border: `2px solid ${active ? palette.accent : hovered || isEditing ? '#c7d2fe' : palette.border}`,
                background: baseBackground,
                color: palette.text,
                cursor: isEditing ? 'default' : 'pointer',
                fontWeight: active ? 600 : 500,
                boxShadow: active
                  ? '0 20px 38px rgba(59,130,246,0.25)'
                  : hovered || isEditing
                  ? '0 12px 26px rgba(15,23,42,0.12)'
                  : '0 4px 12px rgba(15,23,42,0.05)',
                transition: 'background 0.15s ease, border 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="text"
                    value={editingProjectName}
                    onChange={(event) => setEditingProjectName(event.target.value)}
                    placeholder="Project name"
                    disabled={editingProjectSaving}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: `1px solid ${palette.border}`,
                      background: '#fff',
                      color: palette.text,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        cancelProjectEdit();
                      }}
                      disabled={editingProjectSaving}
                      style={{
                        border: `1px solid ${palette.border}`,
                        background: '#fff',
                        color: palette.text,
                        borderRadius: 999,
                        padding: '6px 14px',
                        fontSize: 12,
                        cursor: editingProjectSaving ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        saveProjectEdit();
                      }}
                      disabled={editingProjectSaving || !editingProjectName.trim()}
                      style={{
                        border: 'none',
                        background: palette.accent,
                        color: '#fff',
                        borderRadius: 999,
                        padding: '6px 14px',
                        fontSize: 12,
                        cursor: editingProjectSaving || !editingProjectName.trim() ? 'not-allowed' : 'pointer',
                        boxShadow:
                          editingProjectSaving || !editingProjectName.trim()
                            ? 'none'
                            : '0 8px 18px rgba(37,99,235,0.25)',
                      }}
                    >
                      {editingProjectSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {manageProjectsMode && (
                        <input
                          type="checkbox"
                          checked={selectedProjectIds.includes(project.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleProjectSelection(project.id)}
                          style={{ width: 18, height: 18 }}
                        />
                      )}
                      <div>
                        <strong style={{ display: 'block', fontSize: 15 }}>{project.name}</strong>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 12,
                            color: active ? palette.accent : palette.accentMuted,
                          }}
                        >
                          Project #{project.id}
                        </p>
                      </div>
                    </div>
                    {!manageProjectsMode && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          beginProjectEdit(project);
                        }}
                        style={{
                          border: `1px solid ${palette.border}`,
                          borderRadius: 999,
                          padding: '4px 12px',
                          fontSize: 12,
                          background: '#fff',
                          color: palette.text,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: '#f3f4f6' }}>
                          <span
                            aria-hidden="true"
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: statusColor,
                            }}
                          />
                          <span style={{ fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: '#475569' }}>{statusLabel}</span>
                        </div>
                      </div>
                    </div>
              )}
            </div>
          );
        })}
        {manageProjectsMode && (
          <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: 12, marginTop: 4 }}>
            {!showProjectForm ? (
              <button
                type="button"
                onClick={() => setShowProjectForm(true)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: palette.accent,
                  textAlign: 'left',
                  padding: 0,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Create project
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="Project name"
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: `1px solid ${palette.border}`,
                    background: '#fff',
                    color: palette.text,
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={createProject}
                    disabled={creatingProject}
                    style={{
                      flex: 1,
                      borderRadius: 999,
                      border: 'none',
                      padding: '10px 14px',
                      background: creatingProject ? 'rgba(37,99,235,0.3)' : palette.accent,
                      color: '#fff',
                      fontWeight: 600,
                      cursor: creatingProject ? 'not-allowed' : 'pointer',
                      boxShadow: creatingProject ? 'none' : '0 12px 24px rgba(37,99,235,0.25)',
                    }}
                  >
                    {creatingProject ? 'Adding…' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProjectForm(false);
                      setNewProjectName('');
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: palette.accentMuted,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  const layoutClasses = ['admin-layout'];
  if (isMobile) layoutClasses.push('mobile');
  if (isMobile && projectDrawerOpen) layoutClasses.push('show-projects');
  const layoutClassName = layoutClasses.join(' ');

  return (
    <div
      className={layoutClassName}
      style={{
        minHeight: '100vh',
        display: 'flex',
        background: palette.bg,
        color: palette.text,
        padding: isMobile ? 0 : 24,
        gap: isMobile ? 0 : 24,
      }}
    >
      <style jsx global>{`
        .admin-document-link {
          text-decoration: none;
        }
        .admin-document-link:hover,
        .admin-document-link:focus-visible {
          text-decoration: underline;
        }
      `}</style>
      {isMobile && (
        <div className="admin-mobile-header">
          <button
            type="button"
            onClick={() => {
              setProjectDrawerOpen(true);
            }}
          >
            Projects
          </button>
          <div className="admin-mobile-heading">
            <p>Project</p>
            <strong>{selectedProject?.name || 'Select a project'}</strong>
          </div>
          <div style={{ width: 60 }} />
        </div>
      )}
      <aside
        className="admin-sidebar"
        style={{
          width: isMobile ? '100%' : 300,
          padding: 24,
          borderRight: 'none',
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: 'none',
          borderRadius: 0,
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>{projectSidebarContent}</div>
        <button
          type="button"
          onClick={logout}
          style={{
            border: `1px solid ${palette.accent}`,
            background: '#fff',
            color: palette.accent,
            borderRadius: 999,
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Sign out
        </button>
      </aside>
      <main
        className="admin-main"
        style={{
          flex: 1,
          padding: isMobile ? 16 : 40,
          overflowY: 'auto',
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? 20 : 32,
        }}
      >
        <section
          style={{
            display: 'flex',
            gap: 16,
            overflowX: 'auto',
            paddingBottom: 4,
          }}
        >
          {docStats.map((stat) => (
            <div
              key={stat.label}
              style={{
                background: '#fff',
                borderRadius: 20,
                border: `1px solid ${palette.border}`,
                padding: 20,
                boxShadow: shadows.subtle,
                minWidth: isMobile ? 180 : 0,
                flex: isMobile ? '0 0 auto' : '1 1 0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 16,
                    background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
                    color: '#4338ca',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {stat.icon}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, color: palette.accentMuted }}>{stat.label}</p>
                  <strong style={{ fontSize: 28, marginTop: 4, display: 'block' }}>{stat.value}</strong>
                </div>
              </div>
            </div>
          ))}
        </section>
          <section
            style={{
              borderRadius: 0,
              background: '#f8fafc',
              border: 'none',
              boxShadow: 'none',
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 12, alignItems: 'center' }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: isMobile ? 'nowrap' : 'wrap',
                    overflowX: isMobile ? 'auto' : 'visible',
                    width: isMobile ? '100%' : 'auto',
                  }}
                >
                {(
                  [
                    { id: 'documents', label: 'Documents', icon: '📁' },
                    { id: 'signatures', label: 'Signatures', icon: '✍️' },
                    { id: 'investors', label: 'Investors', icon: '👥' },
                    { id: 'share', label: 'Share', icon: '🔐' },
                  ] as Array<{ id: 'signatures' | 'documents' | 'share' | 'investors'; label: string; icon: string }>
                ).map((tab) => {
                  const active = centerTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      data-testid={`tab-${tab.id}`}
                      onClick={() => setCenterTab(tab.id)}
                      style={{
                        border: 'none',
                        borderRadius: 999,
                        padding: '8px 18px',
                        fontSize: 13,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: active ? palette.accent : 'transparent',
                        color: active ? '#fff' : palette.textStrong,
                        cursor: 'pointer',
                        fontWeight: active ? 600 : 500,
                        flex: isMobile ? '0 0 auto' : undefined,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span aria-hidden="true">{tab.icon}</span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </header>
            {error && <div style={{ color: '#fca5a5' }}>{error}</div>}
            {centerTab === 'signatures' && selectedProject && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 12,
                      width: isMobile ? '100%' : 'auto',
                    }}
                  >
                    <button
                      type="button"
                      onClick={toggleDocumentsManage}
                      data-testid="signatures-manage-toggle"
                    disabled={!hasSignaturesAvailable}
                      style={{
                        border: `1px solid ${palette.border}`,
                        background: manageDocumentsMode ? palette.accent : '#fff',
                        color: manageDocumentsMode ? '#fff' : palette.text,
                        borderRadius: 999,
                        padding: '4px 12px',
                        fontSize: 12,
                      cursor: hasSignaturesAvailable ? 'pointer' : 'not-allowed',
                      opacity: hasSignaturesAvailable ? 1 : 0.5,
                        boxShadow: manageDocumentsMode ? '0 8px 18px rgba(37,99,235,0.25)' : 'none',
                      }}
                    >
                      {manageDocumentsMode ? 'Done' : 'Manage'}
                    </button>
                    {manageDocumentsMode && (
                      <button
                        type="button"
                        onClick={deleteSelectedDocuments}
                        data-testid="signatures-delete-selected"
                      disabled={
                        !hasSignaturesAvailable ||
                          (!selectedFinalIds.length && !selectedEnvelopeIds.length) ||
                          actionLoading ||
                          revokingEnvelopes
                        }
                        style={{
                          border: '1px solid #dc2626',
                          color: '#fff',
                          background: '#dc2626',
                          borderRadius: 999,
                          padding: '6px 12px',
                          fontSize: 13,
                        cursor:
                          !hasSignaturesAvailable ||
                            (!selectedFinalIds.length && !selectedEnvelopeIds.length) ||
                            actionLoading ||
                            revokingEnvelopes
                              ? 'not-allowed'
                              : 'pointer',
                        opacity:
                          !hasSignaturesAvailable ||
                            (!selectedFinalIds.length && !selectedEnvelopeIds.length) ||
                            actionLoading ||
                            revokingEnvelopes
                              ? 0.5
                              : 1,
                        boxShadow:
                          !hasSignaturesAvailable ||
                            (!selectedFinalIds.length && !selectedEnvelopeIds.length) ||
                            actionLoading ||
                            revokingEnvelopes
                              ? 'none'
                              : '0 10px 18px rgba(220,38,38,0.25)',
                        }}
                      >
                        {actionLoading || revokingEnvelopes ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={goToRequestSign}
                    disabled={!canRequestSignatures}
                    style={usePrimaryButtonStyle(canRequestSignatures, requestButtonHovered)}
                    onMouseEnter={() => canRequestSignatures && setRequestButtonHovered(true)}
                    onMouseLeave={() => canRequestSignatures && setRequestButtonHovered(false)}
                    title={
                      canRequestSignatures ? 'Launch the Request Sign flow' : 'Add investors first to request signatures'
                    }
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        lineHeight: 1,
                      }}
                    >
                      ✍️
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>Request signatures</span>
                  </button>
                </div>

              {hasSignaturesAvailable && (
                <div data-testid="signatures-list-section" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {documentEntries.map((entry, idx) => {
                      if (entry.kind === 'awaiting') {
                        const env = entry.env;
                        const expanded = expandedEnvelopes[env.id] ?? false;
                        const hasSigners = env.total_signers > 0;
                        const progressLabel = hasSigners
                          ? `${env.completed_signers}/${env.total_signers} signed`
                          : 'Incomplete setup';
                        const buttonLabel = expanded ? 'Hide signees' : progressLabel;
                        const documentUrl =
                          selectedProjectId && env.document?.id
                            ? `${baseApi}/api/projects/${selectedProjectId}/documents/${env.document.id}/pdf${tokenParam}`
                            : null;
                        const fileLabel = env.document?.filename || 'Untitled PDF';
                        const envelopeHovered = hoveredEnvelopeId === env.id;
                        const envelopeSelected = selectedEnvelopeIds.includes(env.id);
                        return (
                          <div
                            key={`env-${env.id}`}
                            data-document-kind="awaiting"
                            onMouseEnter={() => setHoveredEnvelopeId(env.id)}
                            onMouseLeave={() =>
                              setHoveredEnvelopeId((prev) => (prev === env.id ? null : prev))
                            }
                            style={{
                              border:
                                envelopeSelected || envelopeHovered
                                  ? `1px solid ${palette.accent}`
                                  : `1px solid ${palette.border}`,
                              borderRadius: 18,
                              padding: 16,
                              background: envelopeSelected
                                ? envelopeHovered
                                  ? '#e4ddff'
                                  : '#ede9ff'
                                : envelopeHovered
                                ? '#f5f2ff'
                                : '#fff',
                              boxShadow: envelopeSelected
                                ? '0 12px 28px rgba(37,99,235,0.25)'
                                : envelopeHovered
                                ? '0 12px 28px rgba(15,23,42,0.14)'
                                : '0 10px 24px rgba(15,23,42,0.08)',
                              transition: 'background 0.15s ease, border 0.15s ease, box-shadow 0.15s ease',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: 16,
                                flexWrap: 'wrap',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 200 }}>
                                {manageEnvelopesMode && (
                                  <input
                                    type="checkbox"
                                    checked={envelopeSelected}
                                    onChange={() => toggleEnvelopeSelection(env.id)}
                                    onClick={(event) => event.stopPropagation()}
                                  />
                                )}
                                <div>
                                  {documentUrl ? (
                                    <a
                                      href={documentUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={documentLinkStyle}
                                      className="admin-document-link"
                                    >
                                      <strong style={{ fontSize: 16 }}>{fileLabel}</strong>
                                    </a>
                                  ) : (
                                    <strong style={{ fontSize: 16 }}>{fileLabel}</strong>
                                  )}
                                  <p style={{ margin: '4px 0 0', fontSize: 12, color: palette.accentMuted }}>
                                    {formatSentLabel(env.created_at)}
                                  </p>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <span style={awaitingChipStyle}>Awaiting</span>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setExpandedEnvelopes((prev) => ({
                                      ...prev,
                                      [env.id]: !expanded,
                                    }));
                                  }}
                                  style={{
                                    border: `1px solid ${palette.border}`,
                                    borderRadius: 999,
                                    padding: '4px 12px',
                                    background: '#fff',
                                    cursor: 'pointer',
                                    fontSize: 12,
                                  }}
                                >
                                  {buttonLabel}
                                </button>
                              </div>
                            </div>
                            {expanded && (
                              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {env.signers.map((signer) => {
                                  const completed = signer.status === 'completed';
                                  const completionLabel =
                                    completed && signer.completed_at
                                      ? formatLocalDateTime(signer.completed_at) || 'time unavailable'
                                      : null;
                                  const signerKey = `outstanding-signer-${env.id}-${signer.id}`;
                                  const signerHovered = hoveredSignerKey === signerKey;
                                  return (
                                    <div
                                      key={signerKey}
                                      onMouseEnter={() => setHoveredSignerKey(signerKey)}
                                      onMouseLeave={() =>
                                        setHoveredSignerKey((prev) => (prev === signerKey ? null : prev))
                                      }
                                      style={{
                                        padding: 12,
                                        borderRadius: 12,
                                        border: signerHovered ? `1px solid ${palette.accent}` : `1px solid ${palette.border}`,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        background: signerHovered ? '#f5f2ff' : '#fff',
                                        boxShadow: signerHovered ? '0 8px 18px rgba(15,23,42,0.12)' : 'none',
                                        transition: 'background 0.15s ease, border 0.15s ease, box-shadow 0.15s ease',
                                      }}
                                    >
                                      <div>
                                        <strong>{signer.name}</strong>
                                        <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>{signer.email}</p>
                                        {completionLabel && (
                                          <span style={{ fontSize: 11, color: palette.accentMuted }}>Completed {completionLabel}</span>
                                        )}
                                      </div>
                                      <span
                                        style={{
                                          borderRadius: 999,
                                          padding: '4px 10px',
                                          fontSize: 12,
                                          color: completed ? '#065f46' : '#92400e',
                                          background: completed ? '#dcfce7' : '#fffbeb',
                                          border: completed ? '1px solid #bbf7d0' : '1px solid #fde68a',
                                        }}
                                      >
                                        {completed ? 'Signed' : 'Pending'}
                                      </span>
                                      {signer.magic_link && (
                                        <button
                                          type="button"
                                          onClick={() => navigator.clipboard.writeText(signer.magic_link)}
                                          style={{
                                            border: `1px solid ${palette.border}`,
                                            borderRadius: 999,
                                            padding: '4px 10px',
                                            fontSize: 12,
                                            cursor: 'pointer',
                                            background: '#fff',
                                            marginLeft: 8,
                                          }}
                                        >
                                          Copy link
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      const item = entry.final;
                      const downloadUrl = `${baseApi}/api/projects/${selectedProjectId}/final-artifacts/${item.envelope_id}/pdf${tokenParam}`;
                      const finalEnvelope = envelopeMap[item.envelope_id];
                      const signerList = finalEnvelope?.signers ?? [];
                      const expanded = expandedFinals[item.envelope_id] ?? false;
                      const hasSigners = signerList.length > 0;
                      const completedAtLabel = formatLocalDateTime(item.completed_at) ?? 'time unavailable';
                      const cardSelected = selectedFinalIds.includes(item.envelope_id);
                      const cardHovered = hoveredFinalId === item.envelope_id;
                      const cardBackground = cardSelected
                        ? cardHovered
                          ? '#e4ddff'
                          : '#ede9ff'
                        : cardHovered
                        ? '#f5f2ff'
                        : '#fff';
                      return (
                        <div
                          key={`final-${selectedProjectId}-${item.envelope_id ?? `idx-${idx}`}-${item.sha256_final ?? 'na'}`}
                          data-document-kind="signed"
                          onMouseEnter={() => setHoveredFinalId(item.envelope_id)}
                          onMouseLeave={() => setHoveredFinalId((prev) => (prev === item.envelope_id ? null : prev))}
                          style={{
                            border: cardSelected ? `1px solid ${palette.accent}` : `1px solid ${palette.border}`,
                            borderRadius: 18,
                            padding: 16,
                            background: cardBackground,
                            boxShadow: cardSelected
                              ? '0 12px 28px rgba(37,99,235,0.25)'
                              : cardHovered
                              ? '0 12px 28px rgba(15,23,42,0.14)'
                              : '0 10px 24px rgba(15,23,42,0.08)',
                            transition: 'background 0.15s ease, border 0.15s ease, box-shadow 0.15s ease',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              gap: 16,
                              flexWrap: 'wrap',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 200 }}>
                              {manageSignedMode && (
                                <input
                                  type="checkbox"
                                  checked={cardSelected}
                                  onChange={() => toggleFinalSelection(item.envelope_id)}
                                  onClick={(event) => event.stopPropagation()}
                                />
                              )}
                              <div>
                                <a
                                  href={downloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={documentLinkStyle}
                                  className="admin-document-link"
                                >
                                  <strong style={{ fontSize: 16 }}>{item.document_name}</strong>
                                </a>
                                <p style={{ margin: '4px 0 0', fontSize: 12, color: palette.accentMuted }}>
                                  Completed {completedAtLabel}
                                </p>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <span style={completedChipStyle}>Completed</span>
                              {hasSigners && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setExpandedFinals((prev) => ({
                                      ...prev,
                                      [item.envelope_id]: !expanded,
                                    }));
                                  }}
                                  style={{
                                    border: `1px solid ${palette.border}`,
                                    borderRadius: 999,
                                    padding: '4px 12px',
                                    background: '#fff',
                                    cursor: 'pointer',
                                    fontSize: 12,
                                  }}
                                >
                                  {expanded ? 'Hide signees' : 'Signees'}
                                </button>
                              )}
                            </div>
                          </div>
                          {expanded && hasSigners && (
                            <div
                              style={{
                                marginTop: 16,
                                marginLeft: manageSignedMode ? 32 : 0,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                              }}
                            >
                              {signerList.map((signer) => {
                                const completed = signer.status === 'completed';
                                const completionLabel =
                                  completed && signer.completed_at
                                    ? formatLocalDateTime(signer.completed_at) || 'time unavailable'
                                    : null;
                                const signerKey = `final-signer-${item.envelope_id}-${signer.id}`;
                                const signerHovered = hoveredSignerKey === signerKey;
                                return (
                                  <div
                                    key={signerKey}
                                    onMouseEnter={() => setHoveredSignerKey(signerKey)}
                                    onMouseLeave={() =>
                                      setHoveredSignerKey((prev) => (prev === signerKey ? null : prev))
                                    }
                                    style={{
                                      padding: 12,
                                      borderRadius: 12,
                                      border: signerHovered ? `1px solid ${palette.accent}` : `1px solid ${palette.border}`,
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      background: signerHovered ? '#f5f2ff' : '#fff',
                                      boxShadow: signerHovered ? '0 8px 18px rgba(15,23,42,0.12)' : 'none',
                                      transition: 'background 0.15s ease, border 0.15s ease, box-shadow 0.15s ease',
                                    }}
                                  >
                                    <div>
                                      <strong>{signer.name}</strong>
                                      <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>{signer.email}</p>
                                      {completionLabel && (
                                        <span style={{ fontSize: 11, color: palette.accentMuted }}>Completed {completionLabel}</span>
                                      )}
                                    </div>
                                    <span
                                      style={{
                                        borderRadius: 999,
                                        padding: '4px 10px',
                                        fontSize: 12,
                                        color: completed ? '#065f46' : '#92400e',
                                        background: completed ? '#dcfce7' : '#fffbeb',
                                        border: completed ? '1px solid #bbf7d0' : '1px solid #fde68a',
                                      }}
                                    >
                                      {completed ? 'Signed' : 'Pending'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!hasSignaturesAvailable && (
                <div
                  style={{
                    border: `1px dashed ${palette.border}`,
                    borderRadius: 16,
                    padding: 24,
                    textAlign: 'center',
                    color: palette.accentMuted,
                    background: '#f8fafc',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13 }}>
                    Upload a PDF and add investors to start sending signature requests.
                  </p>
                </div>
              )}
            </div>
          )}
          {centerTab === 'signatures' && !selectedProject && (
            <div
              style={{
                padding: 32,
                border: '1px dashed rgba(148,163,184,0.4)',
                borderRadius: 16,
                textAlign: 'center',
                color: palette.accentMuted,
              }}
            >
              Select a project on the left to review its uploaded PDFs and signed packets.
            </div>
          )}
          {centerTab === 'documents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {!selectedProjectId ? (
                <div
                  style={{
                    padding: 32,
                    border: '1px dashed rgba(148,163,184,0.4)',
                    borderRadius: 16,
                    textAlign: 'center',
                    color: palette.accentMuted,
                  }}
                >
                  Select a project to upload documents.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      border: `1px solid ${palette.border}`,
                      borderRadius: 20,
                      padding: 20,
                      background: '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      boxShadow: shadows.subtle,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>Documents</p>
                        <h4 style={{ margin: '4px 0 0' }}>Share project files with your team</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDocumentUpload((prev) => !prev)}
                        style={{
                          border: 'none',
                          borderRadius: 999,
                          padding: '8px 16px',
                          background: palette.accent,
                          color: '#fff',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <svg
                          aria-hidden="true"
                          width={18}
                          height={18}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 16V4" />
                          <path d="M6 10l6-6 6 6" />
                          <rect x="4" y="16" width="16" height="4" rx="1" />
                        </svg>
                        {showDocumentUpload ? 'Close' : 'Upload document'}
                      </button>
                    </div>
                    {showDocumentUpload && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <input
                          type="text"
                          placeholder="Document name"
                          value={projectFileUploadName}
                          onChange={(event) => setProjectFileUploadName(event.target.value)}
                          style={{
                            padding: 10,
                            borderRadius: 10,
                            border: `1px solid ${palette.border}`,
                          }}
                        />
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,application/pdf,application/msword,application/vnd.ms-powerpoint,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          onChange={handleProjectFileSelection}
                          style={{ padding: 6 }}
                        />
                        {projectFileUploadFile && (
                          <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>
                            Selected: {projectFileUploadFile.name} ({Math.round(projectFileUploadFile.size / 1024)} KB)
                          </p>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={uploadProjectFile}
                            disabled={!projectFileUploadFile || projectFileUploading}
                            style={{
                              border: 'none',
                              borderRadius: 999,
                              padding: '8px 18px',
                              background:
                                !projectFileUploadFile || projectFileUploading ? 'rgba(37,99,235,0.3)' : palette.accent,
                              color: '#fff',
                              fontWeight: 600,
                              cursor: !projectFileUploadFile || projectFileUploading ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {projectFileUploading ? 'Uploading…' : 'Upload'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <p style={{ margin: '0 0 8px', fontSize: 13, color: palette.accentMuted }}>Uploaded documents</p>
                    {projectFilesLoading ? (
                      <p style={{ color: palette.accentMuted }}>Loading documents…</p>
                    ) : hasProjectFiles ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {projectFiles.map((file) => {
                          const downloadUrl = `${baseApi}/api/projects/${selectedProjectId}/files/${file.id}/download${tokenParam}`;
                          const deleting = projectFileDeletingId === file.id;
                          const hovered = hoveredProjectFileId === file.id;
                          return (
                            <div
                              key={file.id}
                              style={{
                                borderRadius: 16,
                                border: hovered ? `1px solid ${palette.accent}` : `1px solid ${palette.border}`,
                                padding: 16,
                                background: hovered ? '#f5f2ff' : '#fff',
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 16,
                                flexWrap: 'wrap',
                                boxShadow: hovered ? '0 12px 28px rgba(37,99,235,0.18)' : '0 4px 12px rgba(15,23,42,0.05)',
                                transition: 'background 0.15s ease, border 0.15s ease, box-shadow 0.15s ease',
                              }}
                              onMouseEnter={() => setHoveredProjectFileId(file.id)}
                              onMouseLeave={() =>
                                setHoveredProjectFileId((prev) => (prev === file.id ? null : prev))
                              }
                            >
                              <div style={{ flex: 1, minWidth: 200 }}>
                                <a
                                  href={downloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="admin-document-link"
                                  style={{
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: palette.accent,
                                  }}
                                >
                                  {file.display_name}
                                </a>
                                <p style={{ margin: '4px 0', fontSize: 12, color: palette.accentMuted }}>
                                  Original: {file.stored_filename}
                                </p>
                                <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>
                                  Uploaded {formatLocalDateTime(file.uploaded_at) ?? 'time unavailable'}
                                </p>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <button
                                  type="button"
                                  onClick={() => deleteProjectFile(file.id)}
                                  disabled={deleting}
                                  style={{
                                    border: '1px solid #dc2626',
                                    borderRadius: 999,
                                    padding: '6px 12px',
                                    fontSize: 12,
                                    background: deleting ? 'rgba(220,38,38,0.2)' : '#fff',
                                    color: '#dc2626',
                                    cursor: deleting ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  {deleting ? 'Deleting…' : 'Delete'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ color: palette.accentMuted }}>No documents uploaded yet.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {centerTab === 'share' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {selectedProject ? (
                <>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, color: palette.accentMuted }}>Project</p>
                    <h3 style={{ margin: '4px 0 0' }}>{selectedProject.name}</h3>
                  </div>
                  <div
                    style={{
                      borderRadius: 16,
                      border: `1px solid ${palette.border}`,
                      padding: 20,
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      boxShadow: shadows.subtle,
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: 13, color: palette.accentMuted }}>Project access token</p>
                      <div
                        style={{
                          marginTop: 8,
                          padding: '10px 14px',
                          borderRadius: 10,
                          background: '#f4f5fb',
                          fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: 13,
                          color: palette.text,
                          wordBreak: 'break-all',
                        }}
                      >
                        {selectedProjectToken || 'Not generated yet'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => copyProjectToken(selectedProjectToken)}
                        disabled={!selectedProjectToken}
                        style={{
                          borderRadius: 999,
                          border: `1px solid ${palette.accent}`,
                          background: selectedProjectToken ? '#ede9ff' : '#f4f4f5',
                          color: selectedProjectToken ? palette.accent : palette.accentMuted,
                          padding: '6px 14px',
                          fontSize: 13,
                          cursor: selectedProjectToken ? 'pointer' : 'not-allowed',
                          fontWeight: 600,
                        }}
                      >
                        Copy token
                      </button>
                      <button
                        type="button"
                        onClick={() => selectedProjectId && regenerateProjectToken(selectedProjectId)}
                        style={{
                          borderRadius: 999,
                          border: '1px solid rgba(248,113,113,0.4)',
                          background: '#fff4f4',
                          color: '#e11d48',
                          padding: '6px 14px',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        Regenerate token
                      </button>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: palette.accentMuted }}>
                      Share this token with trusted investors for read-only access. Rotating it immediately revokes older tokens.
                    </p>
                  </div>
                  <div
                    style={{
                      borderRadius: 16,
                      border: `1px solid ${palette.border}`,
                      padding: 20,
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      boxShadow: '0 15px 30px rgba(15,23,42,0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, color: palette.accentMuted }}>Investor link</p>
                        <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                          Anyone with this link can view the project dashboard in read-only mode.
                        </p>
                      </div>
                      {shareLink && (
                        <button
                          type="button"
                          onClick={() => copyProjectToken(shareLink)}
                          style={{
                            borderRadius: 999,
                            border: `1px solid ${palette.accent}`,
                            background: '#ede9ff',
                            color: palette.accent,
                            padding: '6px 12px',
                            fontSize: 12,
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Copy link
                        </button>
                      )}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: '#f4f5fb',
                        fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: 13,
                        color: palette.text,
                        wordBreak: 'break-all',
                      }}
                    >
                      {shareLink || 'Select a project with an access token.'}
                    </div>
                    {shareLink && (
                      <a
                        href={shareLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: palette.accent, fontSize: 13 }}
                      >
                        Open viewer ↗
                      </a>
                    )}
                  </div>
                  <div
                    style={{
                      borderRadius: 16,
                      border: `1px solid ${palette.border}`,
                      padding: 20,
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      boxShadow: '0 15px 30px rgba(15,23,42,0.08)',
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: 13, color: palette.accentMuted }}>API example</p>
                      <pre
                        style={{
                          marginTop: 8,
                          padding: 16,
                          borderRadius: 12,
                          background: '#f4f5fb',
                          fontSize: 13,
                          overflowX: 'auto',
                        }}
                      >{`curl -H "X-Access-Token: ${selectedProjectToken || '<token>'}" \\\n  ${baseApi}/api/projects/${selectedProjectId}/documents`}</pre>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: palette.accentMuted }}>
                      Investors can use the token to download documents or monitor signing status via the API. Admins should keep
                      their global token private; only share project tokens with stakeholders who should see this project.
                    </p>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    padding: 32,
                    border: '1px dashed rgba(148,163,184,0.4)',
                    borderRadius: 16,
                    textAlign: 'center',
                    color: palette.accentMuted,
                  }}
                >
                  Select a project to view and manage its project access token.
                </div>
              )}
            </div>
          )}
          {centerTab === 'investors' && (
            <div className="investor-panel" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <header>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>Investors</p>
                    <h3 style={{ margin: 0 }}>{investors.length} contacts</h3>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={exportInvestorsCsv}
                      disabled={!investors.length}
                      style={{
                        border: `1px solid ${palette.border}`,
                        background: investors.length ? '#fff' : '#f1f5f9',
                        color: investors.length ? palette.text : palette.accentMuted,
                        borderRadius: 999,
                        padding: '4px 12px',
                        fontSize: 12,
                        cursor: investors.length ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={toggleInvestorsManage}
                      disabled={!selectedProjectId}
                      data-testid="investor-manage-toggle"
                      style={{
                        border: `1px solid ${palette.border}`,
                        background: manageInvestorsMode ? palette.accent : '#fff',
                        color: !selectedProjectId ? palette.accentMuted : manageInvestorsMode ? '#fff' : palette.text,
                        borderRadius: 999,
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: selectedProjectId ? 'pointer' : 'not-allowed',
                        opacity: selectedProjectId ? 1 : 0.5,
                        boxShadow: manageInvestorsMode ? '0 8px 18px rgba(37,99,235,0.25)' : 'none',
                      }}
                    >
                      {manageInvestorsMode ? 'Done' : 'Manage'}
                    </button>
                    {manageInvestorsMode && selectedProjectId && (
                      <button
                        type="button"
                        onClick={deleteSelectedInvestors}
                        disabled={!selectedInvestorIds.length || deletingInvestors}
                        data-testid="investor-remove-button"
                        style={{
                          border: '1px solid #dc2626',
                          color: '#fff',
                          background: deletingInvestors ? 'rgba(220,38,38,0.6)' : '#dc2626',
                          borderRadius: 999,
                          padding: '6px 12px',
                          fontSize: 12,
                          cursor: !selectedInvestorIds.length || deletingInvestors ? 'not-allowed' : 'pointer',
                          opacity: !selectedInvestorIds.length && !deletingInvestors ? 0.5 : 1,
                        }}
                      >
                        {deletingInvestors ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: palette.accentMuted }}>
                  {selectedProjectId ? 'These investors are linked to this project.' : 'Select a project to manage investors.'}
                </p>
              </header>
              {!selectedProjectId ? (
                <p style={{ color: palette.accentMuted }}>Choose a project to manage investors.</p>
              ) : investors.length === 0 ? (
                <p style={{ color: palette.accentMuted }}>No investors linked.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {investors.map((investor) => {
                    const selected = selectedInvestorIds.includes(investor.id);
                    const editing = editingInvestorId === investor.id;
                    const hovered = hoveredInvestorId === investor.id;
                    const cardBorder = selected || editing || hovered ? palette.accent : palette.border;
                    return (
                      <div
                        key={investor.id}
                        style={{
                          borderRadius: 16,
                          border: `1px solid ${cardBorder}`,
                          padding: 16,
                          background: hovered || selected ? '#f5f2ff' : '#fff',
                          boxShadow: selected || hovered ? '0 12px 28px rgba(37,99,235,0.2)' : '0 4px 12px rgba(15,23,42,0.05)',
                          transition: 'background 0.15s ease, border 0.15s ease, box-shadow 0.15s ease',
                        }}
                        onMouseEnter={() => setHoveredInvestorId(investor.id)}
                        onMouseLeave={() => setHoveredInvestorId((prev) => (prev === investor.id ? null : prev))}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <strong style={{ display: 'block', fontSize: 15 }}>{investor.name}</strong>
                            <p style={{ margin: '4px 0', fontSize: 13, color: palette.accentMuted }}>{investor.email}</p>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                                gap: 8,
                                marginTop: 8,
                              }}
                            >
                              <div style={{ fontSize: 12, color: palette.accentMuted, lineHeight: 1.4 }}>
                                <strong style={{ display: 'block', color: palette.text }}>Investment</strong>
                                {typeof investor.units_invested === 'number'
                                  ? `${investor.units_invested.toLocaleString()} units`
                                  : '—'}
                              </div>
                              <div style={{ fontSize: 12, color: palette.accentMuted, lineHeight: 1.4 }}>
                                <strong style={{ display: 'block', color: palette.text }}>Mailing</strong>
                                {investor.mailing_address || '—'}
                              </div>
                              <div style={{ fontSize: 12, color: palette.accentMuted, lineHeight: 1.4 }}>
                                <strong style={{ display: 'block', color: palette.text }}>Bank</strong>
                                {investor.bank_name || '—'}
                              </div>
                              <div style={{ fontSize: 12, color: palette.accentMuted, lineHeight: 1.4 }}>
                                <strong style={{ display: 'block', color: palette.text }}>Account #</strong>
                                {investor.bank_account_number || '—'}
                              </div>
                              <div style={{ fontSize: 12, color: palette.accentMuted, lineHeight: 1.4 }}>
                                <strong style={{ display: 'block', color: palette.text }}>Routing #</strong>
                                {investor.bank_routing_number || '—'}
                              </div>
                            </div>
                          </div>
                          {manageInvestorsMode && (
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleInvestorSelection(investor.id)}
                              style={{ width: 18, height: 18 }}
                            />
                          )}
                        </div>
                        {editing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                            <input
                              type="text"
                              value={editingInvestorName}
                              onChange={(event) => setEditingInvestorName(event.target.value)}
                              style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}` }}
                            />
                            <input
                              type="email"
                              value={editingInvestorEmail}
                              onChange={(event) => setEditingInvestorEmail(event.target.value)}
                              style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}` }}
                            />
                            <input
                              type="number"
                              min="0"
                              value={editingInvestorUnits}
                              onChange={(event) => setEditingInvestorUnits(event.target.value)}
                              style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}` }}
                            />
                            <textarea
                              rows={3}
                              placeholder="Mailing address"
                              value={editingInvestorMailing}
                              onChange={(event) => setEditingInvestorMailing(event.target.value)}
                              style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}`, resize: 'vertical' }}
                            />
                            <input
                              type="text"
                              placeholder="Bank name"
                              value={editingInvestorBankName}
                              onChange={(event) => setEditingInvestorBankName(event.target.value)}
                              style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}` }}
                            />
                            <input
                              type="text"
                              placeholder="Account number"
                              value={editingInvestorBankAccount}
                              onChange={(event) => setEditingInvestorBankAccount(event.target.value)}
                              style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}` }}
                            />
                            <input
                              type="text"
                              placeholder="Routing number"
                              value={editingInvestorBankRouting}
                              onChange={(event) => setEditingInvestorBankRouting(event.target.value)}
                              style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}` }}
                            />
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button type="button" onClick={cancelInvestorEdit} style={{ border: 'none', background: 'transparent', color: palette.accentMuted, cursor: 'pointer' }}>
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={saveInvestorEdit}
                                disabled={editingInvestorSaving}
                                style={{
                                  border: 'none',
                                  background: palette.accent,
                                  color: '#fff',
                                  borderRadius: 999,
                                  padding: '6px 14px',
                                  cursor: editingInvestorSaving ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {editingInvestorSaving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button
                              type="button"
                              onClick={() => beginInvestorEdit(investor)}
                              style={{
                                border: `1px solid ${palette.border}`,
                                borderRadius: 999,
                                padding: '4px 10px',
                                fontSize: 12,
                                background: '#fff',
                                color: palette.text,
                                cursor: 'pointer',
                              }}
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {manageInvestorsMode && selectedProjectId && (
                <div style={{ borderTop: `1px solid ${palette.border}`, marginTop: 8, paddingTop: 12 }}>
                  {!showInvestorForm ? (
                    <button
                      type="button"
                      onClick={() => setShowInvestorForm(true)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: palette.accent,
                        textAlign: 'left',
                        padding: 0,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      + Add investor
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input
                        type="text"
                        placeholder="Name"
                        value={newInvestorName}
                        onChange={(event) => setNewInvestorName(event.target.value)}
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          border: `1px solid ${palette.border}`,
                        }}
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={newInvestorEmail}
                        onChange={(event) => setNewInvestorEmail(event.target.value)}
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          border: `1px solid ${palette.border}`,
                        }}
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Units (e.g. 10000)"
                        value={newInvestorUnits}
                        onChange={(event) => setNewInvestorUnits(event.target.value)}
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          border: `1px solid ${palette.border}`,
                        }}
                      />
                      <textarea
                        rows={3}
                        placeholder="Mailing address"
                        value={newInvestorMailing}
                        onChange={(event) => setNewInvestorMailing(event.target.value)}
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          border: `1px solid ${palette.border}`,
                          resize: 'vertical',
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Bank name"
                        value={newInvestorBankName}
                        onChange={(event) => setNewInvestorBankName(event.target.value)}
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          border: `1px solid ${palette.border}`,
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Bank account number"
                        value={newInvestorBankAccount}
                        onChange={(event) => setNewInvestorBankAccount(event.target.value)}
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          border: `1px solid ${palette.border}`,
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Routing number"
                        value={newInvestorBankRouting}
                        onChange={(event) => setNewInvestorBankRouting(event.target.value)}
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          border: `1px solid ${palette.border}`,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={createInvestor}
                          disabled={creatingInvestor}
                          style={{
                            flex: 1,
                            border: 'none',
                            borderRadius: 999,
                            padding: '10px 14px',
                            background: creatingInvestor ? 'rgba(37,99,235,0.3)' : palette.accent,
                            color: '#fff',
                            fontWeight: 600,
                            cursor: creatingInvestor ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {creatingInvestor ? 'Adding…' : 'Add'}
                        </button>
                        <button
                          type="button"
                          onClick={resetInvestorForm}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: palette.accentMuted,
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
      <style jsx>{`
        .project-scroll {
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow-y: auto;
          max-height: calc(100vh - 220px);
        }
        .admin-mobile-header {
          display: none;
        }
        .drawer-mobile-close {
          display: none;
        }
        .admin-layout.mobile {
          flex-direction: column;
          position: relative;
        }
        .admin-layout.mobile .admin-main {
          padding: 16px !important;
        }
        .admin-layout.mobile .admin-mobile-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid ${palette.border};
          background: #fff;
          position: sticky;
          top: 0;
          z-index: 15;
        }
        .admin-mobile-header button {
          border: none;
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 600;
          background: ${palette.accent};
          color: #fff;
          cursor: pointer;
        }
        .admin-mobile-header .admin-mobile-heading p {
          margin: 0;
          font-size: 11px;
          color: ${palette.accentMuted};
        }
        .admin-mobile-header .admin-mobile-heading strong {
          font-size: 14px;
          color: ${palette.text};
        }
        .admin-layout.mobile .admin-sidebar {
          position: fixed;
          top: 0;
          left: 0;
          height: 100%;
          width: min(320px, 85vw);
          transform: translateX(-100%);
          transition: transform 0.3s ease;
          z-index: 40;
          box-shadow: 0 30px 60px rgba(15, 23, 42, 0.35);
          background: #fff;
        }
        .admin-layout.mobile .project-scroll {
          max-height: calc(100vh - 220px);
        }
        .admin-layout.mobile.show-projects .admin-sidebar {
          transform: translateX(0);
        }
        .admin-layout.mobile:not(.show-projects) .admin-sidebar {
          pointer-events: none;
        }
        .admin-layout.mobile .drawer-mobile-close {
          display: flex;
          justify-content: flex-end;
          margin-top: 4px;
        }
        .drawer-mobile-close button {
          border: none;
          background: transparent;
          color: ${palette.accent};
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );

}
