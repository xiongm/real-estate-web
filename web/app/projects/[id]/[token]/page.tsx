'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

const palette = {
  bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #111827 100%)',
  panel: 'rgba(15,23,42,0.8)',
  accent: '#38bdf8',
  accentMuted: '#94a3b8',
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
    <div style={{ minHeight: '100vh', background: palette.bg, color: '#f8fafc', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: palette.accentMuted }}>Project</p>
            <h1 style={{ margin: '4px 0 0' }}>{summary?.project.name || `Project #${projectId}`}</h1>
            {summary?.project.status && <span style={{ fontSize: 12, color: palette.accentMuted }}>{summary.project.status}</span>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>Project token</p>
            <code style={{ fontSize: 12, color: palette.accentMuted }}>{token.slice(0, 8)}•••</code>
          </div>
        </header>
        <section
          style={{
            borderRadius: 24,
            background: palette.panel,
            padding: 24,
            boxShadow: '0 25px 45px rgba(0,0,0,0.35)',
            minHeight: 200,
          }}
        >
          {loading && <p>Loading project…</p>}
          {!loading && !token && <p style={{ color: palette.accentMuted }}>Missing project access token.</p>}
          {!loading && error && <p style={{ color: '#fca5a5' }}>{error}</p>}
          {!loading && summary && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h3 style={{ marginBottom: 8 }}>Signed Documents</h3>
                  {summary.signed_documents.length === 0 ? (
                    <p style={{ color: palette.accentMuted }}>No completed packets yet.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {summary.signed_documents.map((doc) => (
                        <li key={`signed-${doc.envelope_id}`}>
                          <a
                            href={`${baseApi}/api/projects/${projectId}/final-artifacts/${doc.envelope_id}/pdf?token=${token}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: palette.accent, textDecoration: 'none' }}
                          >
                            {doc.document_name || `Final packet #${doc.envelope_id}`}
                          </a>
                          <span style={{ display: 'block', fontSize: 12, color: palette.accentMuted }}>
                            Completed {new Date(doc.completed_at).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div>
                <h3 style={{ marginBottom: 8 }}>Investor Contacts</h3>
                {summary.investors.length === 0 ? (
                  <p style={{ color: palette.accentMuted }}>No investors listed.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {summary.investors.map((inv) => (
                      <div
                        key={inv.id}
                        style={{
                          borderRadius: 12,
                          border: '1px solid rgba(148,163,184,0.3)',
                          padding: 12,
                          background: 'rgba(15,23,42,0.5)',
                        }}
                      >
                        <strong>{inv.name}</strong>
                        <p style={{ margin: '4px 0 0', fontSize: 13 }}>{inv.email}</p>
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
