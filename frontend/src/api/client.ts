import axios from "axios";

// In dev, leave baseURL empty so requests go through Vite's /api proxy (same origin).
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  xsrfCookieName: "csrftoken",
  xsrfHeaderName: "X-CSRFToken",
});

export function apiUrl(path: string): string {
  const baseURL = client.defaults.baseURL;
  if (!baseURL) return path;
  if (!/^https?:\/\//i.test(baseURL)) return path;
  return new URL(path, baseURL).toString();
}

export default client;
