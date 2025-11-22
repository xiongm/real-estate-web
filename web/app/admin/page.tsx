'use client';

import { useCallback, useEffect, useMemo, useRef, useState, FormEvent, CSSProperties, KeyboardEvent, ChangeEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { theme } from '../../lib/theme';

type Project = {
  id: number;
  name: string;
  status: string;
  access_token?: string | null;
  address?: string | null;
  description?: string | null;
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
const primaryButtonStyle = (enabled: boolean): CSSProperties => ({
  border: 'none',
  borderRadius: 999,
  padding: '8px 18px',
  background: enabled ? palette.accent : '#e2e8f0',
  color: enabled ? '#fff' : palette.accentMuted,
  cursor: enabled ? 'pointer' : 'not-allowed',
  fontSize: 14,
  fontWeight: 600,
  boxShadow: enabled ? shadows.subtle : 'none',
  transition: 'background 0.2s ease, box-shadow 0.2s ease',
});
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
const addressCache = useRef<Map<string, string[]>>(new Map());
  const [heroEditingField, setHeroEditingField] = useState<'name' | 'address' | 'description' | null>(null);
  const [heroEditingValue, setHeroEditingValue] = useState('');
  const [heroEditingSaving, setHeroEditingSaving] = useState(false);
  const heroInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [heroAddressSuggestions, setHeroAddressSuggestions] = useState<string[]>([]);
  const heroAddressTimeout = useRef<NodeJS.Timeout | null>(null);
  const [heroAddressLoading, setHeroAddressLoading] = useState(false);
  const heroBlurTimeout = useRef<NodeJS.Timeout | null>(null);
  const [heroMenuOpen, setHeroMenuOpen] = useState(false);
  const heroMenuRef = useRef<HTMLDivElement | null>(null);
  const heroMenuButtonRef = useRef<HTMLButtonElement | null>(null);
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
  const clearHeroAddressTimeout = () => {
    if (heroAddressTimeout.current) {
      clearTimeout(heroAddressTimeout.current);
      heroAddressTimeout.current = null;
    }
  };
  const clearHeroBlurTimeout = () => {
    if (heroBlurTimeout.current) {
      clearTimeout(heroBlurTimeout.current);
      heroBlurTimeout.current = null;
    }
  };
  const cancelHeroEdit = useCallback(() => {
    clearHeroAddressTimeout();
    clearHeroBlurTimeout();
    setHeroEditingField(null);
    setHeroEditingValue('');
    setHeroAddressSuggestions([]);
    setHeroAddressLoading(false);
    setHeroEditingSaving(false);
  }, []);
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
  useEffect(() => {
    return () => {
      clearHeroAddressTimeout();
      clearHeroBlurTimeout();
    };
  }, []);
  useEffect(() => {
    clearHeroAddressTimeout();
    if (heroEditingField !== 'address') {
      setHeroAddressSuggestions([]);
      setHeroAddressLoading(false);
      return;
    }
    const trimmed = heroEditingValue.trim();
    if (!adminVerified || !adminToken || trimmed.length < 3) {
      setHeroAddressSuggestions([]);
      setHeroAddressLoading(false);
      return;
    }
    const cached = addressCache.current.get(trimmed.toLowerCase());
    if (cached) {
      setHeroAddressSuggestions(cached);
      setHeroAddressLoading(false);
      return;
    }
    const controller = new AbortController();
    heroAddressTimeout.current = setTimeout(async () => {
      setHeroAddressLoading(true);
      try {
        const resp = await fetch(
          `${baseApi}/api/places/mapbox/autocomplete?query=${encodeURIComponent(trimmed)}`,
          {
            headers: { 'X-Access-Token': adminToken },
            signal: controller.signal,
          },
        );
        if (!resp.ok) throw new Error('Failed to fetch address suggestions');
        const data = await resp.json();
        const suggestions =
          Array.isArray(data?.suggestions)
            ? data.suggestions
                .map((item: { label?: string }) => item?.label)
                .filter((label: string | undefined): label is string => Boolean(label))
            : [];
        addressCache.current.set(trimmed.toLowerCase(), suggestions);
        setHeroAddressSuggestions(suggestions);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setHeroAddressSuggestions([]);
      } finally {
        setHeroAddressLoading(false);
      }
    }, 120);
    return () => {
      clearHeroAddressTimeout();
      controller.abort();
    };
  }, [heroEditingField, heroEditingValue, adminToken, adminVerified, baseApi]);
  useEffect(() => {
    if (heroEditingField && heroInputRef.current) {
      heroInputRef.current.focus();
      requestAnimationFrame(() => {
        heroInputRef.current?.select();
      });
    }
  }, [heroEditingField]);
  useEffect(() => {
    cancelHeroEdit();
  }, [selectedProjectId, cancelHeroEdit]);
  useEffect(() => {
    if (!heroMenuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHeroMenuOpen(false);
      }
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (heroMenuRef.current?.contains(target)) return;
      if (heroMenuButtonRef.current?.contains(target)) return;
      setHeroMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [heroMenuOpen]);
  useEffect(() => {
    setHeroMenuOpen(false);
  }, [selectedProjectId]);
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
  const getHeroFieldValue = useCallback(
    (field: 'name' | 'address' | 'description') => {
      if (!selectedProject) return '';
      if (field === 'name') return selectedProject.name ?? '';
      if (field === 'address') return selectedProject.address ?? '';
      return selectedProject.description ?? '';
    },
    [selectedProject],
  );
  const beginHeroEdit = useCallback(
    (field: 'name' | 'address' | 'description') => {
      if (!selectedProject || !selectedProjectId) return;
      setHeroEditingField(field);
      setHeroEditingValue(getHeroFieldValue(field));
    },
    [selectedProject, selectedProjectId, getHeroFieldValue],
  );
  const submitHeroEdit = useCallback(
    async (overrideValue?: string) => {
      if (!heroEditingField) return;
      if (!selectedProjectId || !adminToken) {
        cancelHeroEdit();
        return;
      }
      const effectiveValue = typeof overrideValue === 'string' ? overrideValue : heroEditingValue;
      const normalizedValue = heroEditingField === 'description' ? effectiveValue : effectiveValue.trim();
      if (heroEditingField === 'name' && !normalizedValue) {
        setError('Project name is required.');
        return;
      }
      if (normalizedValue === getHeroFieldValue(heroEditingField)) {
        cancelHeroEdit();
        return;
      }
      setHeroEditingSaving(true);
      try {
        const resp = await fetch(`${baseApi}/api/projects/${selectedProjectId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Access-Token': adminToken,
          },
          body: JSON.stringify({ [heroEditingField]: normalizedValue }),
        });
        if (!resp.ok) throw new Error('Failed to update project');
        const updated = await resp.json();
        setProjects((prev) => prev.map((proj) => (proj.id === updated.id ? { ...proj, ...updated } : proj)));
        cancelHeroEdit();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update project');
      } finally {
        setHeroEditingSaving(false);
      }
    },
    [
      heroEditingField,
      heroEditingValue,
      selectedProjectId,
      adminToken,
      getHeroFieldValue,
      cancelHeroEdit,
      baseApi,
    ],
  );
  const handleHeroKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelHeroEdit();
      return;
    }
    if (
      event.key === 'Tab' &&
      !event.shiftKey &&
      heroEditingField === 'address' &&
      heroAddressSuggestions.length > 0
    ) {
      event.preventDefault();
      const suggestion = heroAddressSuggestions[0];
      setHeroEditingValue(suggestion);
      submitHeroEdit(suggestion);
      return;
    }
    if (event.key === 'Enter') {
      if (heroEditingField === 'description' && !event.metaKey && !event.ctrlKey) {
        return;
      }
      event.preventDefault();
      submitHeroEdit();
    }
  };
  const handleHeroBlur = () => {
    clearHeroBlurTimeout();
    heroBlurTimeout.current = setTimeout(() => {
      submitHeroEdit();
    }, 80);
  };
  const heroDisplayValue = useCallback(
    (field: 'name' | 'address' | 'description') => getHeroFieldValue(field),
    [getHeroFieldValue],
  );
  const heroNameDisplayId = selectedProject ? `hero-name-display-${selectedProject.id}` : 'hero-name-display';
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
        iconBg: '#dbeafe',
        iconColor: '#1d4ed8',
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
        iconBg: '#f3e8ff',
        iconColor: '#7e22ce',
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
        iconBg: '#ecfccb',
        iconColor: '#65a30d',
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
        iconBg: '#fee2e2',
        iconColor: '#dc2626',
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

  const toggleFinalExpansion = (id: number) => {
    setExpandedFinals((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleEnvelopeExpansion = (id: number) => {
    setExpandedEnvelopes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCardDownload = async (href?: string) => {
    if (!href) return;
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = href.split('/').pop() || 'document.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Download failed');
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
      const params = new URLSearchParams();
      params.set('name', name);
      const resp = await fetch(`${baseApi}/api/projects?${params.toString()}`, {
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

  const removeProjectLocally = (projectId: number) => {
    setProjects((prev) => prev.filter((proj) => proj.id !== projectId));
    if (selectedProjectId === projectId) {
      selectProject(null);
    }
  };

  const performProjectDelete = async (projectId: number) => {
    const resp = await fetch(`${baseApi}/api/projects/${projectId}`, {
      method: 'DELETE',
      headers: { 'X-Access-Token': adminToken ?? '' },
    });
    if (!resp.ok) throw new Error(`Failed to delete project (${resp.status})`);
    removeProjectLocally(projectId);
  };

  const deleteProjectDirect = async (projectId: number) => {
    const confirmRemove = window.confirm(
      'Deleting this project removes all documents, investors, envelopes, and signed packets. This cannot be undone. Continue?',
    );
    if (!confirmRemove) return;
    setActionLoading(true);
    try {
      await performProjectDelete(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setActionLoading(false);
    }
  };
  const handleHeroDeleteProject = () => {
    if (!selectedProjectId) return;
    setHeroMenuOpen(false);
    deleteProjectDirect(selectedProjectId);
  };
  const handleHeroLogout = () => {
    setHeroMenuOpen(false);
    logout();
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

  const copyMagicLink = async (link?: string | null) => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      alert('Magic link copied to clipboard.');
    } catch {
      alert('Unable to copy magic link automatically.');
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
      <div style={{ padding: 24, borderBottom: `1px solid ${palette.border}` }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: palette.text }}>Projects</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: palette.accentMuted }}>
            {projects.length ? `${projects.length} active project${projects.length > 1 ? 's' : ''}` : 'No projects yet'}
          </p>
        </div>
        {isMobile && (
          <div className="drawer-mobile-close">
            <button type="button" onClick={() => setProjectDrawerOpen(false)}>
              Close ✕
            </button>
          </div>
        )}
      </div>
      <div className="project-scroll" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {projects.map((project, idx) => {
          const active = project.id === selectedProjectId;
          const hovered = hoveredProjectId === project.id;
          const statusLabel = project.status ? project.status.replace(/-/g, ' ') : 'active';
          const statusDot =
            project.status === 'active'
              ? '#22c55e'
              : project.status === 'funding'
              ? '#f97316'
              : project.status === 'completed'
              ? '#94a3b8'
              : '#a5b4fc';
          const investorsLabel =
            selectedProjectId === project.id ? `${investors.length} investor${investors.length === 1 ? '' : 's'}` : 'Investors';
          const badgeLabel =
            selectedProjectId === project.id
              ? hasOutstandingEnvelopes
                ? 'Pending docs'
                : 'All signed'
              : statusLabel;
          return (
            <div
              key={`project-${project.id ?? idx}`}
              role="button"
              tabIndex={0}
              onClick={() => selectProject(project.id)}
              onKeyDown={(event) => handleProjectKeyDown(event, project.id)}
              onMouseEnter={() => setHoveredProjectId(project.id)}
              onMouseLeave={() => setHoveredProjectId((prev) => (prev === project.id ? null : prev))}
              style={{
                border: `2px solid ${active ? '#3b82f6' : hovered ? '#c7d2fe' : palette.border}`,
                borderRadius: 20,
                padding: 20,
                background: active ? '#eff6ff' : '#fff',
                boxShadow: active
                  ? '0 25px 45px rgba(59,130,246,0.25)'
                  : hovered
                  ? '0 20px 38px rgba(15,23,42,0.1)'
                  : '0 6px 18px rgba(15,23,42,0.05)',
                cursor: 'pointer',
                transition: 'border 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 16,
                      background: active ? '#dbeafe' : '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#1f2937',
                    }}
                  >
                    <svg
                      aria-hidden="true"
                      width={20}
                      height={20}
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      fill="none"
                    >
                      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                      <path d="M10 6h4" />
                      <path d="M10 10h4" />
                      <path d="M10 14h4" />
                      <path d="M10 18h4" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>{project.name || `Project ${idx + 1}`}</p>
                    <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted, textTransform: 'capitalize' }}>
                      {statusLabel}
                    </p>
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: statusDot,
                    alignSelf: 'flex-start',
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
                <span style={{ fontSize: 13, color: palette.accentMuted }}>{investorsLabel}</span>
                <span
                  style={{
                    borderRadius: 999,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    background: active ? '#fef3c7' : '#f1f5f9',
                    color: active ? '#92400e' : '#475569',
                  }}
                >
                  {badgeLabel}
                </span>
              </div>
            </div>
          );
        })}
        {!projects.length && (
          <div
            style={{
              padding: 24,
              borderRadius: 16,
              border: `1px dashed ${palette.border}`,
              textAlign: 'center',
              color: palette.accentMuted,
              background: '#f8fafc',
            }}
          >
            No projects yet.
          </div>
        )}
      </div>
      <div
        style={{
          padding: 20,
          borderTop: `1px solid ${palette.border}`,
          marginTop: 'auto',
        }}
      >
        {!showProjectForm ? (
          <button
            type="button"
            onClick={() => {
              setShowProjectForm(true);
              setNewProjectName('');
            }}
            style={{
              width: '100%',
              borderRadius: 12,
              border: `1px solid ${palette.border}`,
              padding: '10px 14px',
              background: '#fff',
              color: palette.text,
              fontWeight: 600,
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = palette.accentSoft;
              event.currentTarget.style.color = palette.accent;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = '#fff';
              event.currentTarget.style.color = palette.text;
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            New Project
          </button>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createProject();
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: '#fff',
              borderRadius: 16,
              padding: 16,
              border: `1px solid ${palette.border}`,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Project name</label>
              <input
                type="text"
                autoFocus
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="e.g. Houston Tower"
                style={{ padding: 10, borderRadius: 10, border: `1px solid ${palette.border}` }}
                disabled={creatingProject}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setShowProjectForm(false);
                  setNewProjectName('');
                }}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  border: `1px solid ${palette.border}`,
                  padding: '10px 14px',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingProject}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  border: 'none',
                  padding: '10px 14px',
                  background: creatingProject ? 'rgba(37,99,235,0.35)' : palette.accent,
                  color: '#fff',
                  fontWeight: 600,
                  cursor: creatingProject ? 'not-allowed' : 'pointer',
                }}
              >
                {creatingProject ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );

  const layoutClasses = ['admin-layout'];
  if (isMobile) layoutClasses.push('mobile');
  if (isMobile && projectDrawerOpen) layoutClasses.push('show-projects');
  const layoutClassName = layoutClasses.join(' ');
  const heroSection = (
    <section
      style={{
        position: 'relative',
        width: '100%',
        minHeight: isMobile ? 176 : 272,
        backgroundColor: '#0f172a',
        color: '#fff',
        overflow: 'visible',
        margin: 0,
        padding: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(130deg,rgba(2,6,23,0.65),rgba(2,6,23,0.15)), url(https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: selectedProject ? 0.85 : 0.45,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: isMobile ? 16 : 24,
          right: isMobile ? 16 : 32,
          zIndex: 4,
        }}
      >
        <button
          ref={(node) => {
            heroMenuButtonRef.current = node;
          }}
          type="button"
          onClick={() => setHeroMenuOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={heroMenuOpen}
          style={{
            border: 'none',
            borderRadius: 999,
            width: isMobile ? 38 : 44,
            height: isMobile ? 38 : 44,
            background: 'rgba(255,255,255,0.18)',
            color: '#fff',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 10px 30px rgba(2,6,23,0.25)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
        {heroMenuOpen && (
          <div
            ref={heroMenuRef}
            role="menu"
            style={{
              position: 'absolute',
              top: isMobile ? 46 : 52,
              right: 0,
              background: '#0f172a',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 20px 45px rgba(2,6,23,0.5)',
              padding: 8,
              minWidth: 180,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <button
              type="button"
              onClick={handleHeroDeleteProject}
              disabled={!selectedProjectId || actionLoading}
              style={{
                border: 'none',
                borderRadius: 10,
                padding: '10px 12px',
                background: selectedProjectId ? '#fee2e2' : 'rgba(255,255,255,0.08)',
                color: selectedProjectId ? '#b91c1c' : 'rgba(255,255,255,0.5)',
                fontSize: 13,
                fontWeight: 600,
                cursor: !selectedProjectId || actionLoading ? 'not-allowed' : 'pointer',
                textAlign: 'left',
              }}
            >
              Delete project
            </button>
            <button
              type="button"
              onClick={handleHeroLogout}
              style={{
                border: 'none',
                borderRadius: 10,
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg,rgba(3,7,18,0) 0%,rgba(3,7,18,0.85) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ width: '100%', padding: isMobile ? '20px 16px' : '32px 56px' }}>
          <div
            style={{
              maxWidth: 1200,
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.35)',
                  fontSize: 12,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                {selectedProject?.status?.replace(/-/g, ' ') || 'Project'}
              </span>
              <span
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.1)',
                  fontSize: 12,
                  letterSpacing: 0.5,
                }}
              >
                {selectedProjectId ? `#${selectedProjectId}` : 'Unassigned'}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                gap: 24,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: isMobile ? 28 : 40,
                    fontWeight: 700,
                    color: '#fff',
                    textShadow: '0 6px 20px rgba(2,6,23,0.65)',
                    letterSpacing: '-0.5px',
                  }}
                >
                  {heroEditingField === 'name' ? (
                    <input
                      ref={(node) => {
                        heroInputRef.current = node;
                      }}
                      type="text"
                      value={heroEditingValue}
                      onChange={(event) => setHeroEditingValue(event.target.value)}
                      onKeyDown={handleHeroKeyDown}
                      onBlur={handleHeroBlur}
                      disabled={heroEditingSaving}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.4)',
                        background: 'rgba(15,23,42,0.15)',
                        color: '#fff',
                        fontSize: 'inherit',
                        fontWeight: 'inherit',
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => beginHeroEdit('name')}
                      disabled={!selectedProject}
                      aria-label={selectedProject ? 'Edit project name' : 'Project name'}
                      aria-describedby={heroNameDisplayId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        border: 'none',
                        padding: 0,
                        background: 'transparent',
                        color: '#fff',
                        cursor: selectedProject ? 'pointer' : 'default',
                        fontSize: 'inherit',
                        fontWeight: 'inherit',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      <span id={heroNameDisplayId}>{heroDisplayValue('name') || 'Select a project'}</span>
                      {selectedProject && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ opacity: 0.85 }}
                          aria-hidden="true"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      )}
                    </button>
                  )}
                </h1>
                {heroEditingField === 'description' ? (
                  <textarea
                    ref={(node) => {
                      heroInputRef.current = node;
                    }}
                    rows={selectedProject?.description ? 3 : 2}
                    value={heroEditingValue}
                    onChange={(event) => setHeroEditingValue(event.target.value)}
                    onKeyDown={handleHeroKeyDown}
                    onBlur={handleHeroBlur}
                    disabled={heroEditingSaving}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.4)',
                      background: 'rgba(15,23,42,0.15)',
                      color: '#fff',
                      fontSize: 15,
                      lineHeight: 1.4,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <p
                    onClick={() => (selectedProject ? beginHeroEdit('description') : undefined)}
                    style={{
                      margin: 0,
                      color: 'rgba(255,255,255,0.85)',
                      maxWidth: 560,
                      cursor: selectedProject ? 'pointer' : 'default',
                    }}
                  >
                    {heroDisplayValue('description') ||
                      (selectedProject
                        ? 'Add a short overview so everyone stays aligned.'
                        : 'Choose a project to start managing signatures, files, and investors.')}
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, color: 'rgba(255,255,255,0.88)', flexWrap: 'wrap' }}>
                  {heroEditingField === 'address' ? (
                    <div style={{ position: 'relative', minWidth: 240, maxWidth: 420 }}>
                      <input
                        ref={(node) => {
                          heroInputRef.current = node;
                        }}
                        type="text"
                        value={heroEditingValue}
                        onChange={(event) => setHeroEditingValue(event.target.value)}
                        onKeyDown={handleHeroKeyDown}
                        onBlur={handleHeroBlur}
                        disabled={heroEditingSaving}
                        placeholder="Project address"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 12,
                          border: '1px solid rgba(255,255,255,0.4)',
                          background: 'rgba(15,23,42,0.2)',
                          color: '#fff',
                          outline: 'none',
                        }}
                      />
                      {heroAddressLoading && (
                        <span
                          style={{
                            position: 'absolute',
                            right: 12,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: 12,
                            color: 'rgba(255,255,255,0.7)',
                          }}
                        >
                          Loading…
                        </span>
                      )}
                      {heroAddressSuggestions.length > 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 6px)',
                            left: 0,
                            right: 0,
                            background: '#0f172a',
                            borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.3)',
                            boxShadow: '0 20px 40px rgba(2,6,23,0.5)',
                            maxHeight: 220,
                            overflowY: 'auto',
                            zIndex: 30,
                          }}
                        >
                          {heroAddressSuggestions.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                clearHeroBlurTimeout();
                              }}
                              onClick={() => {
                                setHeroEditingValue(suggestion);
                                submitHeroEdit(suggestion);
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '10px 12px',
                                background: 'transparent',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer',
                              }}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : selectedProject?.address ? (
                    <>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedProject.address)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 28,
                          borderRadius: '999px',
                          background: 'rgba(255,255,255,0.15)',
                          color: '#fff',
                        }}
                        aria-label="Open in Google Maps"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="1.5" fill="none">
                          <path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10z" />
                          <circle cx="12" cy="11" r="2" />
                        </svg>
                      </a>
                      <button
                        type="button"
                        onClick={() => beginHeroEdit('address')}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#fff',
                          fontWeight: 500,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        {selectedProject.address}
                      </button>
                    </>
                  ) : (
                    <>
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                        style={{ color: '#fff' }}
                      >
                        <path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10z" />
                        <circle cx="12" cy="11" r="2" />
                      </svg>
                      <button
                        type="button"
                        onClick={() => (selectedProject ? beginHeroEdit('address') : undefined)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#fff',
                          fontWeight: 500,
                          cursor: selectedProject ? 'pointer' : 'default',
                          padding: 0,
                        }}
                      >
                        {selectedProject ? 'Add project address' : 'Waiting for project selection'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div style={{ minWidth: 260, textAlign: isMobile ? 'left' : 'right' }}>
                <p style={{ margin: 0, fontSize: 12, letterSpacing: 1, color: 'rgba(255,255,255,0.72)' }}>Investor portal</p>
                {shareLink ? (
                  <>
                    <a
                      href={shareLink}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: '#fff',
                        fontWeight: 600,
                        display: 'inline-flex',
                        gap: 6,
                        alignItems: 'center',
                        marginTop: 10,
                        textDecoration: 'none',
                      }}
                    >
                      Open viewer ↗
                    </a>
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.72)', wordBreak: 'break-all' }}>{shareLink}</p>
                  </>
                ) : (
                  <p style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
                    Select a project to copy and share its investor dashboard link.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div
      className={layoutClassName}
      style={{
        minHeight: '100vh',
        display: 'flex',
        background: palette.bg,
        color: palette.text,
        padding: 0,
        gap: 0,
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
          width: isMobile ? '100%' : 320,
          padding: isMobile ? 16 : 24,
          borderRight: isMobile ? 'none' : '1px solid #e2e8f0',
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: 'none',
          borderRadius: 0,
          position: isMobile ? 'relative' : 'sticky',
          top: isMobile ? undefined : 0,
          height: isMobile ? 'auto' : '100vh',
          alignSelf: isMobile ? 'stretch' : 'flex-start',
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>{projectSidebarContent}</div>
      </aside>
      <main
        className="admin-main"
        style={{
          flex: 1,
          padding: 0,
          overflowY: 'auto',
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {heroSection}
        <div
          style={{
            width: '100%',
            padding: isMobile ? 12 : 24,
          }}
        >
          <div
            style={{
              maxWidth: 1200,
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: isMobile ? 20 : 32,
            }}
          >
          <div
            style={{
              borderRadius: isMobile ? 18 : 32,
              background: 'inherit',
              border: '1px solid transparent',
              boxShadow: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              padding: isMobile ? 8 : 12,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(auto-fit, minmax(160px, 1fr))' : 'repeat(4, minmax(0, 1fr))',
                gap: 10,
                marginBottom: isMobile ? 4 : 8,
              }}
            >
              {docStats.map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    background: '#fff',
                    borderRadius: 16,
                    border: '1px solid #e2e8f0',
                    padding: isMobile ? 14 : 18,
                    boxShadow: '0 12px 20px rgba(15,23,42,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 16,
                      background: stat.iconBg,
                      color: stat.iconColor,
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
              ))}
            </div>
            <header
              style={{
                display: 'flex',
                justifyContent: 'flex-start',
                alignItems: 'center',
                paddingBottom: 16,
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  gap: 4,
                  padding: 4,
                  borderRadius: 999,
                  background: '#e0e7ff',
                  border: '1px solid #c7d2fe',
                  width: isMobile ? '100%' : 'auto',
                  overflowX: isMobile ? 'auto' : 'visible',
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
                        borderRadius: 999,
                        border: '1px solid transparent',
                        padding: '8px 18px',
                        fontSize: 13,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: active ? '#fff' : 'transparent',
                        color: active ? palette.text : palette.accentMuted,
                        cursor: 'pointer',
                        fontWeight: active ? 600 : 500,
                        flex: isMobile ? '0 0 auto' : undefined,
                        whiteSpace: 'nowrap',
                        boxShadow: active ? '0 12px 24px rgba(15,23,42,0.12)' : 'none',
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
              <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>Signatures & Packets</h3>
                    <p style={{ margin: '4px 0 0', color: palette.accentMuted }}>Monitor outgoing envelopes and completed packets.</p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: isMobile ? 'stretch' : 'flex-end', width: isMobile ? '100%' : 'auto' }}>
                    <button
                      type="button"
                      onClick={goToRequestSign}
                      disabled={!canRequestSignatures}
                      style={{ ...usePrimaryButtonStyle(canRequestSignatures, requestButtonHovered), width: isMobile ? '100%' : undefined }}
                      onMouseEnter={() => canRequestSignatures && setRequestButtonHovered(true)}
                      onMouseLeave={() => canRequestSignatures && setRequestButtonHovered(false)}
                      title={
                        canRequestSignatures ? 'Launch the Request Sign flow' : 'Add investors first to request signatures'
                      }
                    >
                      <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={16}
                          height={16}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" x2="12" y1="3" y2="15" />
                        </svg>
                        Request signatures
                      </span>
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    justifyContent: isMobile ? 'flex-start' : 'flex-end',
                    alignItems: 'center',
                  }}
                >
                  <button
                    data-testid="signatures-manage-toggle"
                    type="button"
                    onClick={toggleDocumentsManage}
                    disabled={!hasSignaturesAvailable}
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${palette.border}`,
                      padding: '6px 14px',
                      background: manageDocumentsMode ? palette.accent : '#fff',
                      color: manageDocumentsMode ? '#fff' : palette.text,
                      fontWeight: 600,
                      cursor: hasSignaturesAvailable ? 'pointer' : 'not-allowed',
                      opacity: hasSignaturesAvailable ? 1 : 0.6,
                    }}
                  >
                    {manageDocumentsMode ? 'Done' : 'Manage'}
                  </button>
                  {manageDocumentsMode && (
                    <button
                      data-testid="signatures-delete-selected"
                      type="button"
                      onClick={deleteSelectedDocuments}
                      disabled={
                        (!selectedFinalIds.length && !selectedEnvelopeIds.length) || actionLoading || revokingEnvelopes
                      }
                      style={{
                        borderRadius: 999,
                        border: '1px solid #dc2626',
                        padding: '6px 14px',
                        background: '#dc2626',
                        color: '#fff',
                        fontWeight: 600,
                        cursor:
                          !selectedFinalIds.length && !selectedEnvelopeIds.length ? 'not-allowed' : 'pointer',
                        opacity: !selectedFinalIds.length && !selectedEnvelopeIds.length ? 0.5 : 1,
                      }}
                    >
                      {actionLoading || revokingEnvelopes ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
                {!hasSignaturesAvailable ? (
                  <div
                    style={{
                      padding: 28,
                      border: '1px dashed rgba(148,163,184,0.45)',
                      borderRadius: 16,
                      textAlign: 'center',
                      color: palette.accentMuted,
                      background: '#fff',
                    }}
                  >
                    Upload a PDF and add investors to start sending signature requests.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {documentEntries.map((entry) => {
                          const isAwaiting = entry.kind === 'awaiting';
                          const final = entry.kind === 'signed' ? entry.final : null;
                          const envelopeRecord = isAwaiting
                            ? entry.env
                            : envelopeMap[final!.envelope_id] ??
                              ({
                                id: final?.envelope_id ?? 0,
                                subject: final?.document_name ?? 'Signed packet',
                                status: 'completed',
                                created_at: final?.completed_at ?? '',
                                document: final
                                  ? { id: final.document_id ?? null, filename: final.document_name ?? null }
                                  : undefined,
                                total_signers: 0,
                                completed_signers: 0,
                                signers: [],
                              } as EnvelopeSummary);
                          if (!envelopeRecord) return null;
                          const envelopeId = envelopeRecord.id;
                          const finalId = final?.envelope_id ?? envelopeId;
                          const expanded = isAwaiting
                            ? expandedEnvelopes[envelopeId] ?? false
                            : expandedFinals[finalId] ?? false;
                          const hovered = isAwaiting
                            ? hoveredEnvelopeId === envelopeId
                            : hoveredFinalId === finalId;
                          const selected = isAwaiting
                            ? selectedEnvelopeIds.includes(envelopeId)
                            : selectedFinalIds.includes(finalId);
                          const signerList = envelopeRecord.signers || [];
                          const signerAvatars = signerList.slice(0, 10);
                          const extraSigners = Math.max(0, signerList.length - signerAvatars.length);
                          const totalSigners = envelopeRecord.total_signers || signerList.length || 0;
                          const completedSigners =
                            envelopeRecord.completed_signers ??
                            signerList.filter((signer) => signer.status === 'completed').length;
                          const progressLabel =
                            totalSigners > 0 ? `${Math.min(completedSigners, totalSigners)}/${totalSigners} signed` : 'Incomplete setup';
                          const buttonLabel = expanded ? 'Hide signees' : progressLabel;
                          const chipLabel = isAwaiting
                            ? totalSigners > 0
                              ? 'Awaiting'
                              : 'Needs setup'
                            : 'Completed';
                          const chipStyle =
                            isAwaiting && totalSigners === 0
                              ? { ...awaitingChipStyle, background: '#fef3c7', color: '#92400e' }
                              : isAwaiting
                                ? awaitingChipStyle
                                : completedChipStyle;
                          const timelineLabel = isAwaiting
                            ? formatSentLabel(envelopeRecord.created_at)
                            : `Completed ${formatLocalDateTime(final?.completed_at) ?? 'time unavailable'}`;
                          const documentLabel = isAwaiting
                            ? envelopeRecord.document?.filename || 'Untitled PDF'
                            : final?.document_name || envelopeRecord.document?.filename || 'Signed packet';
                          const docNameForExt =
                            isAwaiting && envelopeRecord.document?.filename
                              ? envelopeRecord.document.filename
                              : final?.document_name || envelopeRecord.document?.filename || documentLabel;
                          const fileExtLabel = docNameForExt
                            ? (docNameForExt.split('.').pop() ?? '').toUpperCase() || 'PDF'
                            : 'PDF';
                          const documentUrl = isAwaiting
                            ? selectedProjectId && envelopeRecord.document?.id
                              ? `${baseApi}/api/projects/${selectedProjectId}/documents/${envelopeRecord.document.id}/pdf${tokenParam}`
                              : null
                            : `${baseApi}/api/projects/${selectedProjectId}/final-artifacts/${finalId}/pdf${tokenParam}`;
                          const showCheckbox = isAwaiting ? manageEnvelopesMode : manageSignedMode;
                          const showRevoke = isAwaiting && manageEnvelopesMode;
                          const key = isAwaiting ? `env-${envelopeId}` : `final-${finalId}`;
                          const handleMouseEnter = () => {
                            if (isAwaiting) {
                              setHoveredEnvelopeId(envelopeId);
                            } else {
                              setHoveredFinalId(finalId);
                            }
                          };
                          const handleMouseLeave = () => {
                            if (isAwaiting) {
                              setHoveredEnvelopeId((prev) => (prev === envelopeId ? null : prev));
                            } else {
                              setHoveredFinalId((prev) => (prev === finalId ? null : prev));
                            }
                          };
                          const toggleSelection = () => {
                            if (isAwaiting) {
                              toggleEnvelopeSelection(envelopeId);
                            } else {
                              toggleFinalSelection(finalId);
                            }
                          };
                          const toggleExpansion = () => {
                            if (isAwaiting) {
                              toggleEnvelopeExpansion(envelopeId);
                            } else {
                              toggleFinalExpansion(finalId);
                            }
                          };
                          const getSignerColor = (status?: string) => {
                            if (status === 'completed') return '#22c55e';
                            if (status === 'declined' || status === 'voided') return '#dc2626';
                            return '#94a3b8';
                          };

                          return (
                            <div
                              key={key}
                              data-document-kind={isAwaiting ? 'awaiting' : 'signed'}
                              onMouseEnter={handleMouseEnter}
                              onMouseLeave={handleMouseLeave}
                              style={{
                                border: selected || hovered ? `1px solid ${palette.accent}` : `1px solid ${palette.border}`,
                                borderRadius: 14,
                                padding: 16,
                                background: '#fff',
                                boxShadow:
                                  selected || hovered
                                    ? '0 10px 22px rgba(37,99,235,0.12)'
                                    : '0 6px 16px rgba(15,23,42,0.08)',
                                transition: 'border 0.2s ease, box-shadow 0.2s ease',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  gap: 12,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 260px' }}>
                                  {showCheckbox && (
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={toggleSelection}
                                      onClick={(event) => event.stopPropagation()}
                                    />
                                  )}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                                    <div
                                      style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: 12,
                                        background: '#f1f5f9',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        style={{ color: '#dc2626' }}
                                      >
                                        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                                        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                                        <path d="M10 9H8" />
                                        <path d="M16 13H8" />
                                        <path d="M16 17H8" />
                                      </svg>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      {documentUrl ? (
                                        <a
                                          href={documentUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          style={documentLinkStyle}
                                          className="admin-document-link"
                                        >
                                          <strong style={{ fontSize: 16 }}>{documentLabel}</strong>
                                        </a>
                                      ) : (
                                        <strong style={{ fontSize: 16 }}>{documentLabel}</strong>
                                      )}
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 8,
                                          flexWrap: 'wrap',
                                          color: palette.accentMuted,
                                          marginTop: 4,
                                        }}
                                      >
                                        <span
                                          style={{
                                            padding: '2px 8px',
                                            borderRadius: 999,
                                            background: '#fee2e2',
                                            color: '#b91c1c',
                                            fontSize: 11,
                                            fontWeight: 600,
                                          }}
                                        >
                                          {fileExtLabel}
                                        </span>
                                        <span>•</span>
                                        <span style={{ fontSize: 12 }}>{timelineLabel}</span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                                        <span style={chipStyle}>{chipLabel}</span>
                                        {signerList.length > 0 && (
                                          <div style={{ display: 'flex', alignItems: 'center' }}>
                                            {signerAvatars.map((signer, idx) => (
                                              <div
                                                key={`${key}-avatar-${signer.id}`}
                                                title={`${signer.name || signer.email || 'Signer'} - ${signer.status || 'pending'}`}
                                                style={{
                                                  width: 28,
                                                  height: 28,
                                                  borderRadius: '50%',
                                                  border: '2px solid #fff',
                                                  background: getSignerColor(signer.status),
                                                  color: '#fff',
                                                  fontWeight: 700,
                                                  fontSize: 12,
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  marginLeft: idx === 0 ? 0 : -8,
                                                  textTransform: 'uppercase',
                                                  boxShadow: '0 6px 14px rgba(15,23,42,0.18)',
                                                }}
                                              >
                                                {(signer.name || signer.email || '?').trim().charAt(0) || '?'}
                                              </div>
                                            ))}
                                            {extraSigners > 0 && (
                                              <div
                                                title={`${extraSigners} more signer${extraSigners > 1 ? 's' : ''}`}
                                                style={{
                                                  width: 28,
                                                  height: 28,
                                                  borderRadius: '50%',
                                                  border: '2px solid #fff',
                                                  background: '#1e293b',
                                                  color: '#fff',
                                                  fontWeight: 700,
                                                  fontSize: 11,
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  marginLeft: signerAvatars.length ? -8 : 0,
                                                  boxShadow: '0 6px 14px rgba(15,23,42,0.18)',
                                                }}
                                              >
                                                +{extraSigners}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                        {totalSigners > 0 && (
                                          <span style={{ fontSize: 12, color: palette.accentMuted }}>{progressLabel}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    onClick={toggleExpansion}
                                    aria-label={expanded ? 'Hide signees' : 'View signees'}
                                    style={{
                                      borderRadius: 999,
                                      border: '1px solid rgba(148,163,184,0.6)',
                                      padding: '6px 12px',
                                      background: '#fff',
                                      cursor: 'pointer',
                                      fontSize: 13,
                                    }}
                                  >
                                    {buttonLabel}
                                  </button>
                                </div>
                              </div>
                              {expanded && signerList.length > 0 && (
                                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${palette.border}` }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {signerList.map((signer) => {
                                      const completed = signer.status === 'completed';
                                      return (
                                        <div
                                          key={`${key}-signer-${signer.id}`}
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 16,
                                            flexWrap: 'wrap',
                                            fontSize: 13,
                                          }}
                                        >
                                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <strong style={{ fontSize: 13 }}>{signer.name || 'Unnamed signer'}</strong>
                                            <span style={{ color: palette.accentMuted }}>{signer.email || 'Email unavailable'}</span>
                                          </div>
                                          <div style={{ textAlign: 'right', minWidth: 180, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <span style={{ color: completed ? '#15803d' : '#9ca3af', fontWeight: 600 }}>
                                              {completed ? 'Signed' : signer.status || 'Pending'}
                                            </span>
                                            {signer.completed_at && (
                                              <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>
                                                {formatLocalDateTime(signer.completed_at)}
                                              </p>
                                            )}
                                            {signer.magic_link && (
                                              <button
                                                type="button"
                                                onClick={() => copyMagicLink(signer.magic_link)}
                                                style={{
                                                  border: `1px solid ${palette.border}`,
                                                  borderRadius: 999,
                                                  padding: '4px 10px',
                                                  background: '#fff',
                                                  color: palette.accent,
                                                  fontSize: 12,
                                                  cursor: 'pointer',
                                                }}
                                              >
                                                Copy link
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </section>
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
                      padding: isMobile ? 24 : 36,
                      border: '1px dashed rgba(148,163,184,0.45)',
                      borderRadius: 20,
                      textAlign: 'center',
                      color: palette.accentMuted,
                      background: '#fff',
                    }}
                  >
                    Select a project to upload documents.
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 16,
                        padding: '8px 4px',
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0 }}>Project Documents</h3>
                        <p style={{ margin: '4px 0 0', color: palette.accentMuted }}>All files and documents related to this project.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDocumentUpload((prev) => !prev)}
                        style={{
                          borderRadius: 10,
                          border: 'none',
                          padding: '10px 18px',
                          background: palette.accent,
                          color: '#fff',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={18}
                          height={18}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" x2="12" y1="3" y2="15" />
                        </svg>
                        {showDocumentUpload ? 'Close upload' : 'Upload documents'}
                      </button>
                    </div>
                    {showDocumentUpload && (
                      <div
                        style={{
                          border: '1px dashed rgba(148,163,184,0.45)',
                          borderRadius: 16,
                          padding: 16,
                          background: '#f8fafc',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Document name"
                          value={projectFileUploadName}
                          onChange={(event) => setProjectFileUploadName(event.target.value)}
                          style={{ padding: 12, borderRadius: 10, border: `1px solid ${palette.border}` }}
                        />
                        <label
                          htmlFor="project-file-upload"
                          style={{
                            border: '2px dashed rgba(148,163,184,0.6)',
                            borderRadius: 12,
                            padding: '18px 12px',
                            textAlign: 'center',
                            color: palette.accentMuted,
                            cursor: 'pointer',
                            background: '#fff',
                          }}
                        >
                          Drag & drop files here or click to browse
                        </label>
                        <input
                          id="project-file-upload"
                          type="file"
                          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,application/pdf,application/msword,application/vnd.ms-powerpoint,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          onChange={handleProjectFileSelection}
                          style={{ display: 'none' }}
                        />
                        {projectFileUploadFile && (
                          <p style={{ margin: 0, fontSize: 13 }}>Selected: {projectFileUploadFile.name}</p>
                        )}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setShowDocumentUpload(false);
                              setProjectFileUploadFile(null);
                              setProjectFileUploadName('');
                            }}
                            style={{ border: 'none', background: 'transparent', color: palette.accentMuted, cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={uploadProjectFile}
                            disabled={!projectFileUploadFile || projectFileUploading}
                            style={{
                              borderRadius: 10,
                              border: 'none',
                              padding: '10px 18px',
                              background: !projectFileUploadFile || projectFileUploading ? 'rgba(37,99,235,0.35)' : palette.accent,
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {projectFilesLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                          <div className="admin-loading-spinner" />
                        </div>
                      ) : hasProjectFiles ? (
                        projectFiles.map((file) => {
                          const downloadUrl = `${baseApi}/api/projects/${selectedProjectId}/files/${file.id}/download${tokenParam}`;
                          const deleting = projectFileDeletingId === file.id;
                          const hovered = hoveredProjectFileId === file.id;
                          const ext = (file.display_name || file.stored_filename || '').split('.').pop()?.toUpperCase() || 'FILE';
                          return (
                            <div
                              key={file.id}
                              style={{
                                border: hovered ? `1px solid ${palette.accent}` : `1px solid ${palette.border}`,
                                borderRadius: 16,
                                padding: 16,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                flexWrap: 'wrap',
                                background: '#fff',
                                transition: 'border 0.2s ease, background 0.2s ease',
                              }}
                              onMouseEnter={() => setHoveredProjectFileId(file.id)}
                              onMouseLeave={() => setHoveredProjectFileId((prev) => (prev === file.id ? null : prev))}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 220px' }}>
                                <div
                                  style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 12,
                                    background: '#f1f5f9',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ color: '#dc2626' }}
                                  >
                                    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                                    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                                    <path d="M10 9H8" />
                                    <path d="M16 13H8" />
                                    <path d="M16 17H8" />
                                  </svg>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <a
                                    href={downloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="admin-document-link"
                                    style={{ margin: 0, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                  >
                                    {file.display_name}
                                  </a>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', color: palette.accentMuted }}>
                                    <span
                                      style={{
                                        padding: '2px 8px',
                                        borderRadius: 999,
                                        background: '#fee2e2',
                                        color: '#b91c1c',
                                        fontSize: 11,
                                        fontWeight: 600,
                                      }}
                                    >
                                      {ext}
                                    </span>
                                    <span>•</span>
                                    <span>Uploaded {formatLocalDateTime(file.uploaded_at) ?? 'time unavailable'}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                  type="button"
                                  onClick={() => deleteProjectFile(file.id)}
                                  disabled={deleting}
                                  style={{
                                    borderRadius: 8,
                                    border: '1px solid rgba(220,38,38,0.4)',
                                    padding: '6px 14px',
                                    background: deleting ? 'rgba(220,38,38,0.12)' : '#fff',
                                    color: '#dc2626',
                                    fontSize: 13,
                                    cursor: deleting ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  {deleting ? 'Deleting…' : 'Delete'}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div
                          style={{
                            padding: 28,
                            borderRadius: 16,
                            border: '1px dashed rgba(148,163,184,0.6)',
                            textAlign: 'center',
                            color: palette.accentMuted,
                          }}
                        >
                          No documents uploaded yet.
                        </div>
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
                  <div
                    style={{
                      borderRadius: 24,
                      border: `1px solid ${palette.border}`,
                      padding: 24,
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                      boxShadow: '0 18px 32px rgba(15,23,42,0.08)',
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
                      borderRadius: 24,
                      border: `1px solid ${palette.border}`,
                      padding: 24,
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                      boxShadow: '0 18px 32px rgba(15,23,42,0.08)',
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
                        borderRadius: 14,
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
                    <h3 style={{ margin: 0 }}>Project Investors</h3>
                    <p style={{ margin: '4px 0 0', color: palette.accentMuted }}>Investor info and investment amounts.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedProjectId) return;
                      setShowInvestorForm((prev) => !prev);
                    }}
                    disabled={!selectedProjectId}
                    style={{
                      ...primaryButtonStyle(Boolean(selectedProjectId)),
                      minWidth: isMobile ? '100%' : 180,
                    }}
                  >
                    {showInvestorForm ? 'Close form' : '+ Add investor'}
                  </button>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginTop: 12,
                    justifyContent: isMobile ? 'flex-start' : 'flex-end',
                  }}
                >
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
                {selectedProjectId && <div style={{ height: 4 }} />}
                {selectedProjectId && showInvestorForm && (
                  <div
                    style={{
                      border: `1px solid ${palette.border}`,
                      marginTop: 12,
                      marginBottom: 16,
                      padding: 16,
                      borderRadius: 16,
                      background: '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Name"
                      value={newInvestorName}
                      onChange={(event) => setNewInvestorName(event.target.value)}
                      style={{ padding: 10, borderRadius: 8, border: `1px solid ${palette.border}` }}
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={newInvestorEmail}
                      onChange={(event) => setNewInvestorEmail(event.target.value)}
                      style={{ padding: 10, borderRadius: 8, border: `1px solid ${palette.border}` }}
                    />
                    <textarea
                      rows={3}
                      placeholder="Mailing address"
                      value={newInvestorMailing}
                      onChange={(event) => setNewInvestorMailing(event.target.value)}
                      style={{ padding: 10, borderRadius: 8, border: `1px solid ${palette.border}`, resize: 'vertical' }}
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="Units (e.g. 10000)"
                      value={newInvestorUnits}
                      onChange={(event) => setNewInvestorUnits(event.target.value)}
                      style={{ padding: 10, borderRadius: 8, border: `1px solid ${palette.border}` }}
                    />
                    <input
                      type="text"
                      placeholder="Bank name"
                      value={newInvestorBankName}
                      onChange={(event) => setNewInvestorBankName(event.target.value)}
                      style={{ padding: 10, borderRadius: 8, border: `1px solid ${palette.border}` }}
                    />
                    <input
                      type="text"
                      placeholder="Bank account number"
                      value={newInvestorBankAccount}
                      onChange={(event) => setNewInvestorBankAccount(event.target.value)}
                      style={{ padding: 10, borderRadius: 8, border: `1px solid ${palette.border}` }}
                    />
                    <input
                      type="text"
                      placeholder="Routing number"
                      value={newInvestorBankRouting}
                      onChange={(event) => setNewInvestorBankRouting(event.target.value)}
                      style={{ padding: 10, borderRadius: 8, border: `1px solid ${palette.border}` }}
                    />
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowInvestorForm(false);
                          resetInvestorForm();
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: palette.accentMuted,
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={createInvestor}
                        disabled={creatingInvestor}
                        style={primaryButtonStyle(!creatingInvestor)}
                      >
                        {creatingInvestor ? 'Adding…' : 'Add investor'}
                      </button>
                    </div>
                  </div>
                )}
              </header>
              {!selectedProjectId ? (
                <p style={{ color: palette.accentMuted }}>Choose a project to manage investors.</p>
              ) : investors.length === 0 ? (
                <div
                  style={{
                    padding: 28,
                    borderRadius: 16,
                    border: '1px dashed rgba(148,163,184,0.6)',
                    textAlign: 'center',
                    color: palette.accentMuted,
                    background: '#fff',
                  }}
                >
                  No investors linked yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {investors.map((investor) => {
                    const selected = selectedInvestorIds.includes(investor.id);
                    const editing = editingInvestorId === investor.id;
                    const hovered = hoveredInvestorId === investor.id;
                    const cardBorder = selected || editing || hovered ? palette.accent : palette.border;
                    const highlightBg = hovered || selected ? '#edf2ff' : '#fff';
                    const initialsSource = (investor.name || investor.email || '?').trim();
                    const initials = initialsSource ? initialsSource[0]?.toUpperCase() ?? '?' : '?';
                    const unitsValue =
                      typeof investor.units_invested === 'number' ? investor.units_invested : null;
                    const unitsLabel = unitsValue !== null ? `${unitsValue.toLocaleString()} units` : 'Units pending';
                    const secondaryLabel =
                      investor.role?.trim() ||
                      (investor.mailing_address ? investor.mailing_address : 'Role not specified');
                    return (
                      <div
                        key={investor.id}
                        style={{
                          borderRadius: 18,
                          border: `1px solid ${cardBorder}`,
                          padding: 16,
                          background: highlightBg,
                          boxShadow: highlightBg !== '#fff' ? '0 10px 24px rgba(37,99,235,0.15)' : '0 8px 18px rgba(15,23,42,0.04)',
                          transition: 'background 0.15s ease, border 0.15s ease, box-shadow 0.15s ease',
                        }}
                        onMouseEnter={() => setHoveredInvestorId(investor.id)}
                        onMouseLeave={() => setHoveredInvestorId((prev) => (prev === investor.id ? null : prev))}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 16,
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 240px' }}>
                            {manageInvestorsMode && (
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleInvestorSelection(investor.id)}
                                style={{ width: 18, height: 18 }}
                              />
                            )}
                            <div
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #3b82f6, #a855f7)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: 18,
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                            <div>
                              <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{investor.name || 'Unnamed investor'}</p>
                              <p style={{ margin: '4px 0 0', color: palette.accentMuted, fontSize: 13 }}>
                                {investor.email || 'Email unavailable'}
                              </p>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', minWidth: isMobile ? 'auto' : 180 }}>
                            <p style={{ margin: 0, fontWeight: 600 }}>{unitsLabel}</p>
                            <p style={{ margin: '4px 0 0', color: palette.accentMuted, fontSize: 13 }}>{secondaryLabel}</p>
                          </div>
                        </div>
                        {!editing && (
                          <div
                            style={{
                              display: 'flex',
                              gap: 12,
                              flexWrap: 'wrap',
                              marginTop: 10,
                              fontSize: 12,
                              color: palette.accentMuted,
                            }}
                          >
                            {investor.mailing_address && <span>Mailing: {investor.mailing_address}</span>}
                            {investor.bank_name && <span>Bank: {investor.bank_name}</span>}
                            {investor.bank_account_number && <span>Acct #: {investor.bank_account_number}</span>}
                            {investor.bank_routing_number && <span>Routing #: {investor.bank_routing_number}</span>}
                          </div>
                        )}
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
            </div>
          )}
        </div>
          </div>
        </div>
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
