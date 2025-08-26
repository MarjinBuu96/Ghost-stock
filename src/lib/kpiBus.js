// Simple in-memory pub/sub keyed by userEmail (single server instance only)
const listeners = new Map();

export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => {
    const set = listeners.get(key);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) listeners.delete(key);
  };
}

export function publish(key, data) {
  const set = listeners.get(key);
  if (!set) return;
  for (const fn of set) { try { fn(data); } catch {} }
}
