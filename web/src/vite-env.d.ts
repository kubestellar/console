/// <reference types="vite/client" />

// Build-time constants injected by vite.config.ts
declare const __APP_VERSION__: string;
declare const __COMMIT_HASH__: string;
declare const __BUILD_TIME__: string;

declare module '*.css' {
  const content: string;
  export default content;
}
