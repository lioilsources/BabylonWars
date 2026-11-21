// Registrace service workeru (jen produkční build; ve vývoji by cache překážela).
// V nativní aplikaci (Capacitor) jsou soubory přímo v balíčku, SW tam nemá smysl.

/** Běží hra v Capacitor obálce? (window.Capacitor vkládá nativní strana) */
export function isNativeApp(): boolean {
  const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return c?.isNativePlatform?.() ?? false;
}
export function registerServiceWorker(base: string): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator) || isNativeApp()) return;
  addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((e: unknown) => console.warn('SW', e));
  });
}
