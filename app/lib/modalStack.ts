export function isTopmostDialog<T>(dialog: T, dialogs: Iterable<T>): boolean {
  let topmostDialog: T | undefined;
  for (const candidate of dialogs) topmostDialog = candidate;
  return topmostDialog === dialog;
}
