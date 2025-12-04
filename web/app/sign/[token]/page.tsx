'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, CSSProperties, ChangeEvent, RefObject } from 'react';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf';
import { useParams } from 'next/navigation';
import { theme } from '../../../lib/theme';
import { AISummaryCard } from '../AISummaryCard';
import {
  isFieldComplete,
  isRequiredField,
  nextIncompleteField,
  sortFieldOrder,
} from './navigation-helpers';
import { logEvent } from './client-logger';
import { ActionChip } from './action-chip';

type PageRender = {
  pageIndex: number;
  dataUrl: string;
  width: number;
  height: number;
  scale: number;
  baseWidth: number;
  baseHeight: number;
};

type CompletionResult = {
  message: string;
  sealed?: boolean;
  waitingOn?: number;
  status?: string;
  sha?: string;
};
export type SignatureAdoption = {
  signature: string | null;
  initials: string | null;
  method: 'draw' | 'type' | 'upload';
  font?: string;
  signerName?: string;
  initialsText?: string;
};
const DEFAULT_FONT = 'sans';
const FONT_STACKS: Record<string, string> = {
  sans: `'Inter', 'Helvetica Neue', Arial, sans-serif`,
  serif: `'Georgia', 'Times New Roman', serif`,
  times: `'Times New Roman', Times, serif`,
  mono: `'JetBrains Mono', 'Courier New', monospace`,
  script: `'Lucida Handwriting', 'Brush Script MT', cursive`,
};
const resolveFontStack = (id?: string) => FONT_STACKS[id ?? DEFAULT_FONT] || FONT_STACKS[DEFAULT_FONT];
const ADOPTION_STORAGE_PREFIX = 'sign-adoption';

const palette = {
  pageBackground: theme.colors.page,
  card: theme.colors.panel,
  border: theme.colors.border,
  accent: theme.colors.accent,
  accentMuted: theme.colors.textMuted,
  text: theme.colors.text,
  chip: theme.colors.chip || '#eef2ff',
  overlay: theme.colors.overlay,
};
const shadows = theme.shadows;
const LOGGING_ENABLED = process.env.NEXT_PUBLIC_SIGN_LOG !== 'false';
const SCROLL_PADDING = 120;

