#!/usr/bin/env node

/**
 * Downloads a pinned, static snapshot of Genshin game data for the Advisor.
 *
 * The public site never calls a third-party game-data API at runtime. This
 * keeps search fast, gives us a reviewable snapshot in Git, and lets Cloudflare
 * cache the file normally. Meta recommendations live separately in
 * frontend/data/genshin-meta.json because raw game data cannot answer build or
 * Primogem-investment questions safely.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '..', 'frontend', 'data', 'genshin-catalog.json');
const endpoint = 'https://genshin-db-api.vercel.app/api/v5';
const folders = ['characters', 'talents', 'constellations', 'weapons', 'artifacts'];

async function fetchFolder(folder) {
  const url = new URL(`${endpoint}/${folder}`);
  url.searchParams.set('query', 'names');
  url.searchParams.set('matchCategories', 'true');
  url.searchParams.set('verboseCategories', 'true');
  url.searchParams.set('resultLanguage', 'English');

  const response = await fetch(url, {
    headers: { 'User-Agent': 'ZenithW-Genshin-Advisor/0.1 (+https://zenithw.space/genshin)' }
  });
  if (!response.ok) throw new Error(`${folder}: ${response.status} ${response.statusText}`);
  const result = await response.json();
  if (!Array.isArray(result) || result.length === 0) throw new Error(`${folder}: empty or invalid response`);
  return result;
}

function latestVersion(characters) {
  const comparable = value => String(value || '0').split('.').map(part => Number.parseInt(part, 10) || 0);
  return characters.reduce((latest, character) => {
    const next = comparable(character.version);
    const current = comparable(latest);
    for (let index = 0; index < Math.max(next.length, current.length); index += 1) {
      const a = next[index] || 0;
      const b = current[index] || 0;
      if (a !== b) return a > b ? character.version : latest;
    }
    return latest;
  }, 'unknown');
}

function imageSlug(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function addStableImages(collection, folder) {
  return collection.map(item => ({
    ...item,
    images: {
      ...(item.images || {}),
      zenithw_icon: `https://i2.wp.com/images.genshin-builds.com/genshin/${folder}/${imageSlug(item.name)}.png?strip=all&quality=100&w=96`
    }
  }));
}

const data = Object.fromEntries(await Promise.all(folders.map(async folder => [folder, await fetchFolder(folder)])));
data.weapons = addStableImages(data.weapons, 'weapons');
data.artifacts = addStableImages(data.artifacts, 'artifacts');
const snapshot = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  gameDataVersion: latestVersion(data.characters),
  source: {
    name: 'genshin-db API v5',
    url: 'https://genshin-db-api.vercel.app/',
    upstream: 'https://github.com/theBowja/genshin-db',
    note: 'Game facts only. ZenithW editorial recommendations are stored separately.'
  },
  data
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot)}\n`, 'utf8');
console.log(`Wrote ${output}`);
console.log(`characters=${data.characters.length} talents=${data.talents.length} constellations=${data.constellations.length} weapons=${data.weapons.length} artifacts=${data.artifacts.length}`);
