import { theme } from '../lib/theme';

interface ProgressBarProps {
    progress: number;
    label?: string;
    color?: string;
}

export function ProgressBar({ progress, label, color }: ProgressBarProps) {
    const barColor = color || theme.colors.accent || '#3b82f6';

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {label && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 500, color: theme.colors.textMuted || '#64748b' }}>
                    <span>{label}</span>
                    <span>{progress}%</span>
                </div>
            )}
            <div
                style={{
                    width: '100%',
                    height: 6,
                    background: '#e2e8f0',
                    borderRadius: 999,
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                <div
                    style={{
                        height: '100%',
                        width: `${Math.max(0, Math.min(100, progress))}%`,
                        background: barColor,
                        borderRadius: 999,
                        transition: 'width 0.2s ease',
                    }}
                />
            </div>
        </div>
    );
}