export default function SignPage() {
  if (typeof window !== 'undefined') {
    GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<PageRender[]>([]);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);
  const [adoption, setAdoption] = useState<SignatureAdoption | null>(null);
  const [adoptionDialogOpen, setAdoptionDialogOpen] = useState(false);
  const [adoptionLoaded, setAdoptionLoaded] = useState(false);
  const [adoptionDismissed, setAdoptionDismissed] = useState(false);
  const docScrollRef = useRef<HTMLDivElement | null>(null);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const pendingAutoAdvanceId = useRef<string | null>(null);
  const navIndexRef = useRef(0);
  const draftSaveTimer = useRef<number | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [chipIndex, setChipIndex] = useState(0);
  const consentRef = useRef<HTMLInputElement | null>(null);
  const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
  const enableDraftSave = process.env.NEXT_PUBLIC_SIGN_DRAFT_SAVE === 'true';

  useEffect(() => {
    if (!highlightedFieldId) return;
    const timer = window.setTimeout(() => setHighlightedFieldId(null), 1400);
    return () => window.clearTimeout(timer);
  }, [highlightedFieldId]);

  const focusField = useCallback(
    (fieldId: string, options?: { markStarted?: boolean }) => {
      const markStarted = options?.markStarted ?? true;
      if (!fieldId) return;
      if (markStarted && !hasStarted) {
        setHasStarted(true);
      }
      setActiveFieldId(fieldId);
      setHighlightedFieldId(fieldId);
      const el = fieldRefs.current[fieldId];
      if (!el) {
        // Ref not mounted yet; retry shortly.
        window.requestAnimationFrame(() => setPendingFocusId(fieldId));
        window.setTimeout(() => setPendingFocusId(fieldId), 80);
        return;
      }
      if (el) {
        const parent = docScrollRef.current;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const target =
            elRect.top -
            parentRect.top +
            parent.scrollTop -
            parent.clientHeight / 2 +
            elRect.height / 2 -
            SCROLL_PADDING / 2;
          const clamped = Math.max(0, target);
          parent.scrollTo({
            top: clamped,
            behavior: 'smooth',
          });
          // ensure it lands even if smooth scroll is ignored
          window.setTimeout(() => {
            parent.scrollTo({ top: clamped, behavior: 'smooth' });
          }, 120);
          // fallback: ask the element to scroll itself into view within any ancestor
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
        if (typeof window !== 'undefined') {
          const tryFocus = () => {
            const focusable = el.querySelector('canvas, input, textarea, button') as HTMLElement | null;
            if (focusable && 'focus' in focusable) {
              try {
                focusable.focus({ preventScroll: true } as any);
              } catch {
                // ignore focus errors
              }
            } else if ('focus' in el) {
              try {
                (el as HTMLElement).focus({ preventScroll: true } as any);
              } catch {
                // ignore focus errors
              }
            }
          };
          tryFocus();
          window.requestAnimationFrame(tryFocus);
          window.setTimeout(tryFocus, 40);
        }
      } else {
        fieldRefs.current[fieldId]?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }
    },
    [hasStarted]
  );

  useEffect(() => {
    if (!pendingFocusId) return;
    focusField(pendingFocusId);
    setPendingFocusId(null);
  }, [pendingFocusId, focusField]);

  useEffect(() => {
    if (!token) return;
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(`${ADOPTION_STORAGE_PREFIX}:${token}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAdoption(parsed);
      } catch (e) {
        console.warn('Failed to parse stored signature adoption', e);
      }
    }
    setAdoptionLoaded(true);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch(`${base}/api/sign/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        setData(json);
        if (LOGGING_ENABLED) {
          logEvent('sign_pdf_error', { status: 'init_ok' });
        }
      })
      .catch((e) => {
        setError(String(e));
        if (LOGGING_ENABLED) {
          logEvent('sign_pdf_error', { status: 'init_fail', message: String(e) });
        }
      });
  }, [token]);

  useEffect(() => {
    if (!data?.fields) return;
    const signerId = data.signer?.id;
    const signerRole = data.signer?.role;
    const filteredFields = (data.fields || []).filter((field: any) => {
      if (field.signer_id && signerId) {
        return field.signer_id === signerId;
      }
      if (field.role && signerRole) {
        return field.role === signerRole;
      }
      return true;
    });
    setFieldValues((prev) => {
      const next = { ...prev };
      filteredFields.forEach((field: any) => {
        const key = String(field.id);
        if (next[key]) return;
        let defaultValue: any = '';
        if (field.type === 'checkbox') defaultValue = false;
        if (field.type === 'date') defaultValue = '';
        if (field.type === 'datetime') defaultValue = '';
        const committed =
          field.type === 'text' || field.type === 'textarea' ? false : true;
        next[key] = { ...field, value: defaultValue, committed };
      });
      return next;
    });
  }, [data?.fields, data?.signer?.role, data?.signer?.id]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const preferFinal = Boolean((completion && completion.sealed) || data?.final_artifact?.sha256_final);
    setPdfError(null);
    setPdfPages([]);
    setPdfLoading(true);
    const loadPdf = async () => {
      try {
        const loadFromEndpoint = async (endpoint: 'pdf' | 'final-pdf') => {
          const r = await fetch(`${base}/api/sign/${token}/${endpoint}`);
          return r;
        };
        let response = await loadFromEndpoint(preferFinal ? 'final-pdf' : 'pdf');
        if (preferFinal && response.status === 404) {
          response = await loadFromEndpoint('pdf');
        }
        if (!response.ok) {
          throw new Error(`PDF HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        const pages = await renderPdfPages(buffer);
        if (!cancelled) setPdfPages(pages);
      } catch (e) {
        if (!cancelled) setPdfError(String(e));
        if (LOGGING_ENABLED) {
          logEvent('sign_pdf_error', { message: String(e) });
        }
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    };
    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [token, completion?.sealed, data?.final_artifact?.sha256_final]);

  const signerRole = data?.signer?.role;
  const signerId = data?.signer?.id;
  const fields = (data?.fields || []).filter((field: any) => {
    if (field.signer_id && signerId) {
      return field.signer_id === signerId;
    }
    if (field.role && signerRole) {
      return field.role === signerRole;
    }
    return true;
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!activeFieldId) return;
      const activeField = fields.find((f: any) => String(f.id) === activeFieldId);
      if (!activeField) return;
      if (activeField.type !== 'text' && activeField.type !== 'textarea') return;
      const fieldEl = fieldRefs.current[activeFieldId];
      if (fieldEl && fieldEl.contains(event.target as Node)) {
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
      }
    };
    window.addEventListener('keydown', handler, false);
    window.addEventListener('keypress', handler, false);
    window.addEventListener('keyup', handler, false);
    return () => {
      window.removeEventListener('keydown', handler, false);
      window.removeEventListener('keypress', handler, false);
      window.removeEventListener('keyup', handler, false);
    };
  }, [activeFieldId, fields]);
  const payloadValues = useMemo(() => {
    const entries = Object.entries(fieldValues).map(([fid, meta]) => [
      fid,
      {
        type: meta.type,
        page: meta.page,
        x: meta.x,
        y: meta.y,
        w: meta.w,
        h: meta.h,
        value: meta.value,
        required: meta.required,
        font: meta.font_family || DEFAULT_FONT,
      },
    ]);
    return Object.fromEntries(entries);
  }, [fieldValues]);
  const orderedRequiredFields = useMemo(
    () => fields.filter((field) => isRequiredField(field)).sort(sortFieldOrder),
    [fields]
  );
  useEffect(() => {
    const orderedIds = orderedRequiredFields.map((f) => String(f.id));
    if (!orderedIds.length) return;
    const idx = activeFieldId ? orderedIds.findIndex((id) => id === activeFieldId) : -1;
    if (idx >= 0 && idx !== chipIndex) {
      setChipIndex(idx);
      navIndexRef.current = idx;
    }
  }, [activeFieldId, orderedRequiredFields, chipIndex]);
  const remainingRequired = useMemo(
    () => orderedRequiredFields.filter((field) => !isFieldComplete(field, fieldValues)).length,
    [orderedRequiredFields, fieldValues]
  );
  const firstIncompleteId = useMemo(() => {
    const target = orderedRequiredFields.find((field) => !isFieldComplete(field, fieldValues));
    return target ? String(target.id) : null;
  }, [orderedRequiredFields, fieldValues]);
  const findNextIncompleteAfter = useCallback(
    (currentId?: string | null, valuesOverride?: Record<string, any>) =>
      nextIncompleteField(orderedRequiredFields, valuesOverride || fieldValues, currentId),
    [orderedRequiredFields, fieldValues]
  );

  // When all required fields are complete, nudge the user to consent.
  const prevRemainingRef = useRef<number>(remainingRequired);
  useEffect(() => {
    const prev = prevRemainingRef.current;
    if (prev > 0 && remainingRequired === 0 && !consented) {
      const input = consentRef.current;
      if (input) {
        input.focus({ preventScroll: false } as any);
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    prevRemainingRef.current = remainingRequired;
  }, [remainingRequired, consented]);

  useEffect(() => {
    if (!activeFieldId && firstIncompleteId) {
      setActiveFieldId(firstIncompleteId);
    }
  }, [activeFieldId, firstIncompleteId]);

  const registerFieldRef = useCallback((id: string, el: HTMLElement | null) => {
    fieldRefs.current[id] = el;
  }, []);

  useEffect(() => {
    if (!adoptionLoaded) return;
    const hasSignatureFields = fields.some(
      (field: any) => field.type === 'signature' || field.type === 'initials'
    );
    if (hasSignatureFields && !adoption && !adoptionDismissed) {
      setAdoptionDialogOpen(true);
    }
  }, [adoptionLoaded, adoption, adoptionDismissed, fields]);

  useEffect(() => {
    if (!data?.signer?.status) return;
    if (data?.signer?.status !== 'completed') return;
    const finalSha = data.final_artifact?.sha256_final;
    const waiting = data.waiting_on ?? 0;
    const sealed = Boolean(finalSha);
    let message = 'Your signature has been recorded.';
    if (sealed && finalSha) {
      message = `All signers complete. Final SHA256: ${finalSha}`;
    } else if (waiting > 0) {
      const noun = waiting === 1 ? 'signer' : 'signers';
      message = `You're all set. Waiting on ${waiting} ${noun} before sealing.`;
    }
    setCompletion({
      message,
      sealed,
      waitingOn: waiting,
      status: sealed ? 'sealed' : waiting > 0 ? 'waiting' : 'completed',
      sha: finalSha,
    });
    setStatusMessage(message);
  }, [data?.signer?.status, data?.final_artifact?.sha256_final, data?.waiting_on]);

  const handleFieldChange = (
    field: any,
    value: any,
    options?: { commit?: boolean; allowAutoAdvance?: boolean; valid?: boolean; suppressActiveUpdate?: boolean }
  ) => {
    const key = String(field.id);
    if ((field.type === 'text' || field.type === 'textarea') && options?.commit !== true) {
      // Cancel any queued auto-advance while typing so focus stays put.
      pendingAutoAdvanceId.current = null;
      setPendingFocusId(null);
    }
    const commit =
      options?.commit !== undefined ? options.commit : field.type !== 'text' && field.type !== 'textarea';
    const allowAutoAdvance = options?.allowAutoAdvance !== false;
    const explicitAllowAuto = options?.allowAutoAdvance === true;
    const validity = options?.valid;
    setFieldValues((prev) => {
      const next = { ...prev, [key]: { ...field, value } };
      next[key].touched = true;
      if (validity !== undefined) {
        next[key].valid = validity;
      } else if (prev[key]?.valid !== undefined) {
        next[key].valid = prev[key].valid;
      }
      if (commit) {
        next[key].committed = true;
      } else if (prev[key]?.committed) {
        next[key].committed = prev[key].committed;
      }
      const wasComplete = isFieldComplete(field, prev);
      const nowComplete = isFieldComplete(field, next);
      if (!wasComplete && nowComplete && isRequiredField(field)) {
        const nextId = findNextIncompleteAfter(String(field.id), next);
        const fastAutoTypes = ['checkbox', 'signature', 'initials', 'date', 'datetime'];
        const isTextual = field.type === 'text' || field.type === 'textarea';
        const canAutoAdvance =
          allowAutoAdvance &&
          (fastAutoTypes.includes(field.type) ||
            (isTextual && (explicitAllowAuto || !nextId)));
        if (nextId && canAutoAdvance) {
          pendingAutoAdvanceId.current = nextId;
        }
      }
      return next;
    });
    if (!options?.suppressActiveUpdate) {
      setActiveFieldId(String(field.id));
    }
  };
  useEffect(() => {
    const nextId = pendingAutoAdvanceId.current;
    if (!nextId) return;
    pendingAutoAdvanceId.current = null;
    setPendingFocusId(nextId);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => focusField(nextId));
      window.setTimeout(() => focusField(nextId), 180);
    }
  }, [fieldValues, focusField]);

  const applyAdoptionToField = useCallback(
    (fieldId: string) => {
      if (!adoption) return;
      const target = fields.find((f: any) => String(f.id) === String(fieldId));
      if (!target) return;
      const image = target.type === 'initials' ? adoption.initials : adoption.signature;
      if (!image) return;
      handleFieldChange(target, image);
    },
    [adoption, fields, handleFieldChange]
  );

  useEffect(() => {
    if (!enableDraftSave) return;
    if (!token || !fields.length) return;
    if (completion) return;
    if (draftSaveTimer.current) {
      window.clearTimeout(draftSaveTimer.current);
    }
    draftSaveTimer.current = window.setTimeout(() => {
      (async () => {
        try {
          setDraftSaving(true);
          setDraftError(null);
          const r = await fetch(`${base}/api/sign/${token}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: payloadValues }),
          });
          if (!r.ok) {
            throw new Error(`HTTP ${r.status}`);
          }
          if (LOGGING_ENABLED) {
            logEvent('sign_draft_save_success');
          }
        } catch (e) {
          console.warn('Draft save failed', e);
          setDraftError('Draft save failed');
          if (LOGGING_ENABLED) {
            logEvent('sign_draft_save_error', { message: String(e) });
          }
        } finally {
          setDraftSaving(false);
        }
      })();
    }, 700);
    return () => {
      if (draftSaveTimer.current) {
        window.clearTimeout(draftSaveTimer.current);
      }
    };
  }, [enableDraftSave, token, fields.length, completion, base, payloadValues]);

  const documentLabel =
    data?.envelope?.subject ||
    data?.envelope?.name ||
    data?.document?.filename ||
    'Document';
  const summaryText = (data?.envelope?.summary || '').trim();
  const showFinalPdf = Boolean(
    (completion && completion.sealed) ||
      data?.final_artifact?.sha256_final ||
      data?.signer?.status === 'completed'
  );

  const hasMissingRequired = remainingRequired > 0;
  const handleStart = useCallback(() => {
    if (firstIncompleteId) {
      focusField(firstIncompleteId);
    }
  }, [firstIncompleteId, focusField]);
  const handleNext = useCallback(() => {
    const nextId = findNextIncompleteAfter(activeFieldId);
    if (nextId) {
      focusField(nextId);
    }
    if (!nextId && firstIncompleteId) {
      focusField(firstIncompleteId);
    }
  }, [activeFieldId, findNextIncompleteAfter, focusField]);
  const handleBackToFirst = useCallback(() => {
    if (firstIncompleteId) {
      focusField(firstIncompleteId);
    }
  }, [firstIncompleteId, focusField]);

  const targetFieldId = remainingRequired === 0 ? null : activeFieldId || firstIncompleteId;

  useEffect(() => {
    if (!hasStarted) return;
    if (!targetFieldId) return;
    if (activeFieldId === targetFieldId) return;
    focusField(targetFieldId);
  }, [targetFieldId, activeFieldId, hasStarted, focusField]);

  const mainContent = completion ? (
    <CompletionView
      info={completion}
      pages={pdfPages}
      loading={pdfLoading}
      error={pdfError}
      fields={fields}
      values={fieldValues}
      renderOverlays={!showFinalPdf}
      onRetryPdf={() => setCompletion(null)}
    />
  ) : (
      <div className="sign-content">
        <AISummaryCard>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 14,
              color: summaryText ? palette.text : palette.accentMuted,
              lineHeight: 1.6,
            }}
          >
            {summaryText || 'A concise summary will appear here once available.'}
          </p>
        </AISummaryCard>
      <div className="sign-columns">
        <section className="sign-doc-section" ref={docScrollRef}>
          <PdfSigningSurface
            pages={pdfPages}
            loading={pdfLoading}
            error={pdfError}
            fields={fields}
            values={fieldValues}
            onChange={handleFieldChange}
            registerFieldRef={registerFieldRef}
            activeFieldId={activeFieldId}
            highlightedFieldId={highlightedFieldId}
            onFocusField={(fid) => focusField(fid)}
            adoption={adoption}
            onInsertAdoption={applyAdoptionToField}
          />
          {targetFieldId && (
            <ActionChip
              targetField={fields.find((f) => String(f.id) === targetFieldId)}
              docRef={docScrollRef}
              fieldRefs={fieldRefs}
              onAction={() => {
                const orderedIds = orderedRequiredFields.map((f) => String(f.id));
                if (!orderedIds.length) return;
                if (!hasStarted) {
                  const dest = orderedIds[0];
                  navIndexRef.current = 0;
                  setChipIndex(0);
                  focusField(dest);
                  setPendingFocusId(dest);
                  return;
                }
                const anchorField =
                  activeFieldId && fields.find((f: any) => String(f.id) === activeFieldId);
                const anchorMeta = activeFieldId ? fieldValues[activeFieldId] : null;
                const stickyAnchor =
                  anchorField &&
                  !isFieldComplete(anchorField, fieldValues) &&
                  anchorField.type !== 'signature' &&
                  anchorField.type !== 'initials' &&
                  (anchorField.type === 'date' || anchorField.type === 'datetime'
                    ? Boolean(anchorMeta?.value) || Boolean(anchorMeta?.touched)
                    : true);
                const anchorIndex = targetFieldId
                  ? orderedIds.findIndex((id) => id === targetFieldId)
                  : -1;
                const baseIndex =
                  anchorIndex >= 0
                    ? anchorIndex
                    : chipIndex >= 0 && chipIndex < orderedIds.length
                    ? chipIndex
                    : 0;
                let destinationId = String(activeFieldId);
                if (!stickyAnchor) {
                  const nextIndex = (navIndexRef.current + 1) % orderedIds.length;
                  navIndexRef.current = nextIndex;
                  setChipIndex(nextIndex);
                  destinationId = orderedIds[nextIndex];
                }
                if (destinationId) {
                  const destinationField = fields.find((f: any) => String(f.id) === destinationId);
                  setActiveFieldId(destinationId);
                  setHighlightedFieldId(destinationId);
                  if (typeof document !== 'undefined') {
                    try {
                      (document.activeElement as HTMLElement | null)?.blur?.();
                    } catch {
                      // ignore
                    }
                  }
                  focusField(destinationId);
                  setPendingFocusId(destinationId);
                  const forceFocus = () => {
                    const el = fieldRefs.current[String(destinationId)];
                    const focusable =
                      (el?.querySelector?.('canvas, input, textarea, button') as HTMLElement | null) ||
                      (typeof document !== 'undefined'
                        ? (document.querySelector(
                            `[data-field-id="${destinationId}"] canvas`
                          ) as HTMLElement | null)
                        : null);
                    try {
                      (focusable || el)?.focus?.({ preventScroll: true } as any);
                    } catch {
                      // ignore focus errors
                    }
                  };
                  forceFocus();
                  if (typeof window !== 'undefined') {
                    window.requestAnimationFrame(forceFocus);
                    window.setTimeout(forceFocus, 60);
                    if (
                      destinationField &&
                      (destinationField.type === 'signature' || destinationField.type === 'initials')
                    ) {
                      const focusCanvas = () => {
                        const canvasById = document.querySelector(
                          `#sig-canvas-${destinationId}`
                        ) as HTMLElement | null;
                        const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLElement[];
                        const indexGuess = orderedIds.findIndex((id) => id === destinationId);
                        const canvasByIndex =
                          indexGuess >= 0 && indexGuess < canvases.length
                            ? canvases[indexGuess]
                            : canvases[1] || canvases[0] || null;
                        const canvas = canvasById || canvasByIndex;
                        try {
                          canvas?.focus?.({ preventScroll: true } as any);
                          canvas?.dispatchEvent?.(
                            new MouseEvent('mousedown', { bubbles: true, cancelable: true })
                          );
                        } catch {
                          // ignore
                        }
                      };
                      window.setTimeout(focusCanvas, 120);
                      window.setTimeout(focusCanvas, 260);
                      window.setTimeout(focusCanvas, 420);
                      window.setTimeout(focusCanvas, 820);
                      window.setTimeout(() => {
                        const canvases = Array.from(
                          document.querySelectorAll('canvas')
                        ) as HTMLElement[];
                        const target = canvases[1];
                        try {
                          target?.focus?.({ preventScroll: true } as any);
                        } catch {
                          // ignore
                        }
                      }, 180);
                      window.setTimeout(focusCanvas, 520);
                    }
                  }
                }
              }}
              remaining={remainingRequired}
              showStartLabel={!hasStarted}
            />
          )}
        </section>
        <aside className="sign-sidebar">
          <div className="sign-sidebar-card">
            <Consent token={token} consented={consented} onToggle={setConsented} inputRef={consentRef} />
            <SignatureAdoptionCard
              adoption={adoption}
              signerName={data?.signer?.name}
              onAdopt={() => setAdoptionDialogOpen(true)}
              onClear={() => {
                setAdoption(null);
                setAdoptionDismissed(true);
                if (LOGGING_ENABLED) {
                  logEvent('sign_adoption', { action: 'clear' });
                }
                if (typeof window !== 'undefined') {
                  window.localStorage.removeItem(`${ADOPTION_STORAGE_PREFIX}:${token}`);
                }
              }}
            />
            <div className="sign-sidebar-action">
              <Complete
                token={token}
                values={payloadValues}
                disabled={!consented || hasMissingRequired}
                onSuccess={(info) => {
                  setStatusMessage(info.message);
                  setCompletion(info);
                }}
                onError={(msg) => setStatusMessage(msg)}
              />
            </div>
          </div>
          {!completion && statusMessage && <p className="status-message">{statusMessage}</p>}
          {enableDraftSave && !completion && (
            <p
              className={`status-message ${draftError ? 'error' : 'muted'}`}
              aria-live="polite"
            >
              {draftError || (draftSaving ? 'Saving draft…' : 'Drafts auto-save')}
            </p>
          )}
        </aside>
      </div>
    </div>
  );

  if (!token) {
    return <div>Missing token in URL.</div>;
  }
  if (error) {
    return <div>Error: {error}</div>;
  }
  if (!data) {
    return <div>Loading…</div>;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: palette.pageBackground,
        color: palette.text,
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          padding: '32px 24px 120px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <header
          style={{
            position: 'sticky',
            top: 24,
            zIndex: 20,
            background: palette.card,
            border: `1px solid ${palette.border}`,
            borderRadius: 28,
            padding: '20px 32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 25px 60px rgba(15,23,42,0.12)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>Document</p>
            <strong style={{ fontSize: 20 }}>{documentLabel}</strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>Signer</p>
            <strong style={{ fontSize: 18 }}>{data?.signer?.name}</strong>
            <div style={{ fontSize: 13, color: palette.accentMuted }}>{data?.signer?.email}</div>
          </div>
        </header>
        {mainContent}
      </div>
      <style jsx>{`
        .sign-content {
          flex: 1;
          padding: 0;
        }
        .sign-columns {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          gap: 28px;
          align-items: flex-start;
        }
        .sign-doc-section {
          max-height: calc(100vh - 220px);
          min-height: calc(100vh - 220px);
          overflow-y: auto;
          padding-right: 8px;
          padding-bottom: 24px;
          scroll-behavior: smooth;
          scroll-padding-top: ${SCROLL_PADDING}px;
          position: relative;
        }
        .sign-sidebar {
          position: sticky;
          top: 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-width: 0;
        }
        .sign-sidebar.completion {
          position: static;
          border: 1px solid ${palette.border};
          border-radius: 20px;
          padding: 24px 28px;
          background: ${palette.card};
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .sign-sidebar-card {
          border: 1px solid ${palette.border};
          border-radius: 20px;
          padding: 24px 28px;
          background: ${palette.card};
          display: flex;
          flex-direction: column;
          gap: 24px;
          box-shadow: ${shadows.card};
        }
        .sign-sidebar-action {
          padding-top: 4px;
        }
        .status-message {
          margin-top: 8px;
          color: ${palette.accent};
        }
        .status-message.muted {
          color: ${palette.accentMuted};
        }
        .status-message.error {
          color: #b91c1c;
        }
        .sign-content.completion {
          height: calc(100vh - 78px);
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 24px;
          overflow: hidden;
        }
        .completion-wrapper {
          flex: 1;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          min-height: 0;
        }
        .completion-panel {
          position: sticky;
          top: 80px;
          z-index: 10;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          padding: 24px 28px;
          border: 1px solid ${palette.border};
          border-radius: 24px;
          background: ${palette.card};
          box-shadow: ${shadows.card};
        }
        .completion-panel .label {
          margin: 0;
          font-size: 12px;
          color: ${palette.accentMuted};
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }
        .completion-panel .status-title {
          font-size: 22px;
          margin: 4px 0 0;
          color: ${palette.text};
        }
        .completion-panel .message {
          margin: 0;
          font-size: 14px;
          color: ${palette.text};
          line-height: 1.5;
          max-width: 440px;
        }
        .completion-viewer {
          flex: 1;
          min-height: 0;
          border: 1px solid ${palette.border};
          border-radius: 24px;
          background: ${palette.card};
          padding: 28px;
          box-shadow: ${shadows.modal};
          overflow-y: auto;
        }
        .completion-alert {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecdd3;
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 13px;
        }
        .link-button {
          border: none;
          background: transparent;
          color: ${palette.accent};
          cursor: pointer;
          font-weight: 600;
          text-decoration: underline;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        @media (max-width: 1080px) {
          .sign-columns {
            grid-template-columns: 1fr;
          }
          .sign-sidebar {
            position: static;
          }
          .sign-sidebar-card {
            order: 2;
          }
        }
        @media (max-width: 640px) {
          .sign-sidebar-card {
            padding: 20px;
          }
        }
      `}</style>
      {adoptionDialogOpen && (
        <SignatureAdoptionDialog
          open={adoptionDialogOpen}
          onClose={() => {
            setAdoptionDialogOpen(false);
            setAdoptionDismissed(true);
          }}
          onSave={(next) => {
            setAdoption(next);
            setAdoptionDismissed(false);
            if (LOGGING_ENABLED) {
              logEvent('sign_adoption', { method: next.method, font: next.font });
            }
            if (typeof window !== 'undefined' && token) {
              window.localStorage.setItem(
                `${ADOPTION_STORAGE_PREFIX}:${token}`,
                JSON.stringify(next)
              );
            }
            setAdoptionDialogOpen(false);
          }}
          defaultName={data?.signer?.name || ''}
        />
      )}
    </div>
  );
}

function Consent({
  token,
  consented,
  onToggle,
  inputRef,
}: {
  token: string;
  consented: boolean;
  onToggle: (value: boolean) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    if (!checked) {
      onToggle(false);
      return;
    }
    await fetch(`${base}/api/sign/${token}/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accepted: true }),
    });
    if (LOGGING_ENABLED) {
      logEvent('sign_consent');
    }
    onToggle(true);
  };
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        cursor: 'pointer',
        color: palette.text,
      }}
    >
      <input
        type="checkbox"
        checked={consented}
        onChange={onChange}
        ref={inputRef}
        style={{
          width: 20,
          height: 20,
          marginTop: 2,
          accentColor: palette.accent,
        }}
      />
      <span style={{ fontSize: 14, lineHeight: 1.5, color: palette.accentMuted }}>
        I agree to use electronic records & signatures
      </span>
    </label>
  );
}

function SignatureAdoptionCard({
  adoption,
  signerName,
  onAdopt,
  onClear,
}: {
  adoption: SignatureAdoption | null;
  signerName?: string;
  onAdopt: () => void;
  onClear: () => void;
}) {
  const adopted = Boolean(adoption?.signature);
  return (
    <div
      style={{
        border: `1px dashed ${palette.border}`,
        borderRadius: 14,
        padding: '12px 14px',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: 12, color: palette.accentMuted }}>Signature adoption</p>
        <strong style={{ fontSize: 14, color: palette.text }}>
          {adopted ? 'Ready to insert' : 'Not adopted'}
        </strong>
        <div style={{ fontSize: 12, color: palette.accentMuted }}>
          {adopted ? adoption?.method : `Use ${signerName || 'your name'} to generate`}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {adopted && (
          <button
            type="button"
            onClick={onClear}
            style={{
              border: `1px solid ${palette.border}`,
              background: '#fff',
              color: '#0f172a',
              borderRadius: 12,
              padding: '8px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={onAdopt}
          style={{
            border: 'none',
            background: palette.accent,
            color: '#fff',
            borderRadius: 12,
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: shadows.pill,
            minWidth: 90,
          }}
        >
          {adopted ? 'Update' : 'Adopt'}
        </button>
      </div>
    </div>
  );
}

function Complete({
  token,
  values,
  disabled,
  onSuccess,
  onError,
}: {
  token: string;
  values: Record<string, any>;
  disabled: boolean;
  onSuccess: (info: CompletionResult) => void;
  onError: (msg: string) => void;
}) {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
  const [sending, setSending] = useState(false);
  const onComplete = async () => {
    const missingRequired = Object.values(values).some((meta: any) => {
      const mustFill =
        Boolean(meta?.required) || meta.type === 'signature' || meta.type === 'initials';
      if (!mustFill) return false;
      if (meta.type === 'checkbox') return meta.value !== true;
      return !meta.value;
    });
    if (missingRequired) {
      alert('Please fill all required fields before completing.');
      return;
    }
    setSending(true);
    const payload = { values };
    const r = await fetch(`${base}/api/sign/${token}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) {
      onError(j?.detail || 'Failed to complete.');
      if (LOGGING_ENABLED) {
        logEvent('sign_complete_error', { status: r.status, detail: j?.detail });
      }
      setSending(false);
      return;
    }
    let message = 'Completion recorded. We will email the final packet once all signers finish.';
    if (j.sealed && j.sha256_final) {
      message = `All signers complete. Final SHA256: ${j.sha256_final}`;
    } else if (j.status === 'waiting') {
      const remaining =
        typeof j.waiting_on === 'number' ? `${j.waiting_on} signer(s)` : 'other signers';
      message = `Thanks! Waiting on ${remaining} before sealing.`;
    } else if (j.sha256_final) {
      message = `Document sealed. SHA256: ${j.sha256_final}`;
    } else if (j.status === 'completed') {
      message = 'Your signature has been recorded.';
    }
    onSuccess({
      message,
      status: j.status || (j.sealed ? 'sealed' : undefined),
      waitingOn: j.waiting_on,
      sealed: Boolean(j.sealed),
      sha: j.sha256_final,
    });
    if (LOGGING_ENABLED) {
      logEvent('sign_complete_success', { sealed: Boolean(j.sealed), waiting: j.waiting_on });
    }
    setSending(false);
  };
  return (
    <button
      onClick={onComplete}
      disabled={disabled || sending}
      style={{
        background: palette.accent,
        color: '#fff',
        border: 'none',
        borderRadius: 16,
        padding: '16px 34px',
        fontSize: 16,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        cursor: disabled || sending ? 'not-allowed' : 'pointer',
        opacity: disabled || sending ? 0.55 : 1,
        width: '100%',
        boxShadow: shadows.pill,
      }}
    >
      {sending && (
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.4)',
            borderTopColor: '#fff',
            display: 'inline-block',
            animation: 'spin 0.9s linear infinite',
          }}
        />
      )}
      {sending ? 'Finishing…' : 'Finish and Sign'}
    </button>
  );
}


