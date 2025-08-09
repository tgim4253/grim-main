export function setTheme(mode: 'light' | 'dark', target: HTMLElement = document.documentElement) {
  target.setAttribute('data-theme', mode);
}
