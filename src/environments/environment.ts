export const environment = {
  production: false,
  name: 'local',
  apiBaseUrl: 'http://localhost:5169',
  // merlin, through the same gateway. Nothing serves it locally, so the owner's bank list is empty
  // on a local run and the panel says so rather than pretending.
  monolithBaseUrl: '/api'
};
