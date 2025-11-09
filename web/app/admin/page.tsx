'use client';

import { useEffect, useMemo, useState, MouseEvent } from 'react';
import ProjectsPage from '../projects/page';

type Project = {
  id: number;
  name: string;
  status: string;
};

type Document = {
  id: number;
  filename: string;
  created_at: string;
};

type FinalArtifact = {
  envelope_id: number;
  document_id: number;
  document_name: string;
  completed_at: string;
  sha256_final: string;
};

type Investor = {
  id: number;
  name: string;
  email: string;
  units_invested: number;
  role: string;
};

const palette = {
  bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #111827 100%)',
  panel: 'rgba(15,23,42,0.8)',
  accent: '#38bdf8',
  accentMuted: '#94a3b8',
};

const baseApi = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

export default function AdminPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [finals, setFinals] = useState<FinalArtifact[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [selectedFinalIds, setSelectedFinalIds] = useState<number[]>([]);
  const [loadingInvestors, setLoadingInvestors] = useState(false);
  const [showInvestorModal, setShowInvestorModal] = useState(false);
  const [investorsDirty, setInvestorsDirty] = useState(false);
  const [manageSignedMode, setManageSignedMode] = useState(false);
  const [manageUploadsMode, setManageUploadsMode] = useState(false);
  const [hoveredFinalId, setHoveredFinalId] = useState<number | null>(null);
  const [hoveredDocId, setHoveredDocId] = useState<number | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [manageProjectsMode, setManageProjectsMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);

  const loadProjects = async (focusId?: number) => {
    try {
      const resp = await fetch(`${baseApi}/api/projects`);
      if (!resp.ok) throw new Error(`Failed to load projects (${resp.status})`);
      const data = await resp.json();
      setProjects(data || []);
      if (focusId) {
        setSelectedProjectId(focusId);
      } else if (data?.length && !selectedProjectId) {
        setSelectedProjectId(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${baseApi}/api/projects/${selectedProjectId}/documents`).then((r) => r.json()),
      fetch(`${baseApi}/api/projects/${selectedProjectId}/final-artifacts`).then((r) => r.json()),
    ])
      .then(([docs, finalsData]) => {
        setDocuments(docs || []);
        setFinals(finalsData || []);
        setSelectedDocIds([]);
        setSelectedFinalIds([]);
        loadInvestors(selectedProjectId);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load project details'))
      .finally(() => setLoading(false));
  }, [selectedProjectId]);

  const loadInvestors = async (projectId: number) => {
    setLoadingInvestors(true);
    try {
      const resp = await fetch(`${baseApi}/api/projects/${projectId}/investors`);
      if (!resp.ok) throw new Error(`Failed to load investors (${resp.status})`);
      const list = await resp.json();
      setInvestors(list || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load investors');
    } finally {
      setLoadingInvestors(false);
    }
  };

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const toggleDocumentSelection = (id: number) => {
    setSelectedDocIds((prev) => (prev.includes(id) ? prev.filter((docId) => docId !== id) : [...prev, id]));
  };

  const toggleFinalSelection = (id: number) => {
    setSelectedFinalIds((prev) => (prev.includes(id) ? prev.filter((fid) => fid !== id) : [...prev, id]));
  };

  const openInvestorModal = () => {
    setInvestorsDirty(false);
    setShowInvestorModal(true);
  };

  const closeInvestorModal = () => {
    setShowInvestorModal(false);
    if (investorsDirty && selectedProjectId) {
      loadInvestors(selectedProjectId);
    }
  };

  const handleProjectsChange = () => {
    setInvestorsDirty(true);
  };

  const deleteSelectedDocuments = async () => {
    if (!selectedProjectId || !selectedDocIds.length) return;
    const confirmRemove = window.confirm(`Delete ${selectedDocIds.length} uploaded PDF(s)? This cannot be undone.`);
    if (!confirmRemove) return;
    setActionLoading(true);
    try {
      for (const id of selectedDocIds) {
        const resp = await fetch(`${baseApi}/api/projects/${selectedProjectId}/documents/${id}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error(`Delete failed (${resp.status})`);
      }
      setDocuments((prev) => prev.filter((doc) => !selectedDocIds.includes(doc.id)));
      setSelectedDocIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete documents');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSignedManage = () => {
    setManageSignedMode((prev) => {
      if (prev) setSelectedFinalIds([]);
      return !prev;
    });
  };

  const toggleUploadManage = () => {
    setManageUploadsMode((prev) => {
      if (prev) setSelectedDocIds([]);
      return !prev;
    });
  };

  const deleteSelectedFinals = async () => {
    if (!selectedProjectId || !selectedFinalIds.length) return;
    const confirmRemove = window.confirm(`Delete ${selectedFinalIds.length} signed packet(s)? This cannot be undone.`);
    if (!confirmRemove) return;
    setActionLoading(true);
    try {
      for (const id of selectedFinalIds) {
        const resp = await fetch(`${baseApi}/api/projects/${selectedProjectId}/final-artifacts/${id}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error(`Delete failed (${resp.status})`);
      }
      setFinals((prev) => prev.filter((item) => !selectedFinalIds.includes(item.envelope_id)));
      setSelectedFinalIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete signed packets');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCardDownload = (event: MouseEvent<HTMLElement>, url: string) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input') || target?.closest('button') || target?.closest('a')) return;
    window.open(url, '_blank');
  };

  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) {
      setError('Project name required');
      return;
    }
    setCreatingProject(true);
    setError(null);
    try {
      const resp = await fetch(`${baseApi}/api/projects?name=${encodeURIComponent(name)}`, { method: 'POST' });
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
      if (prev) setSelectedProjectIds([]);
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
        const resp = await fetch(`${baseApi}/api/projects/${projectId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error(`Failed to delete project (${resp.status})`);
        if (projectId === selectedProjectId) {
          setSelectedProjectId(null);
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: palette.bg, color: '#f8fafc' }}>
      <aside
        style={{
          width: 260,
          padding: 24,
          borderRight: '1px solid rgba(148,163,184,0.35)',
          background: 'rgba(15,23,42,0.9)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: palette.accent }}>Projects</h2>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              onClick={toggleProjectManage}
              style={{
                border: '1px solid rgba(148,163,184,0.5)',
                background: 'transparent',
                color: '#e2e8f0',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
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
                  border: '1px solid rgba(248,113,113,0.8)',
                  color: '#fca5a5',
                  background: 'transparent',
                  borderRadius: 999,
                  padding: '4px 10px',
                  fontSize: 12,
                  cursor: !selectedProjectIds.length || actionLoading ? 'not-allowed' : 'pointer',
                  opacity: !selectedProjectIds.length || actionLoading ? 0.5 : 1,
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          {projects.map((project, idx) => {
            const active = project.id === selectedProjectId;
            return (
              <button
                key={`project-${project.id ?? idx}`}
                onClick={() => setSelectedProjectId(project.id)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: active ? palette.accent : 'rgba(248,250,252,0.08)',
                  color: active ? '#0f172a' : '#e2e8f0',
                  cursor: 'pointer',
                  fontWeight: active ? 600 : 400,
                }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {manageProjectsMode && (
                      <input
                        type="checkbox"
                        checked={selectedProjectIds.includes(project.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleProjectSelection(project.id)}
                      />
                    )}
                    <span>{project.name}</span>
                  </div>
                </button>
            );
          })}
          {manageProjectsMode && (
            <div style={{ borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: 12, marginTop: 4 }}>
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
                      padding: 8,
                      borderRadius: 8,
                      border: '1px solid rgba(148,163,184,0.4)',
                      background: 'rgba(15,23,42,0.6)',
                      color: '#f8fafc',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={createProject}
                      disabled={creatingProject}
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        border: 'none',
                        padding: '8px 12px',
                        background: creatingProject ? 'rgba(56,189,248,0.3)' : palette.accent,
                        color: '#0f172a',
                        fontWeight: 600,
                        cursor: creatingProject ? 'not-allowed' : 'pointer',
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
                        color: '#e2e8f0',
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
      </aside>
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, padding: 32 }}>
        <section
          style={{
            borderRadius: 24,
            background: palette.panel,
            padding: 24,
            boxShadow: '0 25px 45px rgba(0,0,0,0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>Documents</p>
              <h3 style={{ margin: 0 }}>{selectedProject?.name || 'Select a project'}</h3>
            </div>
            {loading && <span style={{ fontSize: 12 }}>Loading…</span>}
          </header>
          {error && <div style={{ color: '#fca5a5' }}>{error}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h4 style={{ margin: 0 }}>Signed Documents</h4>
                <button
                  type="button"
                  onClick={toggleSignedManage}
                  style={{
                    border: '1px solid rgba(148,163,184,0.5)',
                    background: 'transparent',
                    color: '#e2e8f0',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    opacity: finals.length ? 1 : 0.4,
                  }}
                  disabled={!finals.length}
                >
                  {manageSignedMode ? 'Done' : 'Manage'}
                </button>
              </div>
              {manageSignedMode && (
                <button
                  type="button"
                  onClick={deleteSelectedFinals}
                  disabled={!selectedFinalIds.length || actionLoading}
                  style={{
                    border: '1px solid rgba(248,113,113,0.8)',
                    color: '#fca5a5',
                    background: 'transparent',
                    borderRadius: 999,
                    padding: '6px 12px',
                    fontSize: 13,
                    cursor: !selectedFinalIds.length || actionLoading ? 'not-allowed' : 'pointer',
                    opacity: !selectedFinalIds.length || actionLoading ? 0.5 : 1,
                  }}
                >
                  Delete Selected
                </button>
              )}
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {finals.length === 0 && <p style={{ color: palette.accentMuted }}>No signed documents yet.</p>}
              {finals.map((item, idx) => {
                const downloadUrl = `${baseApi}/api/projects/${selectedProjectId}/final-artifacts/${item.envelope_id}/pdf`;
                return (
                  <div
                    key={`final-${selectedProjectId}-${item.envelope_id ?? `idx-${idx}`}-${item.sha256_final ?? 'na'}`}
                    onClick={(event) => handleCardDownload(event, downloadUrl)}
                    onMouseEnter={() => setHoveredFinalId(item.envelope_id)}
                    onMouseLeave={() => setHoveredFinalId((prev) => (prev === item.envelope_id ? null : prev))}
                    style={{
                      background:
                        selectedFinalIds.includes(item.envelope_id) && hoveredFinalId === item.envelope_id
                          ? 'rgba(56,189,248,0.25)'
                          : selectedFinalIds.includes(item.envelope_id)
                          ? 'rgba(56,189,248,0.12)'
                          : hoveredFinalId === item.envelope_id
                          ? 'rgba(248,250,252,0.08)'
                          : 'rgba(248,250,252,0.05)',
                    borderRadius: 12,
                    padding: 12,
                    display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {manageSignedMode && (
                        <input
                          type="checkbox"
                          checked={selectedFinalIds.includes(item.envelope_id)}
                          onChange={() => toggleFinalSelection(item.envelope_id)}
                        />
                      )}
                      <div>
                        <strong>{item.document_name}</strong>
                        <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>
                          Completed {new Date(item.completed_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h4 style={{ margin: 0 }}>Uploaded PDFs</h4>
                <button
                  type="button"
                  onClick={toggleUploadManage}
                  style={{
                    border: '1px solid rgba(148,163,184,0.5)',
                    background: 'transparent',
                    color: '#e2e8f0',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    opacity: documents.length ? 1 : 0.4,
                  }}
                  disabled={!documents.length}
                >
                  {manageUploadsMode ? 'Done' : 'Manage'}
                </button>
              </div>
              {manageUploadsMode && (
                <button
                  type="button"
                  onClick={deleteSelectedDocuments}
                  disabled={!selectedDocIds.length || actionLoading}
                  style={{
                    border: '1px solid rgba(248,113,113,0.8)',
                    color: '#fca5a5',
                    background: 'transparent',
                    borderRadius: 999,
                    padding: '6px 12px',
                    fontSize: 13,
                    cursor: !selectedDocIds.length || actionLoading ? 'not-allowed' : 'pointer',
                    opacity: !selectedDocIds.length || actionLoading ? 0.5 : 1,
                  }}
                >
                  Delete Selected
                </button>
              )}
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {documents.length === 0 && <p style={{ color: palette.accentMuted }}>No uploads yet.</p>}
              {documents.map((doc, idx) => {
                const downloadUrl = `${baseApi}/api/projects/${selectedProjectId}/documents/${doc.id}/pdf`;
                const selected = selectedDocIds.includes(doc.id);
                const hovered = hoveredDocId === doc.id;
                return (
                  <div
                    key={`doc-${doc.id ?? idx}`}
                    onClick={(event) => handleCardDownload(event, downloadUrl)}
                    onMouseEnter={() => setHoveredDocId(doc.id)}
                    onMouseLeave={() => setHoveredDocId((prev) => (prev === doc.id ? null : prev))}
                    style={{
                      background: selected && hovered ? 'rgba(56,189,248,0.25)' : selected ? 'rgba(56,189,248,0.12)' : hovered ? 'rgba(248,250,252,0.08)' : 'rgba(248,250,252,0.04)',
                      borderRadius: 12,
                      padding: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {manageUploadsMode && (
                      <input
                        type="checkbox"
                        checked={selectedDocIds.includes(doc.id)}
                        onChange={() => toggleDocumentSelection(doc.id)}
                      />
                    )}
                    <div>
                      <strong>{doc.filename}</strong>
                      <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>
                        Uploaded {new Date(doc.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        <section
          style={{
            borderRadius: 24,
            background: palette.panel,
            padding: 24,
            boxShadow: '0 25px 45px rgba(0,0,0,0.35)',
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
            <div style={{ display: 'flex', gap: 12 }}>
              {selectedProjectId && (
                <>
                  <button
                    type="button"
                    onClick={openInvestorModal}
                    style={{
                      border: `1px solid ${palette.accent}`,
                      color: palette.accent,
                      borderRadius: 999,
                      padding: '6px 12px',
                      fontSize: 12,
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    Add Investor
                  </button>
                <a
                  href={`/request-sign?project=${selectedProjectId}`}
                  style={{
                    border: `1px solid ${palette.accent}`,
                    color: palette.accent,
                    borderRadius: 999,
                    padding: '6px 12px',
                    fontSize: 12,
                    textDecoration: 'none',
                  }}
                >
                  Request Signatures
                </a>
                </>
              )}
            </div>
          </header>
          <div style={{ overflowY: 'auto', maxHeight: '70vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {investors.length === 0 && <p style={{ color: palette.accentMuted }}>No investors linked.</p>}
            {investors.map((investor, idx) => (
              <div
                key={`investor-${investor.id ?? idx}`}
                style={{
                  borderRadius: 12,
                  background: 'rgba(248,250,252,0.05)',
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div>
                  <strong>{investor.name}</strong>
                  <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>{investor.email}</p>
                </div>
                <span style={{ fontSize: 12, color: palette.accentMuted }}>
                  {investor.units_invested?.toLocaleString()} units
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
      {showInvestorModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            padding: '40px 24px',
            zIndex: 120,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              width: 'min(1200px, 100%)',
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 25px 55px rgba(15,23,42,0.45)',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              color: '#0f172a',
            }}
          >
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0 }}>Projects & Investors</h3>
              <button
                type="button"
                onClick={closeInvestorModal}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 22,
                  lineHeight: 1,
                  cursor: 'pointer',
                  color: '#6b7280',
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div style={{ padding: '24px 24px 12px', overflowY: 'auto' }}>
              <ProjectsPage onAnyChange={handleProjectsChange} initialProjectId={selectedProjectId ?? undefined} />
            </div>
            <div
              style={{
                padding: '12px 24px 24px',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={closeInvestorModal}
                disabled={!investorsDirty}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 24px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: investorsDirty ? 'pointer' : 'not-allowed',
                  opacity: investorsDirty ? 1 : 0.5,
                  boxShadow: investorsDirty ? '0 15px 30px rgba(37,99,235,0.35)' : 'none',
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
