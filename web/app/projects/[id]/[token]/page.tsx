'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { theme } from '../../../../lib/theme';

const palette = {
  bg: 'linear-gradient(130deg, #0f172a, #111827 45%, #0b1120 95%)',
  panel: 'rgba(15,23,42,0.85)',
  accent: theme.colors.accent,
  accentMuted: theme.colors.textMuted,
  border: 'rgba(255,255,255,0.08)',
  cardShadow: '0 35px 80px rgba(2,6,23,0.65)',
};

type ProjectSummary = {
  project: { id: number; name: string; status: string };
  documents: Array<{ id: number; filename: string; created_at: string }>;
  signed_documents: Array<{ envelope_id: number; document_id: number; document_name: string; completed_at: string }>;
  investors: Array<{ id: number; name: string; email: string; units_invested: number }>;
};

type RouteParams = { id: string; token: string };

export default function ProjectViewerPage() {
  const params = useParams<RouteParams>();
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectId = useMemo(() => Number(params?.id), [params]);
  const token = params?.token || '';

  useEffect(() => {
    if (!projectId || !token) {
      setSummary(null);
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'}/api/projects/${projectId}/summary`, {
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
  }, [projectId, token]);

  const baseApi = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

  if (!projectId) {
    return <div style={{ padding: 40 }}>Invalid project id.</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: palette.bg, color: '#f8fafc', padding: '48px 24px 120px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <header
          style={{
            borderRadius: 32,
            padding: '28px 32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 24,
            background: palette.panel,
            border: `1px solid ${palette.border}`,
            boxShadow: palette.cardShadow,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 13, color: palette.accentMuted }}>Project</p>
            <h1 style={{ margin: '4px 0 0', fontSize: 28, color: '#f8fafc' }}>
              {summary?.project.name || `Project #${projectId}`}
            </h1>
            {summary?.project.status && (
              <span style={{ fontSize: 12, color: palette.accentMuted }}>{summary.project.status}</span>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>Project token</p>
            <code style={{ fontSize: 13, color: '#e2e8f0', letterSpacing: 2 }}>{token.slice(0, 8)}•••</code>
          </div>
        </header>
        <section
          style={{
            borderRadius: 28,
            background: palette.panel,
            padding: 32,
            border: `1px solid ${palette.border}`,
            boxShadow: palette.cardShadow,
            minHeight: 260,
          }}
        >
          {loading && <p>Loading project…</p>}
          {!loading && !token && <p style={{ color: palette.accentMuted }}>Missing project access token.</p>}
          {!loading && error && <p style={{ color: '#fca5a5' }}>{error}</p>}
          {!loading && summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 28 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h3 style={{ margin: 0 }}>Signed Documents</h3>
                    <span style={{ fontSize: 12, color: palette.accentMuted }}>
                      {summary.signed_documents.length || 0} completed
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 16px', color: palette.accentMuted }}>
                    Download final packets that have been fully signed.
                  </p>
                  {summary.signed_documents.length === 0 ? (
                    <p style={{ color: palette.accentMuted }}>No completed packets yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {summary.signed_documents.map((doc) => (
                        <div
                          key={`signed-${doc.envelope_id}`}
                          style={{
                            borderRadius: 16,
                            border: `1px solid ${palette.border}`,
                            padding: 16,
                            background: 'rgba(15,23,42,0.65)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 16,
                          }}
                        >
                          <div>
                            <a
                              href={`${baseApi}/api/projects/${projectId}/final-artifacts/${doc.envelope_id}/pdf?token=${token}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: palette.accent, textDecoration: 'none', fontWeight: 600 }}
                            >
                              {doc.document_name || `Final packet #${doc.envelope_id}`}
                            </a>
                            <span style={{ display: 'block', fontSize: 13, color: palette.accentMuted }}>
                              Completed {new Date(doc.completed_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h3 style={{ margin: 0 }}>Investor Contacts</h3>
                  <span style={{ fontSize: 12, color: palette.accentMuted }}>
                    {summary.investors.length || 0} investors
                  </span>
                </div>
                <p style={{ margin: '6px 0 16px', color: palette.accentMuted }}>
                  Investors invited to this project can download document updates.
                </p>
                {summary.investors.length === 0 ? (
                  <p style={{ color: palette.accentMuted }}>No investors listed.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {summary.investors.map((inv) => (
                      <div
                        key={inv.id}
                        style={{
                          borderRadius: 16,
                          border: `1px solid ${palette.border}`,
                          padding: 14,
                          background: 'rgba(15,23,42,0.65)',
                        }}
                      >
                        <strong style={{ fontSize: 15 }}>{inv.name}</strong>
                        <p style={{ margin: '6px 0 2px', fontSize: 13, color: '#e5e7eb' }}>{inv.email}</p>
                        <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>
                          {inv.units_invested?.toLocaleString()} units
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
