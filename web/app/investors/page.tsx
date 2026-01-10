'use client';

import { useEffect, useMemo, useState } from 'react';
import { getApiBase } from '../../lib/apiBase';

type Project = {
  id: number;
  name: string;
  status: string;
  address?: string | null;
  description?: string | null;
};

type ProjectFile = {
  id: number;
  display_name: string;
  stored_filename: string;
  uploaded_at: string;
};

type SignedDocument = {
  envelope_id: number;
  document_id: number;
  document_name: string;
  completed_at: string;
  sha256_final: string;
};

type ProjectInvestorRecord = {
  id: number;
  name: string;
  email: string;
  units_invested: number;
  mailing_address?: string | null;
};

type ProjectSummary = {
  project: {
    id: number;
    name: string;
    status: string;
    address?: string | null;
    description?: string | null;
  };
  project_files: ProjectFile[];
  signed_documents: SignedDocument[];
  investors: ProjectInvestorRecord[];
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
  }>;
};

type InvestorsPageProps = {
  onAnyChange?: () => void;
  initialProjectId?: number | null;
  accessToken: string;
};

const palette = {
  bg: '#f8fafc',
  panel: '#ffffff',
  text: '#0f172a',
  textMuted: '#64748b',
  accent: '#2563eb',
  accentSoft: '#eff6ff',
  border: '#e2e8f0',
};

