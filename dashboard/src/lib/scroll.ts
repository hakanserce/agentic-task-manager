const HIGHLIGHT_MS = 2000;

/** Scroll a task card into view and flash its border, as the legacy "needs:" links did. */
export function scrollToTask(id: string) {
  const el = document.getElementById('task-' + id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.style.borderColor = 'var(--yellow)';
  el.style.boxShadow = '0 0 12px rgba(210,153,34,0.3)';
  setTimeout(() => {
    el.style.borderColor = '';
    el.style.boxShadow = '';
  }, HIGHLIGHT_MS);
}
