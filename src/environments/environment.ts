export const environment = {
  production: false,
  name: 'local',
  // Served through the dev-server proxy (proxy.conf.local.json ->
  // http://localhost:5169) so the browser stays same-origin. Without this the
  // local API only allows the http://localhost:4200 origin, so any fallback
  // port (4201, 4202, ...) fails CORS preflight.
  apiBaseUrl: ''
};
