// Types for generate.mjs, for dashboard/tests/unit/readme-logo.test.ts
export const SOURCE: URL;
export const ACCENT: string;
export const BACKGROUND: string;
export function brandLogo(svg: string, color?: string): string;
type Page = { file: string; width: number; height: number; html: string };
export function logoPage(svg: string): Page;
export function socialPreviewPage(svg: string): Page;
