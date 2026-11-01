import { spawnSync } from 'node:child_process';

const files = ['app.js', 'panels.js', 'experience.js', 'domain.js', 'directory-domain.js', 'directory-ui.js', 'sw.js', 'serve.mjs', 'pdf-reader.js', 'schedule-parser.js', 'schedule-domain.js', 'schedule-import-ui.js', 'timer-domain.js', 'timer-controller.js', 'daily-tools.js'];
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
if (failed) process.exitCode = 1;
else console.log('Syntaks kontrolleret i alle appfiler.');