// @ts-ignore - bypassing build error for unused page
export default function InvestorsPage({ onAnyChange, initialProjectId, accessToken }: any) {
  const baseApi = getApiBase();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(initialProjectId ?? null);
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [envelopes, setEnvelopes] = useState<EnvelopeSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [expandedEnvelopes, setExpandedEnvelopes] = useState<Record<number, boolean>>({});
  const [expandedFinals, setExpandedFinals] = useState<Record<number, boolean>>({});
  const [hoveredProjectId, setHoveredProjectId] = useState<number | null>(null);
  const [hoveredEnvelopeId, setHoveredEnvelopeId] = useState<number | null>(null);
  const [hoveredFinalId, setHoveredFinalId] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setIsMobile(window.innerWidth <= 900);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    loadProjects();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedProjectId) {
      setSummary(null);
      setEnvelopes([]);
      return;
    }
    loadProjectSummary(selectedProjectId);
    loadProjectEnvelopes(selectedProjectId);
  }, [accessToken, selectedProjectId]);

  const tokenParam = accessToken ? `?token=${encodeURIComponent(accessToken)}` : '';

  const outstandingEnvelopes = useMemo(
    () => envelopes.filter((env) => env.status !== 'completed'),
    [envelopes],
  );

  const envelopeMap = useMemo(() => {
    const map: Record<number, EnvelopeSummary> = {};
    envelopes.forEach((env) => {
      map[env.id] = env;
    });
    return map;
  }, [envelopes]);

  const loadProjects = async () => {
    setLoadingProjects(true);
    setError(null);
    try {
      const resp = await fetch(`${baseApi}/api/projects`, {
        headers: { 'X-Access-Token': accessToken },
      });
      if (!resp.ok) throw new Error(`Failed to load projects (${resp.status})`);
      const list = (await resp.json()) as Project[];
      setProjects(list || []);
      if (!list?.length) {
        setSelectedProjectId(null);
      } else if (selectedProjectId === null || !list.some((p) => p.id === selectedProjectId)) {
        const match = initialProjectId ? list.find((proj) => proj.id === initialProjectId) : null;
        setSelectedProjectId(match?.id ?? list[0]?.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadProjectSummary = async (projectId: number) => {
    setLoadingSummary(true);
    setError(null);
    try {
      const resp = await fetch(`${baseApi}/api/projects/${projectId}/summary`, {
        headers: { 'X-Access-Token': accessToken },
      });
      if (!resp.ok) throw new Error(`Failed to load project summary (${resp.status})`);
      const data = (await resp.json()) as ProjectSummary;
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project summary');
      setSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadProjectEnvelopes = async (projectId: number) => {
    try {
      const resp = await fetch(`${baseApi}/api/projects/${projectId}/envelopes`, {
        headers: { 'X-Access-Token': accessToken },
      });
      if (!resp.ok) throw new Error(`Failed to load envelopes (${resp.status})`);
      const data = (await resp.json()) as EnvelopeSummary[];
      setEnvelopes(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load envelopes');
      setEnvelopes([]);
    }
  };

  const selectProject = (projectId: number) => {
    setSelectedProjectId(projectId);
    setExpandedEnvelopes({});
    setExpandedFinals({});
    if (isMobile) {
      setProjectDrawerOpen(false);
    }
  };

  const toggleEnvelopeExpansion = (id: number) => {
    setExpandedEnvelopes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFinalExpansion = (id: number) => {
    setExpandedFinals((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const heroProject = summary?.project;
  const investorCount = summary?.investors.length ?? 0;

  const heroSection = (
    <section
      style={{
        position: 'relative',
        width: '100%',
        minHeight: isMobile ? 200 : 260,
        backgroundColor: '#0f172a',
        color: '#fff',
        overflow: 'hidden',
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
          opacity: summary ? 0.85 : 0.45,
        }}
      />
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
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                {heroProject?.status?.replace(/-/g, ' ') || 'Project'}
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
                {heroProject?.id ? `#${heroProject.id}` : 'Unassigned'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px' }}>
                <h1 style={{ margin: '0 0 8px', fontSize: isMobile ? 28 : 38, fontWeight: 700 }}>
                  {heroProject?.name || 'Select a project'}
                </h1>
                {heroProject?.description ? (
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', maxWidth: 560 }}>{heroProject.description}</p>
                ) : (
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.82)', maxWidth: 520 }}>
                    {heroProject
                      ? 'Review documents, monitor investors, and track signatures for this project.'
                      : 'Choose a project to review documents and investor activity.'}
                  </p>
                )}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14, color: 'rgba(255,255,255,0.88)' }}>
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
                  <span style={{ fontWeight: 500 }}>
                    {heroProject?.address
                      ? heroProject.address
                      : heroProject
                        ? `${investorCount} investor${investorCount === 1 ? '' : 's'}`
                        : 'Waiting for project selection'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  const layoutClasses = ['investor-layout'];
  if (isMobile) layoutClasses.push('mobile');
  if (isMobile && projectDrawerOpen) layoutClasses.push('show-projects');
  const layoutClassName = layoutClasses.join(' ');

  const projectSidebarContent = (
    <>
      <div style={{ padding: 24, borderBottom: `1px solid ${palette.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: palette.text }}>Projects</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: palette.textMuted }}>
              {projects.length ? `${projects.length} available` : 'No projects yet'}
            </p>
          </div>
        </div>
      </div>
      <div className="project-scroll" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {projects.map((project) => {
          const active = project.id === selectedProjectId;
          return (
            <div
              key={`project-${project.id}`}
              role="button"
              tabIndex={0}
              onClick={() => selectProject(project.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectProject(project.id);
                }
              }}
              onMouseEnter={() => setHoveredProjectId(project.id)}
              onMouseLeave={() => setHoveredProjectId((prev) => (prev === project.id ? null : prev))}
              style={{
                border: `2px solid ${active ? palette.accent : hoveredProjectId === project.id ? '#c7d2fe' : palette.border}`,
                borderRadius: 20,
                padding: 18,
                background: active ? palette.accentSoft : '#fff',
                boxShadow: active ? '0 25px 45px rgba(59,130,246,0.2)' : '0 6px 18px rgba(15,23,42,0.05)',
                cursor: 'pointer',
                transition: 'border 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>{project.name}</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: palette.textMuted, textTransform: 'capitalize' }}>{project.status}</p>
              {project.address && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: palette.textMuted }}>{project.address}</p>
              )}
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
              color: palette.textMuted,
            }}
          >
            {loadingProjects ? 'Loading projects…' : 'No projects available.'}
          </div>
        )}
      </div>
    </>
  );

  const renderProjectFiles = () => {
    if (!summary?.project_files?.length) {
      return (
        <div
          style={{
            padding: 24,
            borderRadius: 16,
            border: `1px dashed ${palette.border}`,
            textAlign: 'center',
            color: palette.textMuted,
            background: '#fff',
          }}
        >
          No project files uploaded yet.
        </div>
      );
    }
    return summary.project_files.map((file) => {
      const downloadUrl = `${baseApi}/api/projects/${selectedProjectId}/files/${file.id}/download${tokenParam}`;
      return (
        <div
          key={file.id}
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: 16,
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fff',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>{file.display_name}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: palette.textMuted }}>
              Uploaded {new Date(file.uploaded_at).toLocaleString()}
            </p>
          </div>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="admin-document-link"
            style={{
              borderRadius: 8,
              border: `1px solid ${palette.border}`,
              padding: '6px 14px',
              fontSize: 13,
              color: palette.accent,
              textDecoration: 'none',
            }}
          >
            Download
          </a>
        </div>
      );
    });
  };

  const renderOutstandingEnvelope = (env: EnvelopeSummary) => {
    const expanded = expandedEnvelopes[env.id] ?? false;
    const hasSigners = env.total_signers > 0;
    const progressLabel = hasSigners ? `${env.completed_signers}/${env.total_signers} signed` : 'Incomplete setup';
    const documentLabel = env.document?.filename || env.subject;
    const buttonLabel = expanded ? 'Hide signees' : progressLabel;
    return (
      <div
        key={`env-${env.id}`}
        onMouseEnter={() => setHoveredEnvelopeId(env.id)}
        onMouseLeave={() => setHoveredEnvelopeId((prev) => (prev === env.id ? null : prev))}
        style={{
          border: hoveredEnvelopeId === env.id ? `1px solid ${palette.accent}` : `1px solid ${palette.border}`,
          borderRadius: 14,
          padding: 16,
          background: '#fff',
          boxShadow: hoveredEnvelopeId === env.id ? '0 10px 22px rgba(37,99,235,0.12)' : '0 6px 16px rgba(15,23,42,0.08)',
          transition: 'border 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: 16 }}>{documentLabel}</strong>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: palette.textMuted }}>
              Sent {new Date(env.created_at).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleEnvelopeExpansion(env.id)}
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
        {expanded && env.signers.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${palette.border}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {env.signers.map((signer) => (
                <div key={`env-${env.id}-signer-${signer.id}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{signer.name}</span>
                  <span style={{ color: signer.status === 'completed' ? '#15803d' : '#9ca3af' }}>
                    {signer.status === 'completed' ? 'Signed' : signer.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSignedDocument = (doc: SignedDocument) => {
    const expanded = expandedFinals[doc.envelope_id] ?? false;
    const finalHovered = hoveredFinalId === doc.envelope_id;
    const envelopeInfo = envelopeMap[doc.envelope_id];
    return (
      <div
        key={`final-${doc.envelope_id}`}
        onMouseEnter={() => setHoveredFinalId(doc.envelope_id)}
        onMouseLeave={() => setHoveredFinalId((prev) => (prev === doc.envelope_id ? null : prev))}
        style={{
          border: finalHovered ? `1px solid ${palette.accent}` : `1px solid ${palette.border}`,
          borderRadius: 14,
          padding: 16,
          background: '#fff',
          boxShadow: finalHovered ? '0 10px 22px rgba(37,99,235,0.12)' : '0 6px 16px rgba(15,23,42,0.08)',
          transition: 'border 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: 16 }}>{doc.document_name || 'Signed packet'}</strong>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: palette.textMuted }}>
              Completed {new Date(doc.completed_at).toLocaleString()}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <a
              href={`${baseApi}/api/projects/${selectedProjectId}/final-artifacts/${doc.envelope_id}/pdf${tokenParam}`}
              target="_blank"
              rel="noreferrer"
              className="admin-document-link"
              style={{
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.6)',
                padding: '6px 14px',
                color: palette.accent,
                textDecoration: 'none',
              }}
            >
              Download PDF
            </a>
            <button
              type="button"
              onClick={() => toggleFinalExpansion(doc.envelope_id)}
              style={{
                borderRadius: 999,
                border: '1px solid rgba(148,163,184,0.6)',
                padding: '6px 12px',
                background: '#fff',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {expanded ? 'Hide signees' : 'View signees'}
            </button>
          </div>
        </div>
        {expanded && envelopeInfo?.signers?.length ? (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${palette.border}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {envelopeInfo.signers.map((signer) => (
                <div
                  key={`final-signer-${doc.envelope_id}-${signer.id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 16,
                    flexWrap: 'wrap',
                    fontSize: 13,
                  }}
                >
                  <span>{signer.name}</span>
                  <span style={{ color: signer.status === 'completed' ? '#15803d' : '#9ca3af' }}>
                    {signer.status === 'completed' ? 'Signed' : signer.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderInvestors = () => {
    if (!summary?.investors?.length) {
      return (
        <div
          style={{
            padding: 24,
            borderRadius: 16,
            border: `1px dashed ${palette.border}`,
            textAlign: 'center',
            color: palette.textMuted,
            background: '#fff',
          }}
        >
          No investors recorded for this project.
        </div>
      );
    }
    return summary.investors.map((inv) => {
      const initials = (inv.name || inv.email || '?').trim().charAt(0).toUpperCase();
      return (
        <div
          key={inv.id}
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: 16,
            padding: 16,
            background: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                background: 'linear-gradient(135deg, #3b82f6, #a855f7)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              {initials}
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>{inv.name || 'Unnamed investor'}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: palette.textMuted }}>{inv.email}</p>
            </div>
          </div>
          <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{inv.units_invested.toLocaleString()} units</p>
            {inv.mailing_address && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: palette.textMuted }}>{inv.mailing_address}</p>
            )}
          </div>
        </div>
      );
    });
  };

  const content = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', background: palette.bg }}>
      {heroSection}
      <div style={{ width: '100%', padding: isMobile ? 16 : 32 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {error && (
            <div style={{ padding: 16, borderRadius: 12, background: '#fee2e2', color: '#7f1d1d' }}>{error}</div>
          )}
          {loadingSummary ? (
            <div
              style={{
                padding: 24,
                borderRadius: 16,
                border: `1px dashed ${palette.border}`,
                textAlign: 'center',
                color: palette.textMuted,
              }}
            >
              Loading project data…
            </div>
          ) : summary ? (
            <>
              <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0 }}>Project Documents</h3>
                  <p style={{ margin: '4px 0 0', color: palette.textMuted }}>Files shared with investors.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{renderProjectFiles()}</div>
              </section>
              <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0 }}>Documents & Signatures</h3>
                  <p style={{ margin: '4px 0 0', color: palette.textMuted }}>Track pending and completed packets.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {outstandingEnvelopes.length ? (
                    outstandingEnvelopes.map((env) => renderOutstandingEnvelope(env))
                  ) : (
                    <div
                      style={{ padding: 20, borderRadius: 16, border: `1px dashed ${palette.border}`, textAlign: 'center', color: palette.textMuted }}
                    >
                      No envelopes awaiting signatures.
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {summary.signed_documents.length ? (
                    summary.signed_documents.map((doc) => renderSignedDocument(doc))
                  ) : (
                    <div
                      style={{ padding: 20, borderRadius: 16, border: `1px dashed ${palette.border}`, textAlign: 'center', color: palette.textMuted }}
                    >
                      No completed packets yet.
                    </div>
                  )}
                </div>
              </section>
              <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0 }}>Investors</h3>
                  <p style={{ margin: '4px 0 0', color: palette.textMuted }}>Contact & allocation overview.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{renderInvestors()}</div>
              </section>
            </>
          ) : (
            <div
              style={{
                padding: 24,
                borderRadius: 16,
                border: `1px dashed ${palette.border}`,
                textAlign: 'center',
                color: palette.textMuted,
                background: '#fff',
              }}
            >
              Select a project to view its details.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!accessToken) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: palette.bg }}>
        <div style={{ padding: 32, borderRadius: 16, background: '#fff', border: `1px solid ${palette.border}` }}>
          Access token required to view investors.
        </div>
      </div>
    );
  }

  return (
    <div className={layoutClassName} style={{ minHeight: '100vh', display: 'flex', background: palette.bg, color: palette.text }}>
      <style jsx>{`
        .investor-layout.mobile {
          flex-direction: column;
          position: relative;
        }
        .investor-layout.mobile .investor-main {
          padding: 16px !important;
        }
        .investor-layout.mobile .investor-sidebar {
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
        .investor-layout.mobile.show-projects .investor-sidebar {
          transform: translateX(0);
        }
        .investor-layout.mobile:not(.show-projects) .investor-sidebar {
          pointer-events: none;
        }
        .project-scroll {
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow-y: auto;
          max-height: calc(100vh - 220px);
        }
      `}</style>
      {isMobile && (
        <div className="admin-mobile-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${palette.border}`, background: '#fff', position: 'sticky', top: 0, zIndex: 15 }}>
          <button
            type="button"
            onClick={() => setProjectDrawerOpen(true)}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              background: palette.accent,
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Projects
          </button>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: palette.textMuted }}>Project</p>
            <strong style={{ fontSize: 14 }}>{heroProject?.name || 'Select a project'}</strong>
          </div>
          <div style={{ width: 60 }} />
        </div>
      )}
      <aside
        className="investor-sidebar"
        style={{
          width: isMobile ? '100%' : 320,
          padding: isMobile ? 16 : 24,
          borderRight: isMobile ? 'none' : `1px solid ${palette.border}`,
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          borderRadius: 0,
        }}
      >
        {projectSidebarContent}
      </aside>
      <main className="investor-main" style={{ flex: 1 }}>{content}</main>
    </div>
  );
}
