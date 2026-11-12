// Touch, fullscreen and background handling.

export const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** No double-tap zoom, long-press menus or pinch gestures. */
export function lockGestures(): void {
  const block = (e: Event) => e.preventDefault();
  document.addEventListener('dblclick', block, { passive: false });
  document.addEventListener('contextmenu', block, { passive: false });
  document.addEventListener('gesturestart', block, { passive: false });
  document.addEventListener('gesturechange', block, { passive: false });
}

export function enterFullscreen(): void {
  if (isIOS) return; // not supported on iOS
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

export function onBackground(hidden: () => void, visible: () => void): void {
  document.addEventListener('visibilitychange', () => (document.hidden ? hidden() : visible()));
}

export function query(): URLSearchParams {
  return new URLSearchParams(location.search);
}

export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
