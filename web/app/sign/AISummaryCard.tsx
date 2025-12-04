import React from 'react';

type Props = {
  children: React.ReactNode;
  label?: string;
};

export function AISummaryCard({ children, label = 'AI summary' }: Props) {
  return (
    <div
      className="ai-summary-card"
      role="status"
      aria-live="polite"
      style={{
        border: '2px solid transparent',
        backgroundImage: 'linear-gradient(#fff, #fff), linear-gradient(90deg, #a855f7, #3b82f6)',
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
        boxShadow: '0 4px 15px rgba(168, 85, 247, 0.15)',
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: '#0f172a',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <img src="/ai-technology.png" alt="AI" width={20} height={20} style={{ display: 'block' }} />
          {label}
        </p>
      </div>
      {children}
    </div>
  );
}

