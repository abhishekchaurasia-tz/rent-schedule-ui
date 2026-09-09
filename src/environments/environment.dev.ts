export const environment = {
  production: false,
  name: 'dev',
  // Served through the dev-server proxy (proxy.conf.dev.json ->
  // https://api-dev-my.innago.com) so the browser stays same-origin and CORS
  // never comes into play.
  apiBaseUrl: '/billing'
};