function SignatureAdoptionDialog({
  open,
  onClose,
  onSave,
  defaultName,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (adoption: SignatureAdoption) => void;
  defaultName: string;
}) {
  const [tab, setTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [drawSignature, setDrawSignature] = useState<string | null>(null);
  const [drawInitials, setDrawInitials] = useState<string | null>(null);
  const [typedName, setTypedName] = useState(defaultName || '');
  const [typedInitials, setTypedInitials] = useState<string>(() =>
    toInitials(defaultName || '')
  );
  const [typedFont, setTypedFont] = useState<string>('script');
  const [typedSignatureImage, setTypedSignatureImage] = useState<string | null>(null);
  const [typedInitialsImage, setTypedInitialsImage] = useState<string | null>(null);
  const [uploadSignature, setUploadSignature] = useState<string | null>(null);
  const [uploadInitials, setUploadInitials] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTypedName(defaultName || '');
    setTypedInitials(toInitials(defaultName || ''));
  }, [defaultName, open]);

  useEffect(() => {
    if (tab !== 'type') return;
    const sigImage = renderTextImage(typedName || 'Signature', {
      fontId: typedFont,
      width: 380,
      height: 150,
      fontSize: 42,
    });
    const initImage = renderTextImage(typedInitials || 'I', {
      fontId: typedFont,
      width: 220,
      height: 120,
      fontSize: 46,
    });
    setTypedSignatureImage(sigImage);
    setTypedInitialsImage(initImage);
  }, [typedName, typedInitials, typedFont, tab]);

  if (!open) return null;

  const adopt = () => {
    setError(null);
    let payload: SignatureAdoption | null = null;
    if (tab === 'draw') {
      if (!drawSignature) {
        setError('Please draw a signature.');
        return;
      }
      payload = {
        signature: drawSignature,
        initials: drawInitials || drawSignature,
        method: 'draw',
        signerName: typedName,
        initialsText: typedInitials,
      };
    }
    if (tab === 'type') {
      if (!typedSignatureImage) {
        setError('Unable to generate typed signature.');
        return;
      }
      payload = {
        signature: typedSignatureImage,
        initials: typedInitialsImage || typedSignatureImage,
        method: 'type',
        font: typedFont,
        signerName: typedName,
        initialsText: typedInitials,
      };
    }
    if (tab === 'upload') {
      if (!uploadSignature) {
        setError('Upload a signature image to continue.');
        return;
      }
      payload = {
        signature: uploadSignature,
        initials: uploadInitials || uploadSignature,
        method: 'upload',
        signerName: typedName,
        initialsText: typedInitials,
      };
    }
    if (!payload) return;
    onSave(payload);
  };

  const uploadHandler = async (
    e: ChangeEvent<HTMLInputElement>,
    setter: (val: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    const maxSize = 1.5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('Image too large. Please upload under 1.5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      if (typeof res === 'string') {
        const base64 = res.split(',')[1] || res;
        setter(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#fff',
          color: '#0f172a',
          borderRadius: 18,
          width: 'min(860px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 30px 90px rgba(15,23,42,0.35)',
          padding: '20px 22px 24px',
          border: `1px solid ${palette.border}`,
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Adopt signature
            </p>
            <strong style={{ fontSize: 20, display: 'block', marginTop: 4 }}>Sign once, reuse everywhere</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 18,
              cursor: 'pointer',
              color: '#475569',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
          {(['draw', 'type', 'upload'] as const).map((mode) => {
            const active = tab === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setTab(mode)}
                style={{
                  border: `1px solid ${active ? palette.accent : palette.border}`,
                  background: active ? 'rgba(37, 99, 235, 0.08)' : '#fff',
                  color: active ? '#0f172a' : '#475569',
                  borderRadius: 12,
                  padding: '10px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: active ? 700 : 500,
                }}
              >
                {mode === 'draw' ? 'Draw' : mode === 'type' ? 'Type' : 'Upload'}
              </button>
            );
          })}
        </div>
        {tab === 'draw' && (
          <section style={{ marginTop: 16, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#475569' }}>Signature</p>
              <SignaturePad width={420} height={160} value={drawSignature} onChange={setDrawSignature} />
            </div>
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#475569' }}>Initials (optional)</p>
              <SignaturePad width={220} height={120} value={drawInitials} onChange={setDrawInitials} />
            </div>
          </section>
        )}
        {tab === 'type' && (
          <section style={{ marginTop: 16, display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13, color: '#475569' }}>
                Full name
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    marginTop: 6,
                    borderRadius: 10,
                    border: `1px solid ${palette.border}`,
                    fontSize: 14,
                  }}
                  placeholder="Full name"
                />
              </label>
              <label style={{ fontSize: 13, color: '#475569' }}>
                Initials
                <input
                  type="text"
                  value={typedInitials}
                  onChange={(e) => setTypedInitials(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    marginTop: 6,
                    borderRadius: 10,
                    border: `1px solid ${palette.border}`,
                    fontSize: 14,
                  }}
                  placeholder="Initials"
                />
              </label>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 13, color: '#475569' }}>Font style</p>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                  {Object.keys(FONT_STACKS).map((fontId) => {
                    const active = fontId === typedFont;
                    return (
                      <button
                        key={fontId}
                        type="button"
                        onClick={() => setTypedFont(fontId)}
                        style={{
                          border: `1px solid ${active ? palette.accent : palette.border}`,
                          background: active ? 'rgba(37, 99, 235, 0.08)' : '#fff',
                          borderRadius: 10,
                          padding: '10px 8px',
                          fontSize: 14,
                          cursor: 'pointer',
                          fontFamily: resolveFontStack(fontId),
                        }}
                      >
                        {fontId}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div
                style={{
                  border: `1px dashed ${palette.border}`,
                  borderRadius: 14,
                  padding: 12,
                  background: '#f8fafc',
                }}
              >
                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#475569' }}>Signature preview</p>
                <div
                  style={{
                    height: 150,
                    borderRadius: 10,
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${palette.border}`,
                    overflow: 'hidden',
                  }}
                >
                  {typedSignatureImage ? (
                    <img src={`data:image/png;base64,${typedSignatureImage}`} alt="Typed signature preview" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                  ) : (
                    <span style={{ color: '#94a3b8' }}>Enter your name</span>
                  )}
                </div>
              </div>
              <div
                style={{
                  border: `1px dashed ${palette.border}`,
                  borderRadius: 14,
                  padding: 12,
                  background: '#f8fafc',
                }}
              >
                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#475569' }}>Initials preview</p>
                <div
                  style={{
                    height: 120,
                    borderRadius: 10,
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${palette.border}`,
                    overflow: 'hidden',
                  }}
                >
                  {typedInitialsImage ? (
                    <img src={`data:image/png;base64,${typedInitialsImage}`} alt="Typed initials preview" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                  ) : (
                    <span style={{ color: '#94a3b8' }}>Enter initials</span>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
        {tab === 'upload' && (
          <section style={{ marginTop: 16, display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <UploadBox
              label="Signature image"
              value={uploadSignature}
              onChange={(e) => uploadHandler(e, setUploadSignature)}
              accept="image/*"
            />
            <UploadBox
              label="Initials image (optional)"
              value={uploadInitials}
              onChange={(e) => uploadHandler(e, setUploadInitials)}
              accept="image/*"
            />
          </section>
        )}
        {error && (
          <div style={{ marginTop: 14, color: '#b91c1c', fontSize: 13, background: '#fef2f2', padding: '10px 12px', borderRadius: 10, border: '1px solid #fecdd3' }}>
            {error}
          </div>
        )}
        <footer
          style={{
            marginTop: 18,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              border: `1px solid ${palette.border}`,
              background: '#fff',
              color: '#0f172a',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={adopt}
            style={{
              border: 'none',
              background: palette.accent,
              color: '#fff',
              borderRadius: 12,
              padding: '12px 18px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: shadows.pill,
            }}
          >
            Save and continue
          </button>
        </footer>
      </div>
    </div>
  );
}

function UploadBox({
  label,
  value,
  accept,
  onChange,
}: {
  label: string;
  value: string | null;
  accept: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div
      style={{
        border: `1px dashed ${palette.border}`,
        borderRadius: 14,
        padding: '14px 12px',
        background: '#f8fafc',
      }}
    >
      <p style={{ margin: '0 0 10px', fontSize: 13, color: '#475569' }}>{label}</p>
      <label
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: '10px 12px',
          background: '#fff',
          cursor: 'pointer',
          fontSize: 13,
          color: '#0f172a',
        }}
      >
        <input type="file" accept={accept} onChange={onChange} style={{ display: 'none' }} />
        <span role="img" aria-hidden="true">
          📁
        </span>
        <span>{value ? 'Replace image' : 'Choose an image'}</span>
      </label>
      {value && (
        <div
          style={{
            marginTop: 10,
            borderRadius: 10,
            overflow: 'hidden',
            border: `1px solid ${palette.border}`,
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 120,
          }}
        >
          <img
            src={`data:image/png;base64,${value}`}
            alt={`${label} preview`}
            style={{ maxWidth: '100%', maxHeight: 160 }}
          />
        </div>
      )}
    </div>
  );
}

function SignaturePad({
  width,
  height,
  value,
  onChange,
}: {
  width: number;
  height: number;
  value: string | null;
  onChange: (val: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const ratioRef = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    ratioRef.current = ratio;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctxRef.current = ctx;
    ctx.clearRect(0, 0, width, height);
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = `data:image/png;base64,${value}`;
    }
  }, [width, height, value]);

  const getPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPoint.current = getPoint(event);
  };

  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    event.preventDefault();
    const ctx = ctxRef.current;
    if (!ctx || !lastPoint.current) return;
    const point = getPoint(event);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
  };

  const stopDrawing = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    const canvas = canvasRef.current;
    const ratio = ratioRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1] || dataUrl;
    onChange(base64);
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(ratio, ratio);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const ratio = ratioRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(ratio, ratio);
    onChange(null);
  };

  return (
    <div style={{ border: `2px dashed ${palette.border}`, borderRadius: 12, position: 'relative', background: '#fff' }}>
      <canvas
        ref={canvasRef}
        style={{ width: `${width}px`, height: `${height}px`, display: 'block', touchAction: 'none' }}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <button
        type="button"
        onClick={clear}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          border: 'none',
          background: '#0f172a',
          color: '#fff',
          borderRadius: 999,
          padding: '6px 10px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Clear
      </button>
    </div>
  );
}

function PdfSigningSurface({
  pages,
  loading,
  error,
  fields,
  values,
  onChange,
  mode = 'edit',
  renderOverlays = true,
  registerFieldRef,
  activeFieldId,
  highlightedFieldId,
  onFocusField,
  adoption,
  onInsertAdoption,
}: {
  pages: PageRender[];
  loading: boolean;
  error: string | null;
  fields: any[];
  values: Record<string, any>;
  onChange: (field: any, value: any) => void;
  mode?: 'edit' | 'view';
  renderOverlays?: boolean;
  registerFieldRef?: (id: string, el: HTMLElement | null) => void;
  activeFieldId?: string | null;
  highlightedFieldId?: string | null;
  onFocusField?: (id: string) => void;
  adoption?: SignatureAdoption | null;
  onInsertAdoption?: (id: string) => void;
}) {
  if (error) {
    return <div style={{ marginTop: 16, color: 'red' }}>Failed to load PDF: {error}</div>;
  }
  if (loading || !pages.length) {
    return <div style={{ marginTop: 16 }}>Loading PDF…</div>;
  }
  return (
    <section style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 32 }}>
      {pages.map((page) => {
        const pageFields = fields.filter((field) => (field.page || 1) === page.pageIndex + 1);
        return (
          <div
            key={page.pageIndex}
            data-page-container="true"
            style={{
              position: 'relative',
              width: page.width,
              margin: '0 auto',
              boxShadow: shadows.card,
              borderRadius: 18,
              overflow: 'hidden',
              background: '#fff',
              border: `1px solid ${palette.border}`,
            }}
          >
            <img src={page.dataUrl} alt={`Page ${page.pageIndex + 1}`} style={{ width: '100%', display: 'block' }} />
            {renderOverlays &&
              pageFields.map((field) => (
                <FieldOverlay
                  key={field.id}
                  field={field}
                  pageMeta={page}
                  value={values[String(field.id)]?.value}
                  onChange={onChange}
                  mode={mode}
                  registerFieldRef={registerFieldRef}
                  active={activeFieldId === String(field.id)}
                  highlighted={highlightedFieldId === String(field.id)}
                  onFocusField={onFocusField}
                  adoption={adoption}
                  onInsertAdoption={onInsertAdoption}
                />
              ))}
          </div>
        );
      })}
    </section>
  );
}

function FieldOverlay({
  field,
  pageMeta,
  value,
  onChange,
  mode,
  registerFieldRef,
  active,
  highlighted,
  onFocusField,
  adoption,
  onInsertAdoption,
}: {
  field: any;
  pageMeta: PageRender;
  value: any;
  onChange: (field: any, value: any) => void;
  mode: 'edit' | 'view';
  registerFieldRef?: (id: string, el: HTMLElement | null) => void;
  active?: boolean;
  highlighted?: boolean;
  onFocusField?: (id: string) => void;
  adoption?: SignatureAdoption | null;
  onInsertAdoption?: (id: string) => void;
}) {
  const screenWidth = field.w * pageMeta.scale;
  const screenHeight = field.h * pageMeta.scale;
  const screenX = field.x * pageMeta.scale;
  const screenY = (pageMeta.baseHeight - (field.y + field.h)) * pageMeta.scale;
  const fieldId = String(field.id);
  const shouldHighlight = mode === 'edit' && (active || highlighted);
  const baseStyle = {
    position: 'absolute' as const,
    left: screenX,
    top: screenY,
    width: screenWidth,
    height: screenHeight,
    boxSizing: 'border-box' as const,
    pointerEvents: mode === 'view' ? 'none' : ('auto' as const),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'box-shadow 0.18s ease, border-color 0.18s ease, background-color 0.18s ease',
  };
  const highlightStyle = shouldHighlight
    ? { boxShadow: '0 0 0 3px rgba(37,99,235,0.32)', borderColor: palette.accent }
    : {};
  const handleFocus = () => {
    if (mode === 'view') return;
    onFocusField?.(fieldId);
  };
  const fontFamily = resolveFontStack(field.font_family);

  if (field.type === 'text') {
    if (mode === 'view') {
      return (
        <div
          ref={(el) => registerFieldRef?.(fieldId, el)}
          onClick={handleFocus}
          data-field-id={fieldId}
          tabIndex={mode === 'edit' ? -1 : undefined}
          style={{
            ...baseStyle,
            display: 'flex',
            alignItems: 'center',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: palette.border,
            borderRadius: 4,
            background: 'rgba(255,255,255,0.9)',
            justifyContent: 'flex-start',
            padding: '0 6px',
            ...highlightStyle,
          }}
        >
          <span style={{ fontSize: 12, color: '#0f172a', fontFamily }}>{value || ''}</span>
        </div>
      );
    }
    return (
      <div
        ref={(el) => registerFieldRef?.(fieldId, el)}
        onClick={handleFocus}
        data-field-id={fieldId}
        tabIndex={mode === 'edit' ? -1 : undefined}
        style={{
          ...baseStyle,
          display: 'block',
          ...highlightStyle,
        }}
      >
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(field, e.target.value)}
          onBlur={(e) => onChange(field, e.target.value, { commit: true, allowAutoAdvance: true })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onChange(field, (e.target as HTMLInputElement).value, {
                commit: true,
                allowAutoAdvance: true,
              });
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            padding: 6,
            background: 'rgba(255,255,255,0.9)',
            border: `1px solid ${palette.border}`,
            borderRadius: 4,
            fontSize: 14,
            fontFamily,
            boxSizing: 'border-box',
          }}
        />
      </div>
    );
  }
  if (field.type === 'date' || field.type === 'datetime') {
    const inputType = field.type === 'datetime' ? 'datetime-local' : 'date';
    const handleDateChange = (event: ChangeEvent<HTMLInputElement>, opts?: { suppressActive?: boolean }) => {
      const val = event.target.value;
      const valid = event.target.validity?.valid ?? true;
      onChange(field, val, {
        commit: true,
        valid,
        allowAutoAdvance: valid,
        suppressActiveUpdate: opts?.suppressActive,
      });
    };
    if (mode === 'view') {
      return (
        <div
          ref={(el) => registerFieldRef?.(fieldId, el)}
          onClick={handleFocus}
          data-field-id={fieldId}
          tabIndex={mode === 'edit' ? -1 : undefined}
          style={{
            ...baseStyle,
            display: 'flex',
            alignItems: 'center',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: palette.border,
            borderRadius: 4,
            background: 'rgba(255,255,255,0.9)',
            justifyContent: 'flex-start',
            padding: '0 6px',
            ...highlightStyle,
          }}
        >
          <span style={{ fontSize: 12, color: '#0f172a', fontFamily }}>{value || ''}</span>
        </div>
      );
    }
    return (
      <div
        ref={(el) => registerFieldRef?.(fieldId, el)}
        onClick={handleFocus}
        data-field-id={fieldId}
        tabIndex={mode === 'edit' ? -1 : undefined}
        style={{
          ...baseStyle,
          display: 'block',
          ...highlightStyle,
        }}
      >
        <input
          type={inputType}
          value={value ?? ''}
          onChange={handleDateChange}
          onBlur={(e) => handleDateChange(e, { suppressActive: true })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const target = e.target as HTMLInputElement;
              const valid = target.validity?.valid ?? true;
              onChange(field, target.value, { commit: true, valid, allowAutoAdvance: valid });
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            padding: 6,
            background: 'rgba(255,255,255,0.9)',
            border: `1px solid ${palette.border}`,
            borderRadius: 4,
            boxSizing: 'border-box',
          }}
        />
      </div>
    );
  }
  if (field.type === 'checkbox') {
    if (mode === 'view') {
      return (
        <div
          ref={(el) => registerFieldRef?.(fieldId, el)}
          onClick={handleFocus}
          tabIndex={mode === 'edit' ? -1 : undefined}
          style={{
            ...baseStyle,
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: '#94a3b8',
            borderRadius: 4,
            background: 'rgba(255,255,255,0.9)',
            ...highlightStyle,
          }}
        >
          {value ? <span style={{ fontSize: 16, color: '#0f172a' }}>✔</span> : null}
        </div>
      );
    }
    return (
      <div
        ref={(el) => registerFieldRef?.(fieldId, el)}
        onClick={handleFocus}
        data-field-id={fieldId}
        tabIndex={mode === 'edit' ? -1 : undefined}
        style={{
          ...baseStyle,
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: '#94a3b8',
          borderRadius: 4,
          background: 'rgba(255,255,255,0.9)',
          ...highlightStyle,
        }}
      >
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(field, e.target.checked)}
          style={{ width: 20, height: 20 }}
        />
      </div>
    );
  }
  if (field.type === 'signature' || field.type === 'initials') {
    const adoptedImage = adoption
      ? field.type === 'initials'
        ? adoption.initials
        : adoption.signature
      : null;
    const showInsert = mode === 'edit' && adoptedImage && !value;
    if (mode === 'view') {
      return (
        <div
          ref={(el) => registerFieldRef?.(fieldId, el)}
          onClick={handleFocus}
          data-field-id={fieldId}
          tabIndex={mode === 'edit' ? -1 : undefined}
          style={{
            ...baseStyle,
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: '#2563eb',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.9)',
            ...highlightStyle,
          }}
        >
          {value ? (
            <img
              src={`data:image/png;base64,${value}`}
              alt="Signature"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <span style={{ fontSize: 12, color: '#64748b' }}>Signature</span>
          )}
        </div>
      );
    }
    return (
      <div
        ref={(el) => registerFieldRef?.(fieldId, el)}
        onClick={handleFocus}
        data-field-id={fieldId}
        style={{
          ...baseStyle,
          border: '2px dashed ' + palette.accent,
          borderRadius: 6,
          background: 'rgba(255,255,255,0.9)',
          overflow: 'visible',
          boxShadow: shouldHighlight ? '0 0 0 3px rgba(37,99,235,0.32)' : undefined,
        }}
      >
        <SignatureFieldCanvas
          style={{
            position: 'absolute',
            inset: 0,
          }}
          width={screenWidth}
          height={screenHeight}
          value={value}
          onChange={(val) => onChange(field, val)}
          fieldId={fieldId}
          onFocusField={onFocusField}
          active={active}
          highlighted={highlighted}
          frameless
        />
        {showInsert && (
          <div
            style={{
              position: 'absolute',
              top: -34,
              right: -4,
              display: 'flex',
              gap: 6,
              zIndex: 4,
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInsertAdoption?.(fieldId);
                if (LOGGING_ENABLED) {
                  logEvent('sign_insert_signature', { fieldId });
                }
              }}
              style={{
                border: 'none',
                background: palette.accent,
                color: '#fff',
                borderRadius: 12,
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: shadows.pill,
              }}
            >
              Sign
            </button>
          </div>
        )}
        {!value && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              color: '#64748b',
              fontSize: 12,
            }}
          >
            {field.type === 'initials' ? 'Initials' : 'Signature'}
          </div>
        )}
      </div>
    );
  }
  return null;
}

