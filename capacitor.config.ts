// Capacitor obálka pro App Store a Google Play (F7). webDir = build s base './'.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ol1n.doggiowars',
  appName: 'DoggioWars',
  webDir: 'dist',
  backgroundColor: '#161936',
  ios: { contentInset: 'never', scrollEnabled: false },
  android: { backgroundColor: '#161936' },
  // celá obrazovka: skrytý stavový řádek i indikátor plochy / navigační lišta
  plugins: { SystemBars: { hidden: true } },
};

export default config;
