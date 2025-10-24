/// <reference types="vite/client" />

declare namespace NodeJS {
  interface ProcessEnv {
    VITE_API_BASE_URL?: string;
    VITE_DEV_SERVER_HOST?: string;
    VITE_DEV_SERVER_PORT?: string;
  }
}
