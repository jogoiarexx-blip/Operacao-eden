import { existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
export function gameEntry() {
  return {
    name: 'eden-entry',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url?.startsWith('/?')) req.url = req.url.replace('/', '/dev.html');
        next();
      });
    },
    writeBundle(options) {
      const entry = resolve(options.dir, 'dev.html');
      if (existsSync(entry)) renameSync(entry, resolve(options.dir, 'index.html'));
    },
  };
}
