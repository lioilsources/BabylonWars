// Registrace service workeru (jen produkční build; ve vývoji by cache překážela).
export function registerServiceWorker(base: string): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((e: unknown) => console.warn('SW', e));
  });
}
