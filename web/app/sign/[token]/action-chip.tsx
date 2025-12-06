import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import type React from 'react';
import { theme } from '../../../lib/theme';

const palette = {
  card: theme.colors.panel,
  border: theme.colors.border,
  accent: theme.colors.accent,
  text: theme.colors.text,
  accentMuted: theme.colors.textMuted,
};

export function ActionChip({
  targetField,
  docRef,
  fieldRefs,
  onAction,
  remaining,
  showStartLabel,
}: {
  targetField: any;
  docRef: RefObject<HTMLElement | null>;
  fieldRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  onAction: () => void;
  remaining: number;
  showStartLabel: boolean;
}) {
  const GUTTER = 36;
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 12, left: 12 });

  const label = useMemo(() => {
    if (!targetField || showStartLabel) return 'Start';
    if (targetField.type === 'signature') return 'Sign';
    if (targetField.type === 'initials') return 'Initial';
    if (targetField.type === 'checkbox') return 'Check';
    if (targetField.type === 'date') return 'Fill date';
    return 'Fill';
  }, [targetField, showStartLabel]);

  const updatePosition = useMemo(
    () => () => {
      const doc = docRef.current;
      if (!doc) return;
      const docRect = doc.getBoundingClientRect();

      // Active state: anchor to current target field.
      const ref = targetField ? fieldRefs.current[String(targetField.id)] : null;
      if (ref && !showStartLabel) {
        const rect = ref.getBoundingClientRect();
        const pageElement =
          (ref.closest?.('[data-page-container]') as HTMLElement | null) ||
          (ref.parentElement as HTMLElement | null);
        const pageRect = pageElement?.getBoundingClientRect();
        const top = rect.top - docRect.top + doc.scrollTop + rect.height / 2 - 22;
        const leftBase = pageRect
          ? pageRect.left - docRect.left + doc.scrollLeft - GUTTER
          : doc.scrollLeft + 12;
        setPos({ top: Math.max(8, top), left: Math.max(8, leftBase) });
        return;
      }

      // Start state: park near the top-left of the first page.
      const firstPage = doc.querySelector('[data-page-container]') as HTMLElement | null;
      const anchorRect = firstPage?.getBoundingClientRect();
      const leftBase = anchorRect
        ? anchorRect.left - docRect.left + doc.scrollLeft + 4
        : doc.scrollLeft + 12;

      // Sticky at the top of the viewport
      setPos({ top: 12, left: Math.max(8, leftBase) });
    },
    [targetField, docRef, fieldRefs, showStartLabel]
  );

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition, targetField?.id]);

  useEffect(() => {
    if (!showStartLabel) return;
    const doc = docRef.current;
    if (!doc) return;
    const img = doc.querySelector('[data-page-container] img[alt^="Page"]') as HTMLImageElement | null;
    if (img && !img.complete) {
      const handler = () => updatePosition();
      img.addEventListener('load', handler);
      return () => img.removeEventListener('load', handler);
    }
  }, [docRef, updatePosition, showStartLabel]);

  useEffect(() => {
    const raf = requestAnimationFrame(updatePosition);
    const doc = docRef.current;
    if (!doc) return;
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    doc.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    const observer = new MutationObserver(() => updatePosition());
    observer.observe(doc, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      doc.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      observer.disconnect();
    };
  }, [docRef, updatePosition]);

  if (!targetField && !showStartLabel) return null;

  return (
    <button
      type="button"
      data-testid="action-chip"
      onClick={onAction}
      style={{
        position: showStartLabel ? 'sticky' : 'absolute',
        top: pos.top,
        left: pos.left,
        transform: 'translate3d(0,0,0)',
        zIndex: 30,
        background: palette.accent,
        color: '#fff',
        border: `1px solid ${palette.accent}`,
        borderRadius: 14,
        padding: '10px 18px 10px 16px',
        boxShadow: '0 14px 32px rgba(15,23,42,0.2)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        transition: showStartLabel ? 'none' : 'top 0.35s cubic-bezier(0.22, 0.61, 0.36, 1), left 0.25s ease',
        clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)',
        minHeight: 42,
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, textTransform: 'uppercase' }}>
        {label}
      </span>
      {remaining > 0 && (
        <span
          style={{
            background: '#0f172a',
            color: '#fff',
            borderRadius: 999,
            padding: '2px 9px',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {remaining}
        </span>
      )}
    </button>
  );
}
