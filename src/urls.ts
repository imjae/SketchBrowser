export const HOME_URL = 'sketch://welcome';
export const PRACTICE_URL = 'sketch://practice';
export const isDemoUrl = (url: string) => url === HOME_URL || url === PRACTICE_URL;

export function pageKey(value: string): string {
  if (isDemoUrl(value)) return value;
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('HTTP 또는 HTTPS 주소를 입력해 주세요.');
  // Ordinary section links share ink; hash-based app routes keep separate notes.
  if (!url.hash.startsWith('#/') && !url.hash.startsWith('#!')) url.hash = '';
  return url.toString();
}

export function resolveAddress(input: string): string {
  const value = input.trim();
  if (!value) return HOME_URL;
  if (isDemoUrl(value)) return value;
  if (/^https?:\/\//i.test(value)) return pageKey(value);
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[\w.-]+:\d+(\/|$)/.test(value)) {
    throw new Error('HTTP 또는 HTTPS 주소를 입력해 주세요.');
  }
  if (!/\s/.test(value) && (/^[\w-]+(?:\.[\w-]+)+(?:[:/\?#]|$)/.test(value) || /^localhost(?::\d+)?(?:\/|$)/.test(value))) {
    return pageKey(`https://${value}`);
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
}

export function shortAddress(url: string): string {
  if (isDemoUrl(url)) return url === HOME_URL ? '시작 노트' : '연습 노트';
  try { const u = new URL(url); return u.host + (u.pathname === '/' ? '' : u.pathname); }
  catch { return url; }
}
