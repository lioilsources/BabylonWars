// Registrace service workeru (jen produkční build; ve vývoji by cache překážela).
// V nativní aplikaci (Capacitor) jsou soubory přímo v balíčku, SW tam nemá smysl.

/** Běží hra v Capacitor obálce? (window.Capacitor vkládá nativní strana) */
export function isNativeApp(): boolean {
  const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return c?.isNativePlatform?.() ?? false;
}
/**
 * Nový deploy: sw.js se kontroluje bez HTTP cache a znovu při návratu do
 * záložky (mobil drží hru otevřenou dny). Když převezme řízení nový SW,
 * zavolá se onUpdate — hra se buď hned načte znovu, nebo nabídne obnovení.
 */
export function registerServiceWorker(base: string, onUpdate: () => void): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator) || isNativeApp()) return;
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => { if (hadController) onUpdate(); });
  addEventListener('load', () => {
    sw.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' }).then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch((e: unknown) => console.warn('SW', e));
  });
}
