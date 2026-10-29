import { spawnSync } from 'node:child_process';

const files = ['app.js', 'panels.js', 'domain.js', 'sw.js', 'serve.mjs'];
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
if (failed) process.exitCode = 1;
else console.log('Syntaks kontrolleret i alle appfiler.');
