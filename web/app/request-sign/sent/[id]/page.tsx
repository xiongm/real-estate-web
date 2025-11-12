'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';

type EnvelopeSummary = {
  id: number;
  subject: string;
  document?: { id: number; filename: string };
  signers: Array<{ id: number; name: string; email: string }>;
};

export default function EnvelopeSentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const envelopeId = params?.id;
  const baseApi = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
  const [summary, setSummary] = useState<EnvelopeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState('');
  const [needsToken, setNeedsToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('adminAccessToken');
    if (saved) {
      setAdminToken(saved);
    }
  }, []);

  useEffect(() => {
    if (!envelopeId) return;
    if (!adminToken) {
      setNeedsToken(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNeedsToken(false);
    fetch(`${baseApi}/api/envelopes/${envelopeId}`, {
      headers: { 'X-Access-Token': adminToken },
    })
      .then((resp) => {
        if (resp.status === 401 || resp.status === 403) {
          if (!cancelled) {
            setNeedsToken(true);
            setTokenError('Access token required.');
            setSummary(null);
            setAdminToken('');
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem('adminAccessToken');
            }
          }
          throw new Error('Access token required');
        }
        if (!resp.ok) throw new Error(`Unable to load envelope (${resp.status})`);
        return resp.json();
      })
      .then((data) => {
        if (!cancelled) {
          setSummary(data);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load envelope');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [envelopeId, baseApi, adminToken]);

  const submitToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = tokenInput.trim();
    if (!candidate) {
      setTokenError('Token required');
      return;
    }
    setAdminToken(candidate);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('adminAccessToken', candidate);
    }
    setTokenError(null);
    setTokenInput('');
  };

  const goBack = () => router.replace('/admin');

  if (!envelopeId) {
    return <div style={{ padding: 32 }}>Missing envelope ID.</div>;
  }

  const documentName = summary?.document?.filename || 'Document';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Envelope sent</p>
          <strong style={{ fontSize: 20 }}>{documentName}</strong>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Envelope</p>
          <strong style={{ fontSize: 16 }}>#{envelopeId}</strong>
        </div>
      </header>
      <div style={{ flex: 1, padding: 48, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        <div
          style={{
            maxWidth: 640,
            width: '100%',
            padding: 32,
            borderRadius: 16,
            background: '#f8fbff',
            border: '1px solid #dbeafe',
            textAlign: 'center',
          }}
        >
          {needsToken ? (
            <form onSubmit={submitToken} style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
              <h2 style={{ margin: 0 }}>Admin access required</h2>
              <p style={{ fontSize: 14, color: '#475569' }}>Enter the admin access token to view this envelope summary.</p>
              <input
                type="password"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="Admin token"
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                }}
              />
              {tokenError && <span style={{ color: '#b91c1c', fontSize: 13 }}>{tokenError}</span>}
              <button
                type="submit"
                style={{
                  alignSelf: 'flex-start',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 999,
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Continue
              </button>
            </form>
          ) : error ? (
            <p style={{ color: '#b91c1c' }}>{error}</p>
          ) : loading ? (
            <p>Loading summary…</p>
          ) : (
            <>
              <h1 style={{ fontSize: 26, marginBottom: 8 }}>Emails are on the way</h1>
              <p style={{ fontSize: 15, color: '#475569', marginBottom: 24 }}>
                We sent signing links to all recipients below. You can monitor progress from the project dashboard.
              </p>
              <div style={{ textAlign: 'left', marginBottom: 24 }}>
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Recipients</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {summary?.signers.map((signer) => (
                    <li
                      key={signer.id}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        background: '#fff',
                      }}
                    >
                      <strong style={{ display: 'block' }}>{signer.name}</strong>
                      <span style={{ fontSize: 13, color: '#475569' }}>{signer.email}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={goBack}
            style={{
              marginTop: 8,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 999,
              padding: '12px 28px',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back to Admin
          </button>
        </div>
      </div>
    </div>
  );
}
