// apps/guardian/nativewind-env.d.ts
/// <reference types="nativewind/types" />

// App.tsx imports global.css for NativeWind; Metro handles the css at
// bundle time, TypeScript just needs the module to exist.
declare module '*.css';
