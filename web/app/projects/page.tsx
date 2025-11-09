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
};

export default function ProjectsPage() {
  const base = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [investors, setInvestors] = useState<ProjectInvestor[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingInvestors, setLoadingInvestors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newProject, setNewProject] = useState({ name: '', tenantId: 1 });
  const [newInvestor, setNewInvestor] = useState({ name: '', email: '', units: 0 });

  useEffect(() => {
    refreshProjects();
  }, []);

  const refreshProjects = async () => {
    setLoadingProjects(true);
    setError(null);
    try {
      const resp = await fetch(`${base}/api/projects`);
      if (!resp.ok) throw new Error(`Failed to load projects (${resp.status})`);
      const list = await resp.json();
      setProjects(list || []);
      if (list?.length && !selectedProject) {
        selectProject(list[0]);
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
    setLoadingInvestors(true);
    setError(null);
    try {
      const resp = await fetch(`${base}/api/projects/${projectId}/investors`);
      if (!resp.ok) throw new Error(`Failed to load investors (${resp.status})`);
      const list = await resp.json();
      setInvestors(list || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load investors');
    } finally {
      setLoadingInvestors(false);
    }
  };

  const handleProjectCreate = async () => {
    if (!newProject.name.trim()) {
      setError('Project name required');
      return;
    }
    setError(null);
    try {
      const resp = await fetch(`${base}/api/projects?name=${encodeURIComponent(newProject.name)}&tenant_id=${newProject.tenantId}`, {
        method: 'POST',
      });
      if (!resp.ok) throw new Error(`Create project failed (${resp.status})`);
      setNewProject({ name: '', tenantId: newProject.tenantId });
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newInvestor.name,
          email: newInvestor.email,
          units_invested: Number(newInvestor.units) || 0,
        }),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(detail || 'Failed to create investor');
      }
      setNewInvestor({ name: '', email: '', units: 0 });
      await refreshInvestors(selectedProject.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create investor');
    } finally {
      setLoadingInvestors(false);
    }
  };

  return (
    <main style={{ display: 'flex', gap: 24 }}>
      <section style={{ flex: '0 0 280px', borderRight: '1px solid #eee', paddingRight: 16 }}>
        <h2>Projects</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Project name"
            value={newProject.name}
            onChange={(e) => setNewProject((prev) => ({ ...prev, name: e.target.value }))}
            style={{ flex: '1 1 auto', padding: 6 }}
          />
          <button type="button" onClick={handleProjectCreate}>
            + Create
          </button>
        </div>
        {loadingProjects ? (
          <p>Loading projects…</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {projects.map((project) => (
              <li key={project.id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => selectProject(project)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    textAlign: 'left',
                    border: selectedProject?.id === project.id ? '2px solid #2563eb' : '1px solid #ccc',
                    borderRadius: 6,
                    background: selectedProject?.id === project.id ? '#e0e7ff' : '#fff',
                  }}
                >
                  {project.name}
                  <br />
                  <small>Tenant #{project.tenant_id}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ flex: '1 1 auto' }}>
        <h2>Investors</h2>
        {!selectedProject ? (
          <p>Select a project to view investors.</p>
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
                placeholder="Units"
                value={newInvestor.units}
                onChange={(e) => setNewInvestor((prev) => ({ ...prev, units: Number(e.target.value) }))}
                style={{ width: 120, padding: 6 }}
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
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {investors.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td>{inv.name}</td>
                      <td>{inv.email}</td>
                      <td>{inv.units_invested}</td>
                      <td>{inv.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
      {error && <p style={{ color: 'red', position: 'fixed', bottom: 12, right: 24 }}>{error}</p>}
    </main>
  );
}
