import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT skal være et heltal mellem 1 og 65535.');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};
const headers = {
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
};
function reply(res, status, text) {
  res.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return reply(res, 405, 'Metoden understøttes ikke.');
  }
  let pathname;
  try {
    // Decode before resolving so encoded separators cannot bypass the root check.
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return reply(res, 400, 'Ugyldig adresse.');
  }
  if (pathname.includes('\0') || pathname.includes('\\')) return reply(res, 400, 'Ugyldig filsti.');
  const segments = pathname.split('/');
  if (segments.some(part => part.startsWith('.') || part.includes(':'))) return reply(res, 403, 'Adgang afvist.');
  let file = resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + sep)) return reply(res, 403, 'Adgang afvist.');
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = resolve(file, 'index.html');
    const contents = await readFile(file);
    res.writeHead(200, { ...headers, 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': contents.length });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    reply(res, error.code === 'EACCES' ? 403 : 404, 'Filen findes ikke.');
  }
});
server.on('error', error => {
  console.error(`Serveren kunne ikke starte: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`Arbejde kører på http://${host}:${port}`);
  console.log('Stop serveren med Ctrl+C.');
});
