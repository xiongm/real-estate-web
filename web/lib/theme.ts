export const theme = {
  colors: {
    page: '#f6f8fb',
    surface: '#ffffff',
    panel: '#ffffff',
    sidebar: '#ffffff',
    border: '#e6eaf5',
    text: '#1f2346',
    textMuted: '#8f95b2',
    accent: '#6c5ce7',
    accentSoft: '#ede9ff',
    accentContrast: '#ffffff',
    danger: '#dc2626',
    dangerContrast: '#ffffff',
    success: '#16a34a',
    successContrast: '#ffffff',
    overlay: 'rgba(15,23,42,0.25)',
    code: '#f4f5fb',
    chip: '#edf0ff',
    gradient: 'linear-gradient(135deg, #ffffff 0%, #f6f8fb 100%)',
  },
  shadows: {
    card: '0 20px 40px rgba(15,23,42,0.08)',
    modal: '0 30px 60px rgba(15,23,42,0.15)',
    subtle: '0 4px 12px rgba(15,23,42,0.05)',
    pill: '0 10px 18px rgba(108,92,231,0.25)',
  },
  radii: {
    card: 24,
    panel: 20,
    input: 10,
    pill: 999,
  },
} as const;

export type Theme = typeof theme;
