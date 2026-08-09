const BACKEND_URL: string = (import.meta.env.VITE_BACKEND_URL as string) ?? '';

const TOKEN_KEY = 'interviewpilot_token';

export function getBackendUrl(): string {
  return BACKEND_URL;
}

export function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = /^https?:\/\//i.test(input) ? input : `${BACKEND_URL}${input}`;
  const headers = new Headers(init?.headers);
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers, credentials: 'include' });
}
