// The open dialog (About, Help) is a flag in the URL hash ("#about"), so a dialog can be linked and Back closes it.
import { formatHash, hashParams } from './hash';

export const DIALOGS = ['about'] as const;
export type DialogId = (typeof DIALOGS)[number];

/** The dialog a location hash opens, if any. */
export function parseDialogHash(hash: string): DialogId | null {
  const params = hashParams(hash);
  return DIALOGS.find((id) => params.has(id)) ?? null;
}

/** `hash` with `dialog` open (or none, for null), keeping the other parameters. */
export function withDialogHash(hash: string, dialog: DialogId | null): string {
  const params = hashParams(hash);
  for (const id of DIALOGS) params.delete(id);
  if (dialog) params.set(dialog, '');
  return formatHash(params);
}
