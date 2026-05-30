import { config, assertToken } from './config.js';
import { createApp } from './app.js';

function main() {
  // Warn loudly but don't crash if the key is missing — the UI surfaces it too.
  try {
    assertToken();
  } catch (err) {
    console.warn(`\n⚠  ${(err as Error).message}\n`);
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`eBird Gap Finder server listening on http://localhost:${config.port}`);
    console.log(`  storage: ${config.storageBackend}  •  obs cache TTL: ${config.obsCacheTtlSeconds}s`);
  });

  // Shut down cleanly on Ctrl+C / kill so the process exits 0 (otherwise npm
  // reports the SIGINT exit code 130 as a failed lifecycle script).
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log('\nShutting down…');
      server.close(() => process.exit(0));
    });
  }
}

main();
