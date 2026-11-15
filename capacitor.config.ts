const config = {
  appId: 'app.kestrel.secure',
  appName: 'Kestrel',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
};

export default config;
