/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

interface ImportMetaEnv {
  readonly VITE_KC_AGENT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Build-time constants injected by vite.config.ts
declare const __APP_VERSION__: string;
declare const __COMMIT_HASH__: string;
declare const __BUILD_TIME__: string;
declare const __DEV_MODE__: boolean;

declare module '*.css' {
  const content: string;
  export default content;
}
