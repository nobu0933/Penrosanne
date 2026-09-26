const DIRECTORIES = { cpu: 'cpu-generation-data', battle: 'battle-data' };

export async function listLocalDataFiles(kind) {
	if (!DIRECTORIES[kind]) throw new RangeError('Unknown local data folder.');
	const response = await fetch(`/api/local-data-files?kind=${kind}`, { cache: 'no-store' });
	if (!response.ok) throw new Error(`Folder listing failed (${response.status}). Start with npm run serve.`);
	const payload = await response.json();
	if (!Array.isArray(payload.files)) throw new Error('Invalid folder listing.');
	return payload.files.filter(file => typeof file.name === 'string' && file.name.toLowerCase().endsWith('.json'));
}

export async function readLocalDataFile(kind, name) {
	if (!DIRECTORIES[kind] || typeof name !== 'string' || !name.toLowerCase().endsWith('.json') || name.includes('/') || name.includes('\\')) throw new RangeError('Invalid local data file.');
	const response = await fetch(`/${DIRECTORIES[kind]}/${encodeURIComponent(name)}`, { cache: 'no-store' });
	if (!response.ok) throw new Error(`${name}: ${response.status}`);
	return response.json();
}