function SignatureFieldCanvas({
  style,
  width,
  height,
  value,
  onChange,
  fieldId,
  registerFieldRef,
  onFocusField,
  active,
  highlighted,
  frameless = false,
}: {
  style: CSSProperties;
  width: number;
  height: number;
  value: string | null;
  onChange: (val: string | null) => void;
  fieldId: string;
  registerFieldRef?: (id: string, el: HTMLElement | null) => void;
  onFocusField?: (id: string) => void;
  active?: boolean;
  highlighted?: boolean;
  frameless?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const ratioRef = useRef(1);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const shouldHighlight = Boolean(active || highlighted);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    ratioRef.current = ratio;
    const scaledWidth = Math.max(1, Math.round(width * ratio));
    const scaledHeight = Math.max(1, Math.round(height * ratio));
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctxRef.current = ctx;
    ctx.clearRect(0, 0, width, height);
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = `data:image/png;base64,${value}`;
    }
  }, [width, height, value]);

  const getPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    onFocusField?.(fieldId);
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPoint.current = getPoint(event);
  };

  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    event.preventDefault();
    const ctx = ctxRef.current;
    if (!ctx || !lastPoint.current) return;
    const point = getPoint(event);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
  };

  const stopDrawing = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1] || dataUrl;
    onChange(base64);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const ratio = ratioRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(ratio, ratio);
    onChange(null);
  };

  const compact = width < 200 || height < 110;
  const clearLabel = compact ? '✕' : 'Clear';
  return (
    <div
      ref={(el) => registerFieldRef?.(fieldId, el)}
      data-filled={value ? 'true' : 'false'}
      tabIndex={-1}
      style={{
        ...style,
        boxSizing: 'border-box',
        border: frameless ? undefined : `2px dashed ${palette.accent}`,
        borderRadius: 6,
        background: frameless ? 'transparent' : 'rgba(255,255,255,0.9)',
        overflow: 'visible',
        boxShadow: shouldHighlight ? '0 0 0 3px rgba(37,99,235,0.32)' : undefined,
      }}
    >
      <canvas
        ref={canvasRef}
        id={`sig-canvas-${fieldId}`}
        tabIndex={0}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <button
        type="button"
        onClick={clear}
        style={{
          position: 'absolute',
          top: compact ? -10 : -14,
          right: compact ? -10 : -14,
          background: 'rgba(15, 23, 42, 0.75)',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          padding: compact ? '0 6px' : '2px 10px',
          fontSize: compact ? 10 : 11,
          cursor: 'pointer',
          lineHeight: compact ? '20px' : '22px',
          minHeight: compact ? 20 : 24,
        }}
      >
        {clearLabel}
      </button>
    </div>
  );
}

