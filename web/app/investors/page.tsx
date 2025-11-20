'use client';

import { useEffect, useState } from 'react';

type Project = {
  id: number;
  name: string;
  tenant_id: number;
  status: string;
};

type ProjectInvestor = {
  id: number;
  name: string;
  email: string;
  units_invested: number;
  role: string;
  routing_order: number;
  mailing_address?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_routing_number?: string | null;
};

type InvestorsPageProps = {
  onAnyChange?: () => void;
  initialProjectId?: number | null;
  accessToken: string;
};

export default function InvestorsPage({ onAnyChange, initialProjectId, accessToken }: InvestorsPageProps) {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [investors, setInvestors] = useState<ProjectInvestor[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingInvestors, setLoadingInvestors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newInvestor, setNewInvestor] = useState({
    name: '',
    email: '',
    units: 0,
    mailing: '',
    bankName: '',
    bankAccount: '',
    bankRouting: '',
  });

  useEffect(() => {
    if (!accessToken) return;
    refreshProjects();
  }, [accessToken]);

  const signalChange = () => {
    onAnyChange?.();
  };

  const refreshProjects = async () => {
    if (!accessToken) return;
    setLoadingProjects(true);
    setError(null);
    try {
      const resp = await fetch(`${base}/api/projects`, {
        headers: { 'X-Access-Token': accessToken },
      });
      if (!resp.ok) throw new Error(`Failed to load projects (${resp.status})`);
      const list = await resp.json();
      setProjects(list || []);
      if (list?.length) {
        const match = initialProjectId ? list.find((project) => project.id === initialProjectId) : null;
        if (match) {
          selectProject(match);
        } else if (!selectedProject) {
          selectProject(list[0]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  };

  const selectProject = (project: Project) => {
    setSelectedProject(project);
    refreshInvestors(project.id);
  };

  const refreshInvestors = async (projectId: number) => {
    if (!accessToken) return;
    setLoadingInvestors(true);
    setError(null);
    try {
      const resp = await fetch(`${base}/api/projects/${projectId}/investors`, {
        headers: { 'X-Access-Token': accessToken },
      });
      if (!resp.ok) throw new Error(`Failed to load investors (${resp.status})`);
      const list = await resp.json();
      setInvestors(list || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load investors');
    } finally {
      setLoadingInvestors(false);
    }
  };

  const handleInvestorCreate = async () => {
    if (!selectedProject) {
      setError('Select a project first');
      return;
    }
    if (!newInvestor.name.trim() || !newInvestor.email.trim()) {
      setError('Investor name/email required');
      return;
    }
    try {
      setLoadingInvestors(true);
      const resp = await fetch(`${base}/api/projects/${selectedProject.id}/investors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Token': accessToken,
        },
        body: JSON.stringify({
          name: newInvestor.name,
          email: newInvestor.email,
          units_invested: Number(newInvestor.units) || 0,
          mailing_address: newInvestor.mailing.trim(),
          bank_name: newInvestor.bankName.trim(),
          bank_account_number: newInvestor.bankAccount.trim(),
          bank_routing_number: newInvestor.bankRouting.trim(),
        }),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(detail || 'Failed to create investor');
      }
      setNewInvestor({ name: '', email: '', units: 0, mailing: '', bankName: '', bankAccount: '', bankRouting: '' });
      await refreshInvestors(selectedProject.id);
      signalChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create investor');
    } finally {
      setLoadingInvestors(false);
    }
  };

  const handleInvestorDelete = async (investorId: number) => {
    if (!selectedProject) return;
    const confirmed = window.confirm('Remove this investor from the project?');
    if (!confirmed) return;
    try {
      setLoadingInvestors(true);
      const resp = await fetch(`${base}/api/projects/${selectedProject.id}/investors/${investorId}`, {
        method: 'DELETE',
        headers: { 'X-Access-Token': accessToken },
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(detail || 'Failed to delete investor');
      }
      await refreshInvestors(selectedProject.id);
      signalChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete investor');
    } finally {
      setLoadingInvestors(false);
    }
  };

  useEffect(() => {
    if (!initialProjectId || !projects.length) return;
    const match = projects.find((project) => project.id === initialProjectId);
    if (match && match.id !== selectedProject?.id) {
      selectProject(match);
    }
  }, [initialProjectId, projects]);

  const exportCsv = () => {
    if (!investors.length) return;
    const headers = ['Name', 'Email', 'Units', 'Mailing Address', 'Bank Name', 'Account Number', 'Routing Number'];
    const rows = investors.map((inv) => [
      inv.name,
      inv.email,
      inv.units_invested?.toString() ?? '',
      inv.mailing_address ?? '',
      inv.bank_name ?? '',
      inv.bank_account_number ?? '',
      inv.bank_routing_number ?? '',
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `investors-${selectedProject?.name ?? 'project'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <main style={{ display: 'flex', gap: 24 }}>
      <section style={{ flex: '0 0 280px', borderRight: '1px solid #eee', paddingRight: 16 }}>
        <h2>Project</h2>
        {loadingProjects ? (
          <p>Loading project…</p>
        ) : selectedProject ? (
          <div style={{ lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}><strong>Name:</strong> {selectedProject.name}</p>
            <p style={{ margin: 0 }}><strong>ID:</strong> #{selectedProject.id}</p>
            {selectedProject.status && <p style={{ margin: 0 }}><strong>Status:</strong> {selectedProject.status}</p>}
          </div>
        ) : (
          <p>No project selected.</p>
        )}
        <p style={{ marginTop: 16, fontSize: 13, color: '#606060' }}>
          Projects are managed in Admin. This panel only shows investors for the active project.
        </p>
      </section>

      <section style={{ flex: '1 1 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0 }}>Investors</h2>
          {investors.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              style={{
                border: '1px solid #2563eb',
                borderRadius: 999,
                padding: '6px 14px',
                background: '#2563eb',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Export CSV
            </button>
          )}
        </div>
        {!selectedProject ? (
          <p>{accessToken ? 'Select a project to view investors.' : 'Admin token required.'}</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Investor name"
                value={newInvestor.name}
                onChange={(e) => setNewInvestor((prev) => ({ ...prev, name: e.target.value }))}
                style={{ flex: '1 1 160px', padding: 6 }}
              />
              <input
                type="email"
                placeholder="Email"
                value={newInvestor.email}
                onChange={(e) => setNewInvestor((prev) => ({ ...prev, email: e.target.value }))}
                style={{ flex: '1 1 200px', padding: 6 }}
              />
            <input
              type="number"
              placeholder="Units (e.g. 10000)"
              value={newInvestor.units}
              onChange={(e) => setNewInvestor((prev) => ({ ...prev, units: Number(e.target.value) }))}
              style={{ width: 120, padding: 6, MozAppearance: 'textfield' }}
              className="no-spinner"
            />
            <textarea
              placeholder="Mailing address"
              value={newInvestor.mailing}
              onChange={(e) => setNewInvestor((prev) => ({ ...prev, mailing: e.target.value }))}
              style={{ flex: '1 1 100%', padding: 6, minHeight: 60, resize: 'vertical' }}
            />
            <input
              type="text"
              placeholder="Bank name"
              value={newInvestor.bankName}
              onChange={(e) => setNewInvestor((prev) => ({ ...prev, bankName: e.target.value }))}
              style={{ flex: '1 1 160px', padding: 6 }}
            />
            <input
              type="text"
              placeholder="Account number"
              value={newInvestor.bankAccount}
              onChange={(e) => setNewInvestor((prev) => ({ ...prev, bankAccount: e.target.value }))}
              style={{ flex: '1 1 160px', padding: 6 }}
            />
            <input
              type="text"
              placeholder="Routing number"
              value={newInvestor.bankRouting}
              onChange={(e) => setNewInvestor((prev) => ({ ...prev, bankRouting: e.target.value }))}
              style={{ flex: '1 1 160px', padding: 6 }}
            />
              <button type="button" onClick={handleInvestorCreate} disabled={loadingInvestors}>
                + Add investor
              </button>
            </div>
            {loadingInvestors ? (
              <p>Loading investors…</p>
            ) : !investors.length ? (
              <p>No investors yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Units</th>
                    <th>Mailing</th>
                    <th>Bank details</th>
                    <th>Role</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {investors.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td>{inv.name}</td>
                      <td>{inv.email}</td>
                      <td>{inv.units_invested}</td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>{inv.mailing_address || '—'}</td>
                      <td>
                        {inv.bank_name && <div>{inv.bank_name}</div>}
                        {inv.bank_account_number && <div>Acct: {inv.bank_account_number}</div>}
                        {inv.bank_routing_number && <div>Routing: {inv.bank_routing_number}</div>}
                        {!inv.bank_name && !inv.bank_account_number && !inv.bank_routing_number && '—'}
                      </td>
                      <td>{inv.role}</td>
                      <td>
                        <button type="button" onClick={() => handleInvestorDelete(inv.id)} style={{ color: '#b91c1c' }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
      {error && <p style={{ color: 'red', position: 'fixed', bottom: 12, right: 24 }}>{error}</p>}
      <style jsx>{`
        .no-spinner::-webkit-outer-spin-button,
        .no-spinner::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinner {
          -moz-appearance: textfield;
        }
      `}</style>
    </main>
  );
}
