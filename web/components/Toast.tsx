import { useEffect, useState } from 'react';

export interface ToastProps {
    message: string;
    type?: 'success' | 'error' | 'info';
    onClose?: () => void;
    duration?: number;
}

export function Toast({ message, type = 'info', onClose, duration = 3000 }: ToastProps) {
    useEffect(() => {
        if (duration > 0 && onClose) {
            const timer = setTimeout(onClose, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, onClose]);

    let bg = '#0f172a'; // Default slate-900
    let color = '#fff';
    let icon = null;

    if (type === 'success') {
        bg = '#10b981'; // emerald-500
        icon = '✓';
    } else if (type === 'error') {
        bg = '#ef4444'; // red-500
        icon = '!';
    } else {
        // Info
        bg = '#334155'; // slate-700
    }

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                background: bg,
                color: color,
                padding: '10px 18px',
                borderRadius: 999,
                boxShadow: '0 12px 28px rgba(15,23,42,0.25)',
                fontSize: 14,
                fontWeight: 600,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                animation: 'fadeInUp 0.3s ease',
                cursor: onClose ? 'pointer' : 'default',
                maxWidth: '90vw',
            }}
            onClick={onClose}
        >
            {icon && (
                <span
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255,255,255,0.2)',
                        borderRadius: '50%',
                        width: 20,
                        height: 20,
                        fontSize: 12,
                        fontWeight: 800,
                    }}
                >
                    {icon}
                </span>
            )}
            <span>{message}</span>
            <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
        </div>
    );
}
