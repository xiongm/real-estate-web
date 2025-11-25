type EventName =
  | 'sign_consent'
  | 'sign_adoption'
  | 'sign_insert_signature'
  | 'sign_apply_all'
  | 'sign_draft_save_error'
  | 'sign_draft_save_success'
  | 'sign_complete_success'
  | 'sign_complete_error'
  | 'sign_pdf_error';

type LogPayload = Record<string, unknown>;

const LOG_PREFIX = '[signing]';
const noop = () => {};

function emitToConsole(event: EventName, payload?: LogPayload) {
  const data = payload ? JSON.stringify(payload) : '';
  // eslint-disable-next-line no-console
  console.info(LOG_PREFIX, event, data);
}

type AnalyticsHook = (event: EventName, payload?: LogPayload) => void;

let analyticsHook: AnalyticsHook | null = null;

export function registerAnalyticsHook(hook: AnalyticsHook | null) {
  analyticsHook = hook;
}

export function logEvent(event: EventName, payload?: LogPayload) {
  const hook = analyticsHook || noop;
  try {
    hook(event, payload);
  } catch {
    // ignore hook failures
  }
  emitToConsole(event, payload);
}
