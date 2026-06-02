export const GH_API = "https://api.github.com";

export type Fetcher = (path: string, token?: string) => Promise<Response>;

export function ghFetch(
  path: string,
  token?: string,
  accept = "application/vnd.github+json"
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${GH_API}${path}`, { headers });
}
