'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { theme } from '../../../../lib/theme';

type ProjectSummary = {
  project: {
    id: number;
    name: string;
    status: string;
    address?: string | null;
    description?: string | null;
  };
  documents: Array<{ id: number; filename: string; created_at: string }>;
  signed_documents: Array<{
    envelope_id: number;
    document_id: number;
    document_name: string;
    completed_at: string;
    sha256_final?: string | null;
  }>;
  project_files: Array<{
    id: number;
    display_name: string;
    stored_filename: string;
    uploaded_at: string;
  }>;
  investors: Array<{
    id: number;
    name: string;
    email: string;
    units_invested: number;
    mailing_address?: string | null;
    bank_name?: string | null;
    bank_account_number?: string | null;
    bank_routing_number?: string | null;
  }>;
};

type RouteParams = { id: string; token: string };

const palette = {
  page: 'var(--color-background, #f5f6fb)',
  card: 'var(--color-card, #ffffff)',
  border: 'var(--color-border, #e2e8f0)',
  text: 'var(--color-foreground, #0f172a)',
  textMuted: 'var(--color-muted, #64748b)',
  accent: theme.colors.accent,
  accentSoft: theme.colors.accentSoft,
  success: '#16a34a',
};

export default function ProjectViewerPage() {
  const params = useParams<RouteParams>();
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const projectId = useMemo(() => Number(params?.id), [params]);
  const token = params?.token || '';
  const baseApi = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

  useEffect(() => {
    if (!projectId || !token) {
      setSummary(null);
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${baseApi}/api/projects/${projectId}/summary`, {
      headers: { 'X-Access-Token': token },
      signal: abort.signal,
    })
      .then((resp) => {
        if (!resp.ok) throw new Error('Unable to load project');
        return resp.json();
      })
      .then((data) => setSummary(data))
      .catch((err) => {
        if (abort.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load project');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [baseApi, projectId, token]);

  useEffect(() => {
    const updateViewport = () => {
      if (typeof window === 'undefined') return;
      setIsMobile(window.innerWidth < 900);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const formatDateTime = (value?: string | null) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  const heroProject = summary?.project;
  const signedCount = summary?.signed_documents.length ?? 0;
  const investorCount = summary?.investors.length ?? 0;
  const totalUnitsCommitted =
    summary?.investors.reduce((sum, investor) => sum + (investor.units_invested || 0), 0) ?? 0;

  if (!projectId) {
    return <div style={{ padding: 40 }}>Invalid project id.</div>;
  }

  const renderProjectFiles = () => {
    if (!summary?.project_files.length) {
      return (
        <div
          style={{
            padding: 28,
            borderRadius: 16,
            border: `1px dashed ${palette.border}`,
            color: palette.textMuted,
            textAlign: 'center',
            background: palette.card,
          }}
        >
          No supporting documents yet.
        </div>
      );
    }
    return summary.project_files.map((file) => {
      const ext =
        (file.display_name || file.stored_filename || '')
          .split('.')
          .pop()
          ?.toUpperCase() || 'FILE';
      const downloadUrl = `${baseApi}/api/projects/${projectId}/files/${file.id}/download?token=${token}`;
      return (
        <a
          key={`file-${file.id}`}
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          className="project-card-link"
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: 16,
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: palette.card,
            textDecoration: 'none',
            color: palette.text,
            transition: 'border 0.2s ease, box-shadow 0.2s ease',
          }}
        >
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
              width="22"
              height="22"
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
            <p style={{ margin: 0, fontWeight: 600 }}>{file.display_name}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', color: palette.textMuted, fontSize: 13 }}>
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
              <span>Uploaded {formatDateTime(file.uploaded_at)}</span>
            </div>
          </div>
        </a>
      );
    });
  };

  const renderSignedDocuments = () => {
    if (!summary?.signed_documents.length) {
      return (
        <div
          style={{
            padding: 28,
            borderRadius: 16,
            border: `1px dashed ${palette.border}`,
            color: palette.textMuted,
            textAlign: 'center',
            background: palette.card,
          }}
        >
          No completed packets yet.
        </div>
      );
    }
    return summary.signed_documents.map((doc) => {
      const downloadUrl = `${baseApi}/api/projects/${projectId}/final-artifacts/${doc.envelope_id}/pdf?token=${token}`;
      return (
        <a
          key={`signed-${doc.envelope_id}`}
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          className="project-card-link"
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: 16,
            padding: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: palette.card,
            textDecoration: 'none',
            color: palette.text,
            transition: 'border 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: '#ecfccb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: palette.success,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{doc.document_name || `Final packet #${doc.envelope_id}`}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: palette.textMuted }}>
              <span
                style={{
                  padding: '2px 10px',
                  borderRadius: 999,
                  background: '#dcfce7',
                  color: '#166534',
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                }}
              >
                Completed
              </span>
              <span>•</span>
              <span>Signed {formatDateTime(doc.completed_at)}</span>
            </div>
            {doc.sha256_final && (
              <code
                style={{
                  display: 'inline-block',
                  marginTop: 6,
                  padding: '4px 8px',
                  borderRadius: 8,
                  background: '#f1f5f9',
                  fontSize: 11,
                  color: '#475569',
                }}
              >
                SHA256 {doc.sha256_final.slice(0, 16)}…
              </code>
            )}
          </div>
        </a>
      );
    });
  };

  const renderInvestors = () => {
    if (!summary?.investors.length) {
      return (
        <div
          style={{
            padding: 28,
            borderRadius: 16,
            border: `1px dashed ${palette.border}`,
            color: palette.textMuted,
            textAlign: 'center',
            background: palette.card,
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
          key={`investor-${inv.id}`}
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: 16,
            padding: 16,
            background: palette.card,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
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
                #{projectId}
              </span>
              {token && (
                <span
                  style={{
                    padding: '6px 14px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.08)',
                    fontSize: 12,
                    letterSpacing: 0.5,
                    fontFamily: 'SFMono-Regular, Menlo, Consolas, monospace',
                  }}
                >
                  Token {token.slice(0, 6)}…
                </span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: isMobile ? 28 : 40,
                    fontWeight: 700,
                    letterSpacing: '-0.5px',
                    color: '#fff',
                    textShadow: '0 6px 20px rgba(2,6,23,0.65)',
                  }}
                >
                  {heroProject?.name || 'Project overview'}
                </h1>
                {heroProject?.description ? (
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', maxWidth: 560 }}>{heroProject.description}</p>
                ) : (
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.82)', maxWidth: 520 }}>
                    Review finalized packets and shared documents from the sponsor.
                  </p>
                )}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14, color: 'rgba(255,255,255,0.9)' }}>
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
                    {heroProject?.address ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(heroProject.address)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#fff', textDecoration: 'underline', textUnderlineOffset: 3 }}
                      >
                        {heroProject.address}
                      </a>
                    ) : (
                      `${investorCount} investor${investorCount === 1 ? '' : 's'} participating`
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div style={{ minHeight: '100vh', background: palette.page, color: palette.text }}>
      {heroSection}
      <main
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: isMobile ? '24px 16px 64px' : '56px 32px 96px',
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <style jsx global>{`
          .project-card-link:hover,
          .project-card-link:focus-visible {
            border-color: ${theme.colors.accent};
            box-shadow: 0 18px 32px rgba(37, 99, 235, 0.15);
          }
        `}</style>
        {error && (
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              border: '1px solid rgba(248,113,113,0.5)',
              background: '#fef2f2',
              color: '#b91c1c',
            }}
          >
            {error}
          </div>
        )}
        {!token && (
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              border: `1px dashed ${palette.border}`,
              background: palette.card,
              color: palette.textMuted,
            }}
          >
            Missing project access token.
          </div>
        )}
        {loading ? (
          <div
            style={{
              padding: 48,
              borderRadius: 24,
              border: `1px dashed ${palette.border}`,
              background: palette.card,
              textAlign: 'center',
              color: palette.textMuted,
            }}
          >
            Loading project…
          </div>
        ) : summary ? (
          <>
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit,minmax(220px,1fr))',
                gap: 16,
              }}
            >
              <div
                style={{
                  borderRadius: 20,
                  background: palette.card,
                  border: `1px solid ${palette.border}`,
                  padding: 20,
                  boxShadow: '0 18px 32px rgba(15,23,42,0.05)',
                }}
              >
                <p style={{ margin: 0, color: palette.textMuted, fontSize: 13 }}>Signed packets</p>
                <h3 style={{ margin: '6px 0 0', fontSize: 28 }}>{signedCount}</h3>
              </div>
              <div
                style={{
                  borderRadius: 20,
                  background: palette.card,
                  border: `1px solid ${palette.border}`,
                  padding: 20,
                  boxShadow: '0 18px 32px rgba(15,23,42,0.05)',
                }}
              >
                <p style={{ margin: 0, color: palette.textMuted, fontSize: 13 }}>Committed shares</p>
                <h3 style={{ margin: '6px 0 0', fontSize: 28 }}>
                  {totalUnitsCommitted.toLocaleString()}
                </h3>
              </div>
              <div
                style={{
                  borderRadius: 20,
                  background: palette.card,
                  border: `1px solid ${palette.border}`,
                  padding: 20,
                  boxShadow: '0 18px 32px rgba(15,23,42,0.05)',
                }}
              >
                <p style={{ margin: 0, color: palette.textMuted, fontSize: 13 }}>Investors</p>
                <h3 style={{ margin: '6px 0 0', fontSize: 28 }}>{investorCount}</h3>
              </div>
            </section>

            <section
              style={{
                borderRadius: 24,
                border: `1px solid ${palette.border}`,
                background: palette.card,
                padding: 28,
                boxShadow: '0 18px 32px rgba(15,23,42,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Signed documents</h3>
                <p style={{ margin: '4px 0 0', color: palette.textMuted }}>
                  Completed packets sealed by every signer. Click to download.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{renderSignedDocuments()}</div>
            </section>

            <section
              style={{
                borderRadius: 24,
                border: `1px solid ${palette.border}`,
                background: palette.card,
                padding: 28,
                boxShadow: '0 18px 32px rgba(15,23,42,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Project documents</h3>
                <p style={{ margin: '4px 0 0', color: palette.textMuted }}>
                  Reference files shared by the sponsor for this project.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{renderProjectFiles()}</div>
            </section>

            <section
              style={{
                borderRadius: 24,
                border: `1px solid ${palette.border}`,
                background: palette.card,
                padding: 28,
                boxShadow: '0 18px 32px rgba(15,23,42,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Investor contacts</h3>
                <p style={{ margin: '4px 0 0', color: palette.textMuted }}>Contact information for investors in this project.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{renderInvestors()}</div>
            </section>
          </>
        ) : (
          <div
            style={{
              padding: 48,
              borderRadius: 24,
              border: `1px dashed ${palette.border}`,
              background: palette.card,
              textAlign: 'center',
              color: palette.textMuted,
            }}
          >
            Select a valid project link to view its documents.
          </div>
        )}
      </main>
    </div>
  );
}
