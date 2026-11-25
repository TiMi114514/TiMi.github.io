const SESSION_KEY = 'paperwise.analytics.session';
const VISITOR_KEY = 'alevel-hub.visitor';

/**
 * Anonymous id that stays the same across tabs and visits in this browser.
 * Used for live presence so one guest with three tabs counts once.
 */
export function getVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const id = getBrowserSessionId();
    window.localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return getBrowserSessionId();
  }
}

/** Anonymous browser-session id shared by analytics and guest downloads. */
export function getBrowserSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
