/// <reference types="vite/client" />

import type { GrindSimAPI } from '../preload/index';

declare global {
  interface Window {
    grindSim: GrindSimAPI;
  }
}

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
