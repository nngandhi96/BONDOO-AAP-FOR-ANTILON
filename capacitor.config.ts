import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.bondoo',
  appName: 'Bondoo',
  webDir: 'dist',
  server: {
    // Bondoo is a TanStack Start (SSR) app, so the Android wrapper loads
    // the live hosted URL instead of a static export. Replace this with
    // your own domain once you connect one.
    url: 'https://bondoo-connect.lovable.app',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#FFF8F0',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#FFF8F0',
    },
  },
};

export default config;