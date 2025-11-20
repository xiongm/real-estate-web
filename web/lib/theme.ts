export const theme = {
  colors: {
    page: 'var(--color-background)',
    surface: 'var(--color-card)',
    panel: 'var(--color-card)',
    sidebar: 'var(--color-card)',
    border: 'var(--color-border)',
    text: 'var(--color-foreground)',
    textMuted: 'var(--color-muted)',
    textSubtle: '#6b7280',
    accent: 'var(--color-accent)',
    accentSoft: 'var(--color-accent-soft)',
    accentContrast: 'var(--color-accent-contrast)',
    danger: 'var(--color-danger)',
    dangerContrast: '#ffffff',
    success: 'var(--color-success)',
    successContrast: '#ffffff',
    overlay: 'rgba(15,23,42,0.2)',
    code: 'var(--color-card-muted)',
    chip: 'var(--color-card-muted)',
    gradient: 'linear-gradient(135deg, #ffffff 0%, #f1f3fa 100%)',
  },
  shadows: {
    card: 'var(--shadow-md)',
    modal: 'var(--shadow-lg)',
    subtle: 'var(--shadow-sm)',
    pill: '0 12px 30px rgba(37, 99, 235, 0.25)',
  },
  radii: {
    card: 24,
    panel: 20,
    input: 12,
    pill: 999,
  },
} as const;

export type Theme = typeof theme;