function CompletionView({
  info,
  pages,
  loading,
  error,
  fields,
  values,
  renderOverlays = true,
  onRetryPdf,
}: {
  info: CompletionResult;
  pages: PageRender[];
  loading: boolean;
  error: string | null;
  fields: any[];
  values: Record<string, any>;
  renderOverlays?: boolean;
  onRetryPdf?: () => void;
}) {
  return (
    <div className="completion-wrapper">
      <section className="completion-panel">
        <div>
          <p className="label">Status</p>
          <strong className="status-title">Document signed</strong>
        </div>
        <p className="message">{info.message}</p>
        {error && (
          <div className="completion-alert">
            <strong>Viewer error:</strong> {String(error)}
            {onRetryPdf && (
              <button type="button" onClick={onRetryPdf} className="link-button">
                Retry
              </button>
            )}
          </div>
        )}
      </section>
      <section className="completion-viewer">
        <PdfSigningSurface
          pages={pages}
          loading={loading}
          error={error}
          fields={fields}
          values={values}
          onChange={() => {}}
          mode="view"
          renderOverlays={renderOverlays}
        />
      </section>
    </div>
  );
}

async function renderPdfPages(buffer: ArrayBuffer): Promise<PageRender[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf');
  const typedArray = new Uint8Array(buffer);
  const pdf = await pdfjs.getDocument({ data: typedArray }).promise;
  const pages: PageRender[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxWidth = Math.min(900, typeof window !== 'undefined' ? window.innerWidth - 80 : 900);
    const scale = Math.min(2, maxWidth / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to render PDF page');
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push({
      pageIndex: pageNumber - 1,
      dataUrl: canvas.toDataURL(),
      width: viewport.width,
      height: viewport.height,
      scale,
      baseWidth: baseViewport.width,
      baseHeight: baseViewport.height,
    });
  }
  return pages;
}

function renderTextImage(
  text: string,
  {
    fontId = DEFAULT_FONT,
    width,
    height,
    fontSize = 42,
  }: { fontId?: string; width: number; height: number; fontSize?: number }
): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#0f172a';
  ctx.font = `${fontSize}px ${resolveFontStack(fontId)}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 4);
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1] || dataUrl;
}

function toInitials(name: string): string {
  if (!name) return '';
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 3);
}
