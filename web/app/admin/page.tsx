'use client';

import { useCallback, useEffect, useMemo, useState, FormEvent, CSSProperties, KeyboardEvent } from 'react';
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
};

const palette = {
  bg: theme.colors.page,
  panel: theme.colors.panel,
  accent: theme.colors.accent,
  accentMuted: theme.colors.textMuted,
  text: theme.colors.text,
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
  background: '#dcfce7',
  color: '#166534',
  padding: '2px 8px',
  fontSize: 12,
  fontWeight: 600,
};
const awaitingChipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  background: '#fffbeb',
  color: '#92400e',
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
      : '#2563eb'
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
  const [creatingInvestor, setCreatingInvestor] = useState(false);
  const [hoveredInvestorId, setHoveredInvestorId] = useState<number | null>(null);
  const [editingInvestorId, setEditingInvestorId] = useState<number | null>(null);
  const [editingInvestorName, setEditingInvestorName] = useState('');
  const [editingInvestorEmail, setEditingInvestorEmail] = useState('');
  const [editingInvestorUnits, setEditingInvestorUnits] = useState<string>('');
  const [editingInvestorSaving, setEditingInvestorSaving] = useState(false);
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
  const [centerTab, setCenterTab] = useState<'documents' | 'share'>('documents');
  const [deletingInvestors, setDeletingInvestors] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [investorDrawerOpen, setInvestorDrawerOpen] = useState(false);
  const [requestButtonHovered, setRequestButtonHovered] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectDetailsLoaded, setProjectDetailsLoaded] = useState(false);
  const [initialPageReady, setInitialPageReady] = useState(false);
  const closeDrawers = () => {
    setProjectDrawerOpen(false);
    setInvestorDrawerOpen(false);
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
    setEditingInvestorSaving(false);
    setHoveredInvestorId(null);
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
  const hasSignedDocuments = finals.length > 0;
  const hasOutstandingEnvelopes = outstandingEnvelopes.length > 0;
  const documentEntries = useMemo(
    () => [
      ...outstandingEnvelopes.map((env) => ({ kind: 'awaiting' as const, env })),
      ...finals.map((finalItem) => ({ kind: 'signed' as const, final: finalItem })),
    ],
    [outstandingEnvelopes, finals],
  );
  const hasDocuments = documentEntries.length > 0;
  const canRequestSignatures = Boolean(selectedProjectId && hasInvestors);
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
    if (!hasDocuments && manageDocumentsMode) {
      setManageDocumentsMode(false);
      setManageSignedMode(false);
      setManageEnvelopesMode(false);
      setSelectedFinalIds([]);
      setSelectedEnvelopeIds([]);
      setRevokingEnvelopes(false);
    }
  }, [hasDocuments, manageDocumentsMode]);

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
  };

  const cancelInvestorEdit = () => {
    setEditingInvestorId(null);
    setEditingInvestorName('');
    setEditingInvestorEmail('');
    setEditingInvestorUnits('');
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
    const payload: Record<string, unknown> = { name, email };
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
              background: verifyingLocally ? 'rgba(108,92,231,0.6)' : palette.accent,
              color: '#fff',
              fontWeight: 600,
              cursor: verifyingLocally ? 'wait' : 'pointer',
              boxShadow: '0 12px 25px rgba(108,92,231,0.35)',
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
              boxShadow: manageProjectsMode ? '0 8px 18px rgba(108,92,231,0.25)' : 'none',
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
            ? 'linear-gradient(135deg,#6c5ce7,#7f6bff)'
            : hovered || isEditing
            ? '#f5f2ff'
            : '#fff';
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
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 14,
                border: `1px solid ${active || hovered || isEditing ? palette.accent : palette.border}`,
                background: baseBackground,
                color: active ? '#fff' : palette.text,
                cursor: isEditing ? 'default' : 'pointer',
                fontWeight: active ? 600 : 500,
                boxShadow: active
                  ? '0 12px 24px rgba(108,92,231,0.25)'
                  : hovered || isEditing
                  ? '0 8px 18px rgba(15,23,42,0.12)'
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
                            : '0 8px 18px rgba(108,92,231,0.25)',
                      }}
                    >
                      {editingProjectSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {manageProjectsMode && (
                      <input
                        type="checkbox"
                        checked={selectedProjectIds.includes(project.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleProjectSelection(project.id)}
                      />
                    )}
                    <div>
                      <strong>{project.name}</strong>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          color: active ? 'rgba(255,255,255,0.8)' : palette.accentMuted,
                        }}
                      >
                        #{project.id}
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
                        padding: '4px 10px',
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
                      background: creatingProject ? 'rgba(108,92,231,0.3)' : palette.accent,
                      color: '#fff',
                      fontWeight: 600,
                      cursor: creatingProject ? 'not-allowed' : 'pointer',
                      boxShadow: creatingProject ? 'none' : '0 12px 24px rgba(108,92,231,0.25)',
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
      <button
        type="button"
        onClick={logout}
        style={{
          marginTop: 8,
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
    </>
  );

  const layoutClasses = ['admin-layout'];
  if (isMobile) layoutClasses.push('mobile');
  if (isMobile && projectDrawerOpen) layoutClasses.push('show-projects');
  if (isMobile && investorDrawerOpen) layoutClasses.push('show-investors');
  const layoutClassName = layoutClasses.join(' ');
  const drawerActive = isMobile && (projectDrawerOpen || investorDrawerOpen);

  return (
    <div className={layoutClassName} style={{ minHeight: '100vh', display: 'flex', background: palette.bg, color: palette.text }}>
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
              setInvestorDrawerOpen(false);
            }}
          >
            Projects
          </button>
          <div className="admin-mobile-heading">
            <p>Project</p>
            <strong>{selectedProject?.name || 'Select a project'}</strong>
          </div>
          <button
            type="button"
            onClick={() => {
              setInvestorDrawerOpen(true);
              setProjectDrawerOpen(false);
            }}
            disabled={!selectedProjectId}
          >
            Investors
          </button>
        </div>
      )}
      <aside
        className="admin-sidebar"
        style={{
          width: 260,
          padding: 24,
          borderRight: `1px solid ${palette.border}`,
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 10px 30px rgba(17, 24, 39, 0.05)',
        }}
      >
        {projectSidebarContent}
      
      </aside>
      <main className="admin-main" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, padding: 32 }}>
        <section
          style={{
            borderRadius: 24,
            background: palette.panel,
            padding: 24,
            boxShadow: '0 20px 40px rgba(15,23,42,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>Project</p>
              <h3 style={{ margin: 0 }}>{selectedProject?.name || 'Select a project'}</h3>
            </div>
            {loading && <span style={{ fontSize: 12 }}>Loading…</span>}
          </header>
          {error && <div style={{ color: '#fca5a5' }}>{error}</div>}
          <div
            style={{
              display: 'flex',
              gap: 18,
              borderBottom: '1px solid rgba(148,163,184,0.35)',
              paddingBottom: 4,
            }}
          >
            {(
              [
                { id: 'documents', label: 'Documents', icon: '📄' },
                { id: 'share', label: 'Share', icon: '🔐' },
              ] as Array<{ id: 'documents' | 'share'; label: string; icon: string }>
            ).map((tab) => {
              const active = centerTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCenterTab(tab.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: active ? palette.accent : palette.textStrong,
                    opacity: active ? 1 : 0.7,
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    padding: '6px 0',
                    borderBottom: active ? `3px solid ${palette.accent}` : '3px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  {tab.label}
                </button>
              );
            })}
          </div>
          {centerTab === 'documents' && selectedProject && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: isMobile ? 'stretch' : 'center',
                  justifyContent: 'flex-start',
                  gap: 12,
                  marginTop: 12,
                }}
              >
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
                    data-testid="documents-manage-toggle"
                    disabled={!hasDocuments}
                    style={{
                      border: `1px solid ${palette.border}`,
                      background: manageDocumentsMode ? palette.accent : '#fff',
                      color: manageDocumentsMode ? '#fff' : palette.text,
                      borderRadius: 999,
                      padding: '4px 12px',
                      fontSize: 12,
                      cursor: hasDocuments ? 'pointer' : 'not-allowed',
                      opacity: hasDocuments ? 1 : 0.5,
                      boxShadow: manageDocumentsMode ? '0 8px 18px rgba(108,92,231,0.25)' : 'none',
                    }}
                  >
                    {manageDocumentsMode ? 'Done' : 'Manage'}
                  </button>
                  {manageDocumentsMode && (
                    <button
                      type="button"
                      onClick={deleteSelectedDocuments}
                      data-testid="documents-delete-selected"
                      disabled={
                        !hasDocuments ||
                        (!selectedFinalIds.length && !selectedEnvelopeIds.length) ||
                        actionLoading ||
                        revokingEnvelopes
                      }
                      style={{
                        border: '1px solid rgba(248,113,113,0.8)',
                        color: '#fca5a5',
                        background: 'transparent',
                        borderRadius: 999,
                        padding: '6px 12px',
                        fontSize: 13,
                        cursor:
                          !hasDocuments ||
                          (!selectedFinalIds.length && !selectedEnvelopeIds.length) ||
                          actionLoading ||
                          revokingEnvelopes
                            ? 'not-allowed'
                            : 'pointer',
                        opacity:
                          !hasDocuments ||
                          (!selectedFinalIds.length && !selectedEnvelopeIds.length) ||
                          actionLoading ||
                          revokingEnvelopes
                            ? 0.5
                            : 1,
                      }}
                    >
                      {actionLoading || revokingEnvelopes ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>

              {hasDocuments && (
                <div data-testid="documents-list-section" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                                ? '0 12px 28px rgba(108,92,231,0.25)'
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
                              ? '0 12px 28px rgba(108,92,231,0.25)'
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
              {!hasDocuments && (
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
          {centerTab === 'documents' && !selectedProject && (
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
                      boxShadow: '0 15px 30px rgba(15,23,42,0.08)',
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
        </section>
        <section
          className="investor-panel"
          style={{
            borderRadius: 24,
            background: palette.panel,
            padding: 24,
            boxShadow: '0 20px 40px rgba(15,23,42,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minWidth: 320,
          }}
        >
          <header>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>Investors</p>
              <h3 style={{ margin: 0 }}>{investors.length} contacts</h3>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
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
                  boxShadow: manageInvestorsMode ? '0 8px 18px rgba(108,92,231,0.25)' : 'none',
                }}
                title={selectedProjectId ? undefined : 'Select a project first'}
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
          </header>
          {isMobile && (
            <div className="drawer-mobile-close">
              <button type="button" onClick={() => setInvestorDrawerOpen(false)}>
                Close ✕
              </button>
            </div>
          )}
          <div style={{ overflowY: 'auto', maxHeight: '70vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {investors.length === 0 && <p style={{ color: palette.accentMuted }}>No investors linked.</p>}
            {investors.map((investor, idx) => {
              const invId = investor.id ?? idx;
              const selected = manageInvestorsMode && investor.id ? selectedInvestorIds.includes(investor.id) : false;
              const hovered = hoveredInvestorId === invId;
              const editing = Boolean(investor.id && editingInvestorId === investor.id);
              const cardBackground = selected
                ? '#eef2ff'
                : editing
                ? '#f5f3ff'
                : hovered
                ? '#f8fafc'
                : '#fff';
              const cardBorder = selected || editing ? palette.accent : palette.border;
              const boxShadow = selected || hovered || editing ? '0 8px 18px rgba(15,23,42,0.12)' : '0 4px 10px rgba(15,23,42,0.05)';
              const unitsLabel =
                typeof investor.units_invested === 'number'
                  ? `${investor.units_invested.toLocaleString()} units`
                  : 'Units n/a';
              return (
                <div
                  key={`investor-${invId}`}
                  onMouseEnter={() => setHoveredInvestorId(invId)}
                  onMouseLeave={() => setHoveredInvestorId((prev) => (prev === invId ? null : prev))}
                  style={{
                    borderRadius: 12,
                    background: cardBackground,
                    border: `1px solid ${cardBorder}`,
                    padding: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: editing ? 'stretch' : 'center',
                    gap: 12,
                    boxShadow,
                    transition: 'background 0.15s ease, border 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  {editing ? (
                    <>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                          type="text"
                          value={editingInvestorName}
                          onChange={(event) => setEditingInvestorName(event.target.value)}
                          placeholder="Investor name"
                          style={{
                            padding: 8,
                            borderRadius: 8,
                            border: `1px solid ${palette.border}`,
                          }}
                        />
                        <input
                          type="email"
                          value={editingInvestorEmail}
                          onChange={(event) => setEditingInvestorEmail(event.target.value)}
                          placeholder="Investor email"
                          style={{
                            padding: 8,
                            borderRadius: 8,
                            border: `1px solid ${palette.border}`,
                          }}
                        />
                        <input
                          type="number"
                          min="0"
                          value={editingInvestorUnits}
                          onChange={(event) => setEditingInvestorUnits(event.target.value)}
                          placeholder="Units invested"
                          style={{
                            padding: 8,
                            borderRadius: 8,
                            border: `1px solid ${palette.border}`,
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                          type="button"
                          onClick={cancelInvestorEdit}
                          disabled={editingInvestorSaving}
                          style={{
                            border: `1px solid ${palette.border}`,
                            background: '#fff',
                            color: palette.text,
                            borderRadius: 999,
                            padding: '6px 14px',
                            fontSize: 12,
                            cursor: editingInvestorSaving ? 'not-allowed' : 'pointer',
                          }}
                        >
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
                            fontSize: 12,
                            cursor: editingInvestorSaving ? 'not-allowed' : 'pointer',
                            boxShadow: editingInvestorSaving ? 'none' : '0 8px 18px rgba(108,92,231,0.25)',
                          }}
                        >
                          {editingInvestorSaving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {manageInvestorsMode && investor.id && (
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleInvestorSelection(investor.id!)}
                          />
                        )}
                        <div>
                          <strong>{investor.name}</strong>
                          <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>{investor.email}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <span style={{ fontSize: 12, color: palette.accentMuted }}>{unitsLabel}</span>
                        {!manageInvestorsMode && investor.id && (
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
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {manageInvestorsMode && selectedProjectId && (
            <div style={{ borderTop: `1px solid ${palette.border}`, marginTop: 12, paddingTop: 12 }}>
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
                        background: creatingInvestor ? 'rgba(108,92,231,0.3)' : palette.accent,
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
        </section>
      </main>
      {drawerActive && <div className="drawer-overlay" onClick={closeDrawers} />}
      <style jsx>{`
        .admin-layout {
          gap: 0;
        }
        .admin-main-grid {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 24px;
        }
        .project-scroll {
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow-y: auto;
          max-height: calc(100vh - 220px);
        }
        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          z-index: 30;
        }
        .admin-mobile-header {
          display: none;
        }
        .drawer-mobile-close {
          display: none;
        }
        @media (max-width: 1200px) {
          .admin-main-grid {
            grid-template-columns: 1fr;
          }
        }
        .admin-layout.mobile {
          flex-direction: column;
          position: relative;
        }
        .admin-layout.mobile .admin-main {
          display: block !important;
          padding: 16px !important;
        }
        .admin-layout.mobile .admin-main > section {
          margin-bottom: 24px;
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
        .admin-mobile-header button:disabled {
          background: rgba(148, 163, 184, 0.4);
          color: rgba(255, 255, 255, 0.7);
          cursor: not-allowed;
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
        .admin-layout.mobile .investor-panel {
          display: block;
          position: fixed;
          top: 0;
          right: 0;
          height: 100%;
          width: min(360px, 85vw);
          transform: translateX(100%);
          transition: transform 0.3s ease;
          z-index: 40;
          box-shadow: 0 30px 60px rgba(15, 23, 42, 0.35);
          background: ${palette.panel};
        }
        .admin-layout.mobile.show-investors .investor-panel {
          transform: translateX(0);
        }
        .admin-layout.mobile:not(.show-investors) .investor-panel {
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
