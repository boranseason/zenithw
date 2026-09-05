#!/usr/bin/env node

/**
 * Fetches the current public community build snapshot used by the Advisor.
 *
 * This is editorial reference data, separate from genshin-db's raw game facts.
 * The site is static at runtime: this script runs locally or in CI, writes a
 * reviewable JSON file, and records the source URL for every character.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const output = resolve(root, 'frontend', 'data', 'genshin-research.json');
const catalog = JSON.parse(await (await import('node:fs/promises')).readFile(resolve(root, 'frontend', 'data', 'genshin-catalog.json'), 'utf8'));
const helperRoot = 'https://genshin-impact-helper-team.github.io/genshin-builds/en';
const teamsUrl = 'https://genshin-builds.com/en/teams';
const requestHeaders = { 'User-Agent': 'ZenithW-Genshin-Advisor/0.2 (+https://zenithw.space/genshin)' };

function decodeHtml(value) {
  let result = String(value || '');
  for (let index = 0; index < 3; index += 1) {
    result = result.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'").replace(/&apos;/g, "'").replace(/&#x2F;|&#47;/gi, '/').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
  }
  return result;
}

function stripTags(value) {
  let result = String(value || '');
  for (let index = 0; index < 3; index += 1) {
    result = decodeHtml(result).replace(/<[^>]+>/g, ' ');
  }
  return result.replace(/\/?element\b(?:\s+[a-z]+)?\s*>?/gi, ' ').replace(/\/?(?:pyro|hydro|anemo|electro|dendro|cryo|geo)\s*>/gi, ' ').replace(/\s+/g, ' ').trim();
}

async function getText(url) {
  const response = await fetch(url, { headers: requestHeaders });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`);
  return response.text();
}

function unique(values) {
  return [...new Set(values.map(value => decodeHtml(value).trim()).filter(Boolean))];
}

function firstCard(html, className) {
  const start = html.indexOf(`class="card recommendation-card ${className}`);
  if (start < 0) return '';
  const next = html.indexOf('class="card recommendation-card', start + 20);
  return html.slice(start, next > -1 ? next : start + 100000);
}

function parseNames(block) {
  return unique([...block.matchAll(/info-popover-name(?:&quot;|")?>([^<]+)</g)].map(match => match[1]));
}

function parseStats(html) {
  const block = firstCard(html, 'artifact-stats-card');
  const main = [...block.matchAll(/<div class="stat-row"><strong>([^<]+)<\/strong><span>([\s\S]*?)<\/span><\/div>/g)]
    .map(match => `${stripTags(match[1])}: ${stripTags(match[2])}`);
  const subStart = block.indexOf('<h3>Substats</h3>');
  const subBlock = subStart > -1 ? block.slice(subStart, subStart + 5000) : '';
  const sub = unique([...subBlock.matchAll(/recommendation-label-emphasized">([^<]+)</g)].map(match => match[1])).join(' > ');
  return { mainStats: main.join(' · '), subStats: sub };
}

function parseTalents(html) {
  const block = firstCard(html, 'talent-card');
  return unique([...block.matchAll(/recommendation-label-emphasized">([^<]+)</g)].map(match => match[1])).slice(0, 3).join(' > ');
}

function parseBuild(html, card) {
  const weaponBlock = firstCard(html, 'weapon-card');
  const artifactBlock = firstCard(html, 'artifact-card');
  const artifact = parseNames(artifactBlock)[0] || '';
  const weapons = parseNames(weaponBlock).slice(0, 6).map((name, index) => ({ rank: index + 1, name }));
  const buildName = decodeHtml(html.match(/data-build-tab[^>]*data-id="[^"]+"[^>]*>[\s\S]*?<span class="build-switcher-name">([^<]+)</)?.[1] || 'Community build');
  const updated = decodeHtml(html.match(/data-build-tab[^>]*data-last-updated="([^"]+)"/)?.[1] || '');
  const stats = parseStats(html);
  return {
    source: `${helperRoot}/${card.slug}`,
    buildName,
    updated,
    artifact,
    weapons,
    mainStats: stats.mainStats,
    subStats: stats.subStats,
    talents: parseTalents(html)
  };
}

const fallbackWeaponPreferences = {
  Bow: ['Favonius Warbow', 'Sacrificial Bow', 'The Stringless', 'End of the Line', 'Fading Twilight', 'Song of Stillness', 'Prototype Crescent', 'Hamayumi', 'Slingshot', 'The Viridescent Hunt', 'Aqua Simulacra', 'Skyward Harp'],
  Catalyst: ['Prototype Amber', 'Favonius Codex', 'Thrilling Tales of Dragon Slayers', 'Sacrificial Jade', 'The Widsith', 'Flowing Purity', 'Hakushin Ring', 'Fruit of Fulfillment', 'Solar Pearl', 'Lost Prayer to the Sacred Winds'],
  Claymore: ['Favonius Greatsword', 'Sacrificial Greatsword', 'Whiteblind', 'Katsuragikiri Nagamasa', 'Forest Regalia', 'Mailed Flower', 'Tidal Shadow', 'Serpent Spine', 'Skyward Pride', 'Beacon of the Reed Sea'],
  Polearm: ['Favonius Lance', 'Prototype Starglitter', 'Kitain Cross Spear', 'The Catch', 'Black Tassel', 'Moonpiercer', 'Footprint of the Rainbow', 'Deathmatch', 'Skyward Spine', 'Staff of Homa'],
  Sword: ['Favonius Sword', 'Sacrificial Sword', 'Iron Sting', 'Amenoma Kageuchi', 'Sapwood Blade', 'Fleuve Cendre Ferryman', 'Xiphos Moonlight', "The Dockhand's Assistant", 'Freedom-Sworn', 'Mistsplitter Reforged']
};

// The community snapshot ranks the strongest weapons overall, so its first six
// entries can legitimately contain only 5-star weapons. Keep the low-cost lane
// character-aware for the profiles where a generic weapon-type fallback would
// be misleading. Entries not present in the source snapshot are labelled as
// compatible alternatives by the UI.
const characterF2PPreferences = {
  Arlecchino: ['White Tassel', 'Deathmatch', 'Missive Windspear', 'Blackcliff Pole'],
  'Neuvillette': ['Prototype Amber', 'The Widsith', 'Flowing Purity', 'Fruit of Fulfillment'],
  Furina: ['Fleuve Cendre Ferryman', 'Favonius Sword', 'Festering Desire', 'Skyrider Sword'],
  'Raiden Shogun': ['The Catch', "Wavebreaker's Fin", 'Favonius Lance', 'Kitain Cross Spear'],
  Nahida: ['Magic Guide', 'Sacrificial Fragments', 'Mappa Mare', 'Wandering Evenstar'],
  'Kaedehara Kazuha': ['Iron Sting', 'Favonius Sword', 'Sacrificial Sword', "Xiphos' Moonlight"],
  Mavuika: ['Serpent Spine', 'Earth Shaker', 'Tidal Shadow', 'Mailed Flower'],
  Odette: ['Finale of the Deep', 'Favonius Sword', 'Fleuve Cendre Ferryman', 'Sacrificial Sword'],
  Flins: ['Deathmatch', "Prospector's Shovel", 'Ballad of the Fjords', 'Favonius Lance']
};

const weaponKey = value => String(value || '').replace(/^['"]|['"]$/g, '').trim().toLocaleLowerCase();

function completeWeaponList(characterName, weapons) {
  const character = catalogCharacters.find(item => item.name === characterName);
  const weaponType = character?.weaponText;
  const catalogByName = new Map(catalog.data.weapons.map(weapon => [weaponKey(weapon.name), weapon]));
  const sourceWeapons = unique((weapons || []).map(item => typeof item === 'string' ? item : item.name));
  const selected = [...sourceWeapons];
  const preferred = characterF2PPreferences[characterName] || fallbackWeaponPreferences[weaponType] || [];
  const candidates = [
    ...preferred,
    ...catalog.data.weapons.filter(weapon => weapon.weaponText === weaponType).sort((a, b) => Number(b.rarity || 0) - Number(a.rarity || 0)).map(weapon => weapon.name)
  ];
  for (const name of candidates) {
    if (selected.length >= 6 || selected.some(item => weaponKey(item) === weaponKey(name)) || !catalogByName.has(weaponKey(name))) continue;
    selected.push(name);
  }
  return selected.slice(0, 6).map((name, index) => ({ rank: index + 1, name, origin: index < sourceWeapons.length ? 'guide' : 'compatible' }));
}

function weaponLists(characterName, weapons) {
  const ranked = completeWeaponList(characterName, weapons);
  const character = catalogCharacters.find(item => item.name === characterName);
  const weaponType = character?.weaponText;
  const catalogWeapons = catalog.data.weapons.filter(weapon => weapon.weaponText === weaponType);
  const sourceByName = new Map(ranked.map(item => [item.name, item]));
  const key = value => String(value || '').replace(/^["']|["']$/g, '').trim().toLocaleLowerCase();
  const catalogByName = new Map(catalog.data.weapons.map(weapon => [key(weapon.name), weapon]));
  const select = (kind) => {
    const selected = [];
    const seen = new Set();
    const sourceMatches = ranked.filter(item => kind === 'f2p' ? Number(catalogByName.get(key(item.name))?.rarity) < 5 : Number(catalogByName.get(key(item.name))?.rarity) === 5);
    const preferred = (characterF2PPreferences[characterName] || fallbackWeaponPreferences[weaponType] || []).filter(name => kind === 'f2p' ? Number(catalogByName.get(key(name))?.rarity) < 5 : Number(catalogByName.get(key(name))?.rarity) === 5);
    const catalogMatches = catalogWeapons
      .filter(weapon => kind === 'f2p' ? Number(weapon.rarity) < 5 : Number(weapon.rarity) === 5)
      .sort((a, b) => Number(b.rarity || 0) - Number(a.rarity || 0))
      .map(weapon => weapon.name);
    for (const candidate of [...sourceMatches.map(item => item.name), ...preferred, ...catalogMatches]) {
      const normalized = key(candidate);
      if (selected.length >= 4 || seen.has(normalized) || !catalogByName.has(normalized)) continue;
      seen.add(normalized);
      const source = sourceByName.get(candidate);
      selected.push({ rank: selected.length + 1, name: candidate, origin: source?.origin === 'compatible' ? 'compatible' : kind });
    }
    return selected;
  };
  return { ranked, f2pWeapons: select('f2p'), premiumWeapons: select('premium') };
}

function characterCards(html) {
  return [...html.matchAll(/<a\b[^>]*data-character-card[^>]*>/g)].map(match => {
    const tag = match[0];
    return {
      name: decodeHtml(tag.match(/data-name="([^"]+)"/)?.[1] || ''),
      slug: tag.match(/href="\/genshin-builds\/en\/([^"/?#]+)"/)?.[1] || '',
      rarity: Number(tag.match(/data-rarity="([^"]+)"/)?.[1] || 0)
    };
  }).filter(card => card.name && card.slug);
}

function teamForCharacter(html, characterName, knownNames) {
  const needle = `Best Team for ${characterName}`;
  const position = html.indexOf(needle);
  if (position < 0) return null;
  const start = html.lastIndexOf('<article', position);
  const end = html.indexOf('</article>', position);
  if (start < 0 || end < 0) return null;
  const article = html.slice(start, end);
  const members = unique([...article.matchAll(/<img[^>]+alt="([^"]+)"/g)].map(match => match[1])).filter(name => knownNames.has(name)).slice(0, 4);
  if (members.length < 2) return null;
  const description = stripTags(article.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] || '');
  const title = stripTags(article.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] || needle);
  return {
    label: { en: title, tr: title },
    members,
    note: { en: description, tr: description },
    source: `${teamsUrl}/${characterName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  };
}

const indexHtml = await getText(`${helperRoot}/`);
const cards = characterCards(indexHtml);
const catalogCharacters = catalog.data.characters;
const catalogNames = new Set(catalogCharacters.map(character => character.name));
const roster = cards.filter(card => catalogNames.has(card.name));
const teamsHtml = await getText(teamsUrl);
const characters = {};
let completed = 0;

for (let start = 0; start < roster.length; start += 4) {
  const batch = roster.slice(start, start + 4);
  const results = await Promise.all(batch.map(async card => {
    try {
      const html = await getText(`${helperRoot}/${card.slug}`);
      const build = parseBuild(html, card);
      const lists = weaponLists(card.name, build.weapons);
      return [card.name, { ...build, weapons: lists.ranked, f2pWeapons: lists.f2pWeapons, premiumWeapons: lists.premiumWeapons, team: teamForCharacter(teamsHtml, card.name, catalogNames), rarity: card.rarity }];
    } catch (error) {
      console.warn(`Skipped ${card.name}: ${error.message}`);
      const lists = weaponLists(card.name, []);
      return [card.name, { source: `${helperRoot}/${card.slug}`, rarity: card.rarity, weapons: lists.ranked, f2pWeapons: lists.f2pWeapons, premiumWeapons: lists.premiumWeapons, artifact: '', mainStats: '', subStats: '', talents: '', team: null }];
    }
  }));
  for (const [name, value] of results) characters[name] = value;
  completed += batch.length;
  console.log(`Fetched ${completed}/${roster.length}`);
}

const snapshot = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    name: 'Genshin Impact Helper Team',
    url: 'https://genshin-impact-helper-team.github.io/genshin-builds/en/',
    teamsUrl,
    note: 'Community build reference snapshot. ZenithW translations and pull decisions are stored separately.'
  },
  characters
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot)}\n`, 'utf8');
console.log(`Wrote ${output}`);
console.log(`characters=${Object.keys(characters).length} withFourF2P=${Object.values(characters).filter(item => item.f2pWeapons.length === 4).length} withFourPremium=${Object.values(characters).filter(item => item.premiumWeapons.length === 4).length} withTeams=${Object.values(characters).filter(item => item.team).length}`);
