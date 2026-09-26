import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const port = Number(process.argv[2] || 4173);
createServer(async (request, response) => {
	try {
		const url = new URL(request.url, 'http://localhost');
		const pathname = decodeURIComponent(url.pathname);
		if (pathname === '/api/local-data-files') {
			const directory = { cpu: 'cpu-generation-data', battle: 'battle-data' }[url.searchParams.get('kind')];
			if (!directory) { response.writeHead(400).end('Invalid kind'); return; }
			const folder = resolve(root, directory);
			const entries = await readdir(folder, { withFileTypes: true });
			const files = await Promise.all(entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json')).map(async entry => {
				const details = await stat(resolve(folder, entry.name));
				return { name: entry.name, modifiedAt: details.mtimeMs, size: details.size };
			}));
			files.sort((a, b) => b.modifiedAt - a.modifiedAt || b.name.localeCompare(a.name));
			response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify({ files }));
			return;
		}
		let target = resolve(root, `.${pathname}`);
		if (target !== root && !target.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
		if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
		const body = await readFile(target);
		response.writeHead(200, { 'Content-Type': `${types[extname(target)] || 'application/octet-stream'}; charset=utf-8` }).end(body);
	} catch { response.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Penrosanne: http://127.0.0.1:${port}/`));
