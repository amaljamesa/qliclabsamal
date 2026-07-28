export const environment = {
  production: true,
  // Relative path — Netlify's netlify.toml proxies /api/* to the Render backend,
  // so the browser calls this same-origin and never needs the backend's real URL.
  apiUrl: '/api'
};
