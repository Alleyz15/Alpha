// Start the API.
//
//   npm run api
//   node --env-file-if-exists=../.env scripts/serve.js
//
// Nothing here sends a transaction. The fill path is Phase 3.

import { startApi } from '../src/api/server.js';

const server = await startApi();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n${signal} - shutting down`);
    server.close(() => process.exit(0));
  });
}
