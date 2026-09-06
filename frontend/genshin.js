(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const searchText = value => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  const elements = [
    ['All', 'ALL', '#a98bff'], ['Pyro', 'PY', '#ff8b6a'], ['Hydro', 'HY', '#76c6ff'], ['Anemo', 'AN', '#74e5c0'],
    ['Electro', 'EL', '#cb8fff'], ['Dendro', 'DE', '#b6df63'], ['Cryo', 'CR', '#89e5f5'], ['Geo', 'GE', '#f6c970']
  ];
  const elementMap = Object.fromEntries(elements.map(([name, glyph, color]) => [name, { glyph, color }]));
  const copy = {
    en: {
      eyebrow: 'PATCH-AWARE BUILD INTELLIGENCE', title: 'Build around your account,<br><span>not a generic tier list.</span>',
      subtitle: 'Choose a character to compare F2P and premium teams, realistic investment targets, artifacts, talent priorities and the actual trade-off between C1 and a signature weapon.',
      promiseTitle: 'Transparent by design', promiseText: 'Every estimate carries its assumptions. Unreviewed characters never get invented pull advice.',
      search: 'Search a character…', ownedOnly: 'Owned only', libraryKicker: 'ROSTER DATABASE', library: 'Characters', loading: 'Loading the game-data snapshot…',
      methodKicker: 'METHOD', methodTitle: 'Useful advice needs declared assumptions.', methodText: 'DPS ranges describe an expected team rotation under the listed level, artifact, weapon and target assumptions. They are not a damage promise or a substitute for a full account optimizer.',
      disclaimer: 'Unofficial fan tool. Genshin Impact and its assets belong to HoYoverse and their respective owners.', reportIssue: 'Report an issue', kitSource: 'VERIFIED GAME TEXT', profileF2p: 'F2P fit', version: 'Release', weapon: 'Weapon', region: 'Region',
      f2p: 'F2P / roster-friendly', premium: 'Premium ceiling', team: 'Recommended team', build: 'Build target', artifact: 'Artifact set', mainStats: 'Main stats', subStats: 'Substats', talents: 'Talent priority', energy: 'Energy target',
      f2pWeapons: 'F2P weapons', premiumWeapons: 'Premium weapons', rankedWeapons: 'Source-ranked weapons', compatible: 'Compatible option', communityBuild: 'Community build snapshot', communityBuilds: 'build snapshots', sourceGuide: 'Open source guide', sourceUpdated: 'Source update', investment: 'C1 or signature weapon?', c1: 'C1', r1: 'R1 signature', verdict: 'Advisor verdict', rolePlan: 'Role plan', supportFloor: 'Support breakpoint', travelerProgression: 'Free progression', travelerProgressionTitle: 'No Primogems needed for constellations', travelerProgressionText: 'Traveler constellations come from quests, Statues of The Seven and progression rewards. The C1 vs R1 pull comparison does not apply here.', artifactEffects: 'Set effects', twoPiece: '2-piece', fourPiece: '4-piece', recommendedStop: 'Recommended stopping point', f2pFit: 'F2P fit', premiumCeiling: 'Premium ceiling', outputLens: 'Output lens', sourceSignal: 'Source signal', communityInvestment: 'Investment guardrails',
      c1Text: 'Actual C1 effect', fullKit: 'Open verified kit', normal: 'Normal attack', skill: 'Elemental skill', burst: 'Elemental burst', sourceEnglish: 'Game text remains in English because there is no official Turkish Genshin localization to cite.',
      missingTitle: 'Game data is ready. Investment review is not.', missingText: 'This character has verified game data, talents, constellations, weapons and artifacts in the catalog. Pull advice stays locked until a patch-specific review is written—better no recommendation than a bad Primogem decision.',
      missingLink: 'Open verified game kit', noResults: 'No character matches these filters.', owned: 'owned', missing: 'missing', available: 'available', data: 'game data', reviewed: 'reviewed', editorial: 'editorial', fiveStarBuilds: '5★ build reviews', review: 'review', editorialReview: 'Editorial review', communityReview: 'Community build review', count: 'characters', dataStamp: 'data', notAvailable: 'No team template is published for this mode yet.'
    },
    tr: {
      eyebrow: 'PATCH DUYARLI BUILD ZEKÂSI', title: 'Genel tier list’e değil,<br><span>kendi hesabına göre build yap.</span>',
      subtitle: 'Bir karakter seç; F2P ve premium takımları, gerçekçi yatırım hedeflerini, artifactleri, talent önceliklerini ve C1 ile imza silahı arasındaki gerçek farkı karşılaştır.',
      promiseTitle: 'Şeffaf tasarım', promiseText: 'Her tahmin varsayımlarını açıklar. İncelenmemiş karakterler için uydurma çekim tavsiyesi verilmez.',
      search: 'Karakter ara…', ownedOnly: 'Sadece sahip oldukların', libraryKicker: 'KARAKTER VERİ TABANI', library: 'Karakterler', loading: 'Oyun verisi anlık görüntüsü yükleniyor…',
      methodKicker: 'YÖNTEM', methodTitle: 'İyi tavsiye, açık varsayım ister.', methodText: 'DPS aralıkları belirtilen seviye, artifact, silah ve hedef varsayımlarındaki beklenen takım rotasyonunu açıklar. Hasar vaadi veya tam hesap optimizasyonunun yerine geçmez.',
      disclaimer: 'Resmî olmayan fan aracı. Genshin Impact ve varlıkları HoYoverse ile ilgili hak sahiplerine aittir.', reportIssue: 'Hata bildir', kitSource: 'DOĞRULANMIŞ OYUN METNİ', profileF2p: 'F2P uyumu', version: 'Çıkış', weapon: 'Silah', region: 'Bölge',
      f2p: 'F2P / kadro dostu', premium: 'Premium tavan', team: 'Önerilen takım', build: 'Build hedefi', artifact: 'Artifact seti', mainStats: 'Ana statlar', subStats: 'Alt statlar', talents: 'Talent önceliği', energy: 'Enerji hedefi',
      f2pWeapons: 'F2P silahlar', premiumWeapons: 'Premium silahlar', rankedWeapons: 'Kaynak sıralı silahlar', compatible: 'Uyumlu alternatif', communityBuild: 'Topluluk build snapshot’ı', communityBuilds: 'build snapshot’ı', sourceGuide: 'Kaynak rehberi', sourceUpdated: 'Kaynak güncellemesi', investment: 'C1 mi imza silahı mı?', c1: 'C1', r1: 'R1 imza', verdict: 'Advisor kararı', rolePlan: 'Rol planı', supportFloor: 'Destek eşiği', travelerProgression: 'Ücretsiz ilerleme', travelerProgressionTitle: 'Constellation için Primogem gerekmez', travelerProgressionText: 'Traveler constellationları görevler, Yedi Heykelleri ve ilerleme ödülleriyle açılır. Bu karakter için C1 mi R1 mi çekim karşılaştırması geçerli değildir.', artifactEffects: 'Set etkileri', twoPiece: '2 parça', fourPiece: '4 parça', recommendedStop: 'Önerilen durak noktası', f2pFit: 'F2P uyumu', premiumCeiling: 'Premium tavan', outputLens: 'Çıktı profili', sourceSignal: 'Kaynak sinyali', communityInvestment: 'Yatırım çerçevesi',
      c1Text: 'Gerçek C1 etkisi', fullKit: 'Doğrulanmış kiti aç', normal: 'Normal saldırı', skill: 'Elemental skill', burst: 'Elemental burst', sourceEnglish: 'Atıf yapılabilecek resmî bir Türkçe Genshin yerelleştirmesi olmadığı için oyun metni İngilizce korunur.',
      missingTitle: 'Oyun verisi hazır. Yatırım incelemesi hazır değil.', missingText: 'Bu karakterin doğrulanmış oyun verisi, talentleri, constellationları, silahları ve artifactleri katalogda var. Patch’e özel inceleme yazılana kadar çekim tavsiyesi kilitli kalır—kötü bir Primogem kararındansa tavsiye vermemek daha iyidir.',
      missingLink: 'Doğrulanmış oyun kitini aç', noResults: 'Bu filtrelerle eşleşen karakter yok.', owned: 'sahip', missing: 'eksik', available: 'hazır', data: 'oyun verisi', reviewed: 'incelendi', editorial: 'editöryel', fiveStarBuilds: '5★ build incelemesi', review: 'inceleme', editorialReview: 'Editöryel inceleme', communityReview: 'Topluluk build incelemesi', count: 'karakter', dataStamp: 'veri', notAvailable: 'Bu mod için henüz takım şablonu yayımlanmadı.'
    }
  };

  const state = { lang: 'en', query: '', element: 'All', ownedOnly: false, selected: null, mode: 'f2p', buildMode: '', owned: new Set(), sourceReviewed: new Set(), catalog: null, meta: null, research: null };
  const storage = {
    get(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} }
  };
  const text = key => copy[state.lang][key] || copy.en[key] || key;
  const translated = value => value && typeof value === 'object' ? value[state.lang] || value.en || '' : value || '';
  const elementInfo = element => elementMap[element] || { glyph: '•', color: '#a98bff' };
  const glyph = element => { const info = elementInfo(element); return `<span class="element-glyph" style="--element:${info.color}" title="${escapeHtml(element || 'Unknown')}">${info.glyph}</span>`; };
  const characterImage = character => character?.images?.hoyowiki_icon || character?.images?.mihoyo_icon || character?.images?.cover1 || '';
  const characterByName = name => {
    const aliases = { Kazuha: 'Kaedehara Kazuha', 'Anemo Traveler': 'Aether', 'Geo Traveler': 'Aether', 'Electro Traveler': 'Aether', 'Dendro Traveler': 'Aether', 'Hydro Traveler': 'Aether', 'Pyro Traveler': 'Aether', 'Cryo Traveler': 'Aether', Traveler: 'Aether' };
    return state.catalog?.data?.characters?.find(character => character.name === name || character.name === aliases[name]);
  };
  const metaForCharacter = name => state.meta?.characters?.[name] || (name === 'Lumine' ? state.meta?.characters?.Aether : null);
  const talentByName = name => state.catalog?.data?.talents?.find(talent => talent.name === name);
  const constellationByName = name => state.catalog?.data?.constellations?.find(constellation => constellation.name === name);
  const weaponByName = name => {
    const normalized = String(name || '').replace(/\s+R\d+$/i, '').trim();
    const key = value => String(value || '').replace(/^["']|["']$/g, '').trim().toLocaleLowerCase();
    return state.catalog?.data?.weapons?.find(weapon => weapon.name === normalized || key(weapon.name) === key(normalized));
  };
  const artifactByName = name => {
    const normalized = String(name || '').replace(/^4pc\s+/i, '').trim();
    return state.catalog?.data?.artifacts?.find(artifact => artifact.name === normalized);
  };
  const imageForWeapon = weapon => weapon?.images?.zenithw_icon || weapon?.images?.mihoyo_icon || weapon?.images?.mihoyo_awakenIcon || '';
  const imageForArtifact = artifact => artifact?.images?.zenithw_icon || artifact?.images?.mihoyo_circlet || artifact?.images?.mihoyo_flower || '';
  const rawDescription = value => String(value || '').replace(/<[^>]+>/g, '').replace(/\r/g, '').trim();

  function setLanguage(lang) {
    state.lang = lang === 'tr' ? 'tr' : 'en';
    storage.set('zw_genshin_lang', state.lang);
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach(node => { node.innerHTML = text(node.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(node => { node.placeholder = text(node.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-language]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.language === state.lang)));
    renderElementFilters(); renderLibrary(); renderWorkspace(); updateDataStamp();
  }

  function updateDataStamp() {
    const stamp = byId('dataStamp');
    if (!state.catalog || !stamp) return;
    const generated = new Date(state.catalog.generatedAt);
    const date = Number.isNaN(generated.valueOf()) ? '' : new Intl.DateTimeFormat(state.lang === 'tr' ? 'tr-TR' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(generated);
    const reviewedCount = Object.keys(state.meta?.characters || {}).length;
    const fiveStarBuildCount = state.catalog.data.characters.filter(character => Number(character.rarity) === 5 && state.research?.characters?.[character.name]).length;
    stamp.textContent = `${text('dataStamp')} · v${state.catalog.gameDataVersion} · ${reviewedCount} ${text('editorial')} · ${state.sourceReviewed.size} source-checked · ${fiveStarBuildCount} ${text('fiveStarBuilds')} · ${date}`;
  }

  function renderElementFilters() {
    const host = byId('elementFilters');
    if (!host) return;
    host.innerHTML = elements.map(([name, short, color]) => `<button class="element-filter" type="button" data-element="${name}" style="--element:${color}" aria-pressed="${state.element === name}">${name === 'All' ? short : glyph(name)}<span>${name === 'All' ? (state.lang === 'tr' ? 'Tümü' : 'All') : name}</span></button>`).join('');
  }

  function visibleCharacters() {
    if (!state.catalog) return [];
    const needle = searchText(state.query);
    return state.catalog.data.characters.filter(character => {
      if (state.element !== 'All' && character.elementText !== state.element) return false;
      if (state.ownedOnly && !state.owned.has(character.name)) return false;
      return !needle || searchText([character.name, character.title, character.elementText, character.weaponText, character.region].join(' ')).includes(needle);
    }).sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
  }

  function renderLibrary() {
    const grid = byId('characterGrid'); const count = byId('characterCount');
    if (!grid || !state.catalog) return;
    const characters = visibleCharacters();
    count.textContent = `${characters.length}/${state.catalog.data.characters.length} ${text('count')}`;
    grid.innerHTML = characters.length ? characters.map(character => {
      const info = elementInfo(character.elementText);
      const isOwned = state.owned.has(character.name);
      return `<article class="character-card" data-character="${escapeHtml(character.name)}" style="--element:${info.color}" role="button" tabindex="0" aria-current="${state.selected === character.name}">
        <img src="${escapeHtml(characterImage(character))}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <span class="character-card-stars">${'★'.repeat(Math.max(0, Number(character.rarity) || 0))}</span>
        <span class="character-card-name">${escapeHtml(character.name)}</span>
        <span class="card-element">${glyph(character.elementText)}</span>
        <button class="owned-toggle" type="button" data-own="${escapeHtml(character.name)}" aria-pressed="${isOwned}" aria-label="${isOwned ? 'Unmark' : 'Mark'} ${escapeHtml(character.name)} as owned" title="${isOwned ? 'Owned' : 'Mark as owned'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg></button>
      </article>`;
    }).join('') : `<p class="library-empty">${text('noResults')}</p>`;
  }

  function travelerModeFor(name) {
    const match = String(name || '').match(/(anemo|geo|electro|dendro|hydro|pyro|cryo)\s+traveler/i);
    return match?.[1]?.toLowerCase();
  }

  function artifactForTeammate(name) {
    const canonical = characterByName(name)?.name || name;
    const research = state.research?.characters?.[canonical];
    if (research?.artifact) return artifactByName(research.artifact);
    const meta = metaForCharacter(canonical);
    if (!meta) return null;
    const modes = profileModes(meta);
    const mode = modes.find(item => item.key === travelerModeFor(name)) || modes[0];
    return artifactByName(mode?.build?.artifact || meta.build?.artifact);
  }

  function teammateMarkup(name) {
    const character = characterByName(name);
    const artifact = artifactForTeammate(name);
    const info = elementInfo(character?.elementText);
    return `<div class="team-member" title="${escapeHtml(name)}${artifact ? ` · ${escapeHtml(artifact.name)}` : ''}" style="--element:${info.color}">${character ? `<img src="${escapeHtml(characterImage(character))}" alt="${escapeHtml(name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}${artifact ? `<img class="team-artifact" src="${escapeHtml(imageForArtifact(artifact))}" alt="" title="${escapeHtml(artifact.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${escapeHtml(name)}</span></div>`;
  }

  function teamMarkup(team) {
    if (!team) return `<div class="team-card"><p>${text('notAvailable')}</p></div>`;
    const missing = team.members.filter(name => name !== state.selected && !state.owned.has(name));
    const availability = missing.length ? `${missing.length} ${text('missing')}` : text('available');
    return `<div class="team-card"><div class="team-card-head"><strong>${escapeHtml(translated(team.label))}</strong><span class="availability ${missing.length ? '' : 'good'}">${escapeHtml(availability)}</span></div><div class="team-members">${team.members.map(teammateMarkup).join('')}</div><p>${escapeHtml(translated(team.note))}</p>${missing.length ? `<div class="team-sub-note">${escapeHtml(state.lang === 'tr' ? `Eksik: ${missing.join(', ')}` : `Missing: ${missing.join(', ')}`)}</div>` : ''}</div>`;
  }

  function buildMarkup(meta) {
    const build = meta.build || {};
    const row = (label, value) => `<div class="build-row"><span>${text(label)}</span><b>${escapeHtml(value)}</b></div>`;
    const preferredArtifact = String(build.artifact || '').split(/\s+or\s+/i)[0];
    const artifact = artifactByName(preferredArtifact);
    const artifactMarkup = artifact ? `<div class="artifact-feature"><img src="${escapeHtml(imageForArtifact(artifact))}" alt="" loading="lazy" referrerpolicy="no-referrer"><div><h3>${escapeHtml(build.artifact)}</h3><span>${text('artifactEffects')}</span><p><b>${text('twoPiece')}</b> ${escapeHtml(rawDescription(artifact.effect2Pc))}</p><p><b>${text('fourPiece')}</b> ${escapeHtml(rawDescription(artifact.effect4Pc))}</p></div></div>` : `<h3>${escapeHtml(build.artifact)}</h3>`;
    const weaponKey = value => String(value || '').replace(/\s+R\d+$/i, '').replace(/^["']|["']$/g, '').trim().toLocaleLowerCase();
    const rankedInput = Array.isArray(build.rankedWeapons) ? build.rankedWeapons : Array.isArray(build.weapons) ? build.weapons : [];
    const listFor = kind => {
      const list = [];
      const seen = new Set();
      const explicit = Array.isArray(build[`${kind}Weapons`]) ? build[`${kind}Weapons`] : [];
      const sourceMatches = rankedInput.filter(item => {
        const weapon = weaponByName(typeof item === 'string' ? item : item?.name);
        return kind === 'f2p' ? Number(weapon?.rarity) < 5 : Number(weapon?.rarity) === 5;
      });
      const catalogMatches = state.catalog?.data?.weapons?.filter(weapon => weapon.weaponText === characterByName(state.selected)?.weaponText && (kind === 'f2p' ? Number(weapon.rarity) < 5 : Number(weapon.rarity) === 5)).sort((a, b) => Number(b.rarity || 0) - Number(a.rarity || 0)) || [];
      for (const raw of [...explicit, ...sourceMatches, ...catalogMatches]) {
        const entry = typeof raw === 'string' ? { name: raw, origin: kind } : raw;
        const key = weaponKey(entry?.name);
        if (!entry?.name || seen.has(key) || list.length >= 4) continue;
        seen.add(key);
        list.push({ ...entry, rank: list.length + 1 });
      }
      return list;
    };
    const f2p = listFor('f2p');
    const premium = listFor('premium');
    const renderWeaponList = (label, list) => `<div class="weapon-column"><span>${text(label === 'f2p' ? 'f2pWeapons' : 'premiumWeapons')}</span><ol>${list.map((item, index) => { const weapon = weaponByName(item.name); const fiveStar = Number(weapon?.rarity) === 5; const compatible = item.origin === 'compatible'; const access = translated(item.access) || (compatible ? text('compatible') : label === 'f2p' ? 'F2P' : 'Premium'); return `<li class="equipment-item ${fiveStar ? 'is-five-star' : ''} ${compatible ? 'is-compatible' : ''}"><i class="weapon-rank">${item.rank || index + 1}</i>${weapon ? `<img src="${escapeHtml(imageForWeapon(weapon))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i aria-hidden="true"></i>'}<span>${escapeHtml(item.name)}${item.refinement ? ` · ${escapeHtml(item.refinement)}` : ''}</span><span class="weapon-meta">${fiveStar ? '<b aria-label="5-star">★</b>' : ''}${access ? `<small>${escapeHtml(access)}</small>` : ''}</span></li>`; }).join('')}</ol></div>`;
    const ranked = [...rankedInput].slice(0, 6);
    const rankedWeapons = f2p.length === 4 && premium.length === 4 ? `<div class="weapon-columns split-weapon-columns">${renderWeaponList('f2p', f2p)}${renderWeaponList('premium', premium)}</div>` : ranked.length ? `<div class="weapon-columns single-weapon-column"><div class="weapon-column"><span>${text('rankedWeapons')}</span><ol>${ranked.map((item, index) => { const weapon = weaponByName(item.name); const fiveStar = Number(weapon?.rarity) === 5; const compatible = item.origin === 'compatible'; const access = translated(item.access) || (compatible ? text('compatible') : ''); return `<li class="equipment-item ${fiveStar ? 'is-five-star' : ''} ${compatible ? 'is-compatible' : ''}"><i class="weapon-rank">${item.rank || index + 1}</i>${weapon ? `<img src="${escapeHtml(imageForWeapon(weapon))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i aria-hidden="true"></i>'}<span>${escapeHtml(item.name)}${item.refinement ? ` · ${escapeHtml(item.refinement)}` : ''}</span><span class="weapon-meta">${fiveStar ? '<b aria-label="5-star">★</b>' : ''}${access ? `<small>${escapeHtml(access)}</small>` : ''}</span></li>`; }).join('')}</ol></div></div>` : '';
    return `<article class="surface-card build-card"><p class="section-kicker">${text('build')}</p>${artifactMarkup}<div class="build-list">${row('mainStats', build.mainStats)}${row('subStats', build.subStats)}${row('talents', build.talents)}${row('energy', build.energy)}</div>${rankedWeapons}</article>`;
  }

  function skillSummary(talent) {
    if (!talent) return '';
    return `<button type="button" data-open-kit="true"><span>${escapeHtml(talent.name || '')}</span><b>${escapeHtml(rawDescription(talent.description).slice(0, 120))}</b></button>`;
  }

  function profileModes(meta) {
    return Array.isArray(meta?.buildModes) && meta.buildModes.length ? meta.buildModes : [{ key: 'default', label: { en: 'Default', tr: 'Varsayılan' } }];
  }

  function activeProfile(meta) {
    const modes = profileModes(meta);
    const mode = modes.find(item => item.key === state.buildMode) || modes[0];
    return { ...meta, ...mode, roles: mode.roles || meta.roles, build: mode.build || meta.build, teams: mode.teams || meta.teams, dps: mode.dps || meta.dps, investment: mode.investment || meta.investment, supportFloor: mode.supportFloor || meta.supportFloor };
  }

  function modeTabsMarkup(meta) {
    const modes = profileModes(meta);
    if (modes.length < 2) return '';
    const active = modes.find(item => item.key === state.buildMode)?.key || modes[0].key;
    return `<div class="role-tabs" role="tablist" aria-label="${text('rolePlan')}">${modes.map(mode => `<button type="button" data-build-mode="${escapeHtml(mode.key)}" role="tab" aria-selected="${mode.key === active}">${escapeHtml(translated(mode.label))}</button>`).join('')}</div>`;
  }

  function supportFloorMarkup(profile) {
    const floor = profile.supportFloor;
    if (!floor) return '';
    return `<div class="support-floor"><span>${text('supportFloor')}</span><strong>${escapeHtml(floor.minimum)}</strong><p>${escapeHtml(translated(floor.note))}</p></div>`;
  }

  function kitMarkup(character, constellation, kitName = character.name) {
    const talent = talentByName(kitName);
    return `<article class="surface-card kit-card"><p class="section-kicker">${text('kitSource')}</p><h3>${text('fullKit')}</h3><div class="kit-summary">${skillSummary(talent?.combat1)}${skillSummary(talent?.combat2)}${skillSummary(talent?.combat3)}</div>${constellation?.c1 ? `<div class="actual-c1"><strong>${text('c1Text')} — ${escapeHtml(constellation.c1.name || '')}</strong><p>${escapeHtml(rawDescription(constellation.c1.description))}</p></div>` : ''}<p class="team-sub-note">${text('sourceEnglish')}</p></article>`;
  }

  function isTravelerCharacter(character) {
    return ['Aether', 'Lumine', 'Traveler'].includes(character?.name);
  }

  function metaMarkup(character, meta, constellation) {
    const profile = activeProfile(meta);
    const modeTeam = profile.teams?.[state.mode];
    const investment = profile.investment;
    const traveler = isTravelerCharacter(character);
    const investmentMarkup = traveler
      ? `<article class="surface-card traveler-progression"><p class="section-kicker">${text('travelerProgression')}</p><h3>${text('travelerProgressionTitle')}</h3><p>${text('travelerProgressionText')}</p></article>`
      : `<article class="surface-card investment-card"><p class="section-kicker">${text('investment')}</p><h3>${escapeHtml(character.name)} — C1 vs R1</h3><div class="investment-grid"><div class="investment-option"><div class="option-head"><strong>${text('c1')}</strong><span class="score">${investment.c1.score}/100</span></div><p>${escapeHtml(translated(investment.c1))}</p></div><div class="investment-option"><div class="option-head"><strong>${text('r1')}</strong><span class="score">${investment.r1.score}/100</span></div><p>${escapeHtml(translated(investment.r1))}</p></div><div class="investment-verdict"><span>${text('verdict')}</span><p>${escapeHtml(translated(investment.verdict))}</p>${investment.c2 ? `<div class="investment-c2"><strong>C2 · ${investment.c2.score}/100</strong><p>${escapeHtml(translated(investment.c2))}</p></div>` : ''}${investment.stop ? `<p class="investment-stop"><b>${text('recommendedStop')}:</b> ${escapeHtml(translated(investment.stop))}</p>` : ''}</div></div>${constellation?.c1 ? `<div class="actual-c1"><strong>${text('c1Text')} — ${escapeHtml(constellation.c1.name || '')}</strong><p>${escapeHtml(rawDescription(constellation.c1.description))}</p></div>` : ''}</article>`;
    return `${modeTabsMarkup(meta)}<div class="advisor-tabs" role="tablist" aria-label="Recommendation investment level"><button type="button" data-mode="f2p" role="tab" aria-selected="${state.mode === 'f2p'}">${text('f2p')}</button><button type="button" data-mode="premium" role="tab" aria-selected="${state.mode === 'premium'}">${text('premium')}</button></div><div class="workspace-grid">
      <article class="surface-card"><div class="fit-summary"><span>${text('f2pFit')}</span><strong>${escapeHtml(profile.f2pFit?.score ?? '—')}/100</strong><p>${escapeHtml(translated(profile.f2pFit))}</p></div><p class="section-kicker">${text('team')}</p><h3>${escapeHtml(state.mode === 'f2p' ? text('f2p') : text('premium'))}</h3>${teamMarkup(modeTeam)}<div class="dps-card"><div class="dps-number"><span>${text('f2p')}</span><strong>${escapeHtml(profile.dps.f2p)}</strong></div><div class="dps-number"><span>${text('premium')}</span><strong>${escapeHtml(profile.dps.premium)}</strong></div><p class="dps-context">${escapeHtml(translated(profile.dps.context))}</p></div>${supportFloorMarkup(profile)}</article>
      ${buildMarkup(profile)}${investmentMarkup}
      ${kitMarkup(character, constellation, profile.kitName || character.name)}
    </div>`;
  }

  function noMetaMarkup(character, constellation) {
    return `<div class="workspace-grid"><article class="missing-meta"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></svg><strong>${text('missingTitle')}</strong><p>${text('missingText')}</p><a href="#kit">${text('missingLink')} →</a></article>${kitMarkup(character, constellation)}</div>`;
  }

  function communityFitMarkup(research) {
    const sourceWeapons = research.weapons || [];
    const f2pWeapon = sourceWeapons.find(item => Number(weaponByName(item.name)?.rarity) < 5);
    const premiumWeapon = sourceWeapons.find(item => Number(weaponByName(item.name)?.rarity) === 5) || sourceWeapons[0];
    const supportLike = /support|buff|heal|enabler|reaction/i.test(research.buildName || '');
    const tier = research.team?.note?.en?.match(/^(SS|S|A|B|C)-tier/i)?.[1];
    const output = supportLike
      ? (state.lang === 'tr' ? 'Destek / sahadışı çıktı; uptime, buff ve reaksiyon sahipliğiyle ölç.' : 'Support / off-field output; judge it by uptime, buffs, and reaction ownership.')
      : (state.lang === 'tr' ? 'Sahada / reaksiyon çıktısı; tam rotasyon ve takım sinerjisiyle ölç.' : 'On-field / reaction output; judge it with the full rotation and team shell.');
    const supportFloor = supportLike ? (state.lang === 'tr' ? 'C0 başlangıç noktası · takıma bağlı' : 'C0 baseline · team dependent') : (state.lang === 'tr' ? 'Destek rolü değil' : 'Not a support role');
    const supportNote = supportLike ? (state.lang === 'tr' ? 'Kaynak evrensel minimum constellation yayımlamıyor; önce C0’da uptime, enerji ve takım rotasyonunu tamamla.' : 'The source does not publish a universal constellation minimum; complete uptime, energy, and team rotation at C0 first.') : (state.lang === 'tr' ? 'Bu profil öncelikle sahada veya reaksiyon çıktısıyla değerlendirilir.' : 'This profile is evaluated primarily through on-field or reaction output.');
    return `<article class="surface-card community-fit"><p class="section-kicker">${text('outputLens')}</p><div class="community-fit-grid"><div><span>${text('f2pFit')}</span><strong>${f2pWeapon ? escapeHtml(f2pWeapon.name) : (state.lang === 'tr' ? 'Katalogda uygun seçenek yok' : 'No lower-cost option in snapshot')}</strong><p>${state.lang === 'tr' ? 'Kaynak listesindeki ilk 4★/3★ seçenek; kişisel hesabındaki refinement ve ER ihtiyacını ayrıca kontrol et.' : 'The first 4★/3★ option in the source list; still check your account\'s refinement and ER needs.'}</p></div><div><span>${text('premiumCeiling')}</span><strong>${escapeHtml(premiumWeapon?.name || '—')}</strong><p>${state.lang === 'tr' ? 'Kaynak listesindeki en yüksek yatırım sinyali; otomatik olarak her takımda en iyi anlamına gelmez.' : 'The highest-investment signal in the source list; it is not automatically best in every team.'}</p></div></div><div class="community-signal"><span>${text('supportFloor')}</span><strong>${escapeHtml(supportFloor)}</strong><p>${escapeHtml(supportNote)}</p></div><div class="community-signal"><span>${text('sourceSignal')}</span><strong>${tier ? `${escapeHtml(tier)}-tier` : escapeHtml(research.buildName || 'Build')}</strong><p>${escapeHtml(output)}</p></div></article>`;
  }

  function communityInvestmentMarkup(character, research, constellation) {
    const supportLike = /support|buff|heal|enabler|reaction/i.test(research.buildName || '');
    const c1 = constellation?.c1;
    const firstWeapon = research.weapons?.[0]?.name || 'the top source-ranked weapon';
    const c1Advice = supportLike
      ? (state.lang === 'tr' ? 'C0 temel destek görevini açar. C1’i yalnızca doğrulanmış etkisi senin rotasyonundaki uptime veya enerji sorununu çözüyor ve takım çekirdeğin hazırsa düşün.' : 'C0 unlocks the core support job. Consider C1 only when its verified effect fixes your rotation or uptime problem and the team shell is already complete.')
      : (state.lang === 'tr' ? 'C1 kişisel çıktıyı artırabilir; fakat artifact, yetenek ve takım tamamlanmadan önce otomatik ilk yatırım değildir.' : 'C1 can increase personal output, but it is not automatically the first investment before artifacts, talents, and the team are complete.');
    const r1Advice = state.lang === 'tr'
      ? `${firstWeapon} kaynak listesinin ilk sırasında. İmza olduğu doğrulanmıyorsa R1’i “zorunlu” sayma; güçlü 4★ seçeneği önce hesapla.`
      : `${firstWeapon} leads the source list. Unless it is verified as the signature, do not call R1 mandatory; benchmark the strong 4★ option first.`;
    const verdict = supportLike
      ? (state.lang === 'tr' ? 'Önce C0 ve eksik takım parçaları. C1/R1 ancak destek görevi zaten stabil olduktan sonra.' : 'Start at C0 and complete missing team pieces. Consider C1/R1 only after the support job is stable.')
      : (state.lang === 'tr' ? 'Önce C0, doğru artifact ve takım. Sonra C1 ile R1’i hesabındaki silah, refinement ve rotasyona göre karşılaştır.' : 'Start at C0 with the right artifacts and team. Then compare C1 and R1 against your actual weapon, refinement, and rotation.');
    return `<article class="surface-card investment-card community-investment"><p class="section-kicker">${text('communityInvestment')}</p><h3>${escapeHtml(character.name)} — C1 vs R1</h3><div class="investment-grid"><div class="investment-option"><div class="option-head"><strong>${text('c1')}</strong></div><p>${escapeHtml(c1Advice)}</p>${c1 ? `<div class="actual-c1"><strong>${text('c1Text')} — ${escapeHtml(c1.name || '')}</strong><p>${escapeHtml(rawDescription(c1.description))}</p></div>` : ''}</div><div class="investment-option"><div class="option-head"><strong>${text('r1')}</strong></div><p>${escapeHtml(r1Advice)}</p></div><div class="investment-verdict"><span>${text('verdict')}</span><p>${escapeHtml(verdict)}</p></div></div></article>`;
  }

  function communityMarkup(character, research, constellation) {
    const build = { artifact: research.artifact || 'No set listed', rankedWeapons: research.weapons || [], f2pWeapons: research.f2pWeapons || [], premiumWeapons: research.premiumWeapons || [], mainStats: research.mainStats || 'See source guide', subStats: research.subStats || 'See source guide', talents: research.talents || 'See source guide', energy: 'See source guide' };
    const team = research.team ? `<article class="surface-card community-team"><p class="section-kicker">${text('communityBuild')}</p><h3>${escapeHtml(translated(research.team.label))}</h3>${teamMarkup(research.team)}<div class="support-floor"><span>${text('supportFloor')}</span><strong>${state.lang === 'tr' ? 'Takıma göre değişir' : 'Team dependent'}</strong><p>${state.lang === 'tr' ? 'Bu topluluk kaynağı evrensel bir minimum constellation yayımlamıyor. Harcama kararı vermeden önce doğrulanmış C1 metnini ve kendi rotasyonunu kontrol et.' : 'This community source does not publish a universal constellation minimum. Check the verified C1 text and your own rotation before spending.'}</p></div></article>` : '';
    return `<div class="workspace-grid community-grid"><article class="community-note"><span>${text('communityBuild')}</span><strong>${escapeHtml(research.buildName || 'Community reference')}</strong><p>${state.lang === 'tr' ? 'Silah, artifact ve stat sıralaması güncel topluluk rehberinden snapshot olarak alındı. C1/R1 kartı doğrulanmış C1 metniyle birlikte koşullu yatırım çerçevesi sunar; kesin hesap tavsiyesi değildir.' : 'Weapon, artifact and stat rankings are captured from a current community guide. The C1/R1 card combines verified C1 text with conditional investment guardrails; it is not a guaranteed account-specific verdict.'}</p><a href="${escapeHtml(research.source)}" target="_blank" rel="noopener noreferrer">${text('sourceGuide')} ↗</a>${research.updated ? `<small>${text('sourceUpdated')}: ${escapeHtml(research.updated)}</small>` : ''}</article>${buildMarkup({ build })}${communityFitMarkup(research)}${team}${isTravelerCharacter(character) ? '' : communityInvestmentMarkup(character, research, constellation)}${kitMarkup(character, constellation)}</div>`;
  }

  function profileMarkup(character, meta, research) {
    const profile = meta ? activeProfile(meta) : null;
    const element = profile?.element || character.elementText;
    const info = elementInfo(element);
    const roles = profile ? translated(profile.roles) : [state.lang === 'tr' ? 'Oyun verisi hazır' : 'Game data ready'];
    const f2p = meta ? `${meta.f2pFit.score}/100` : '—';
    const title = profile?.title || character.title || character.constellation || '';
    const reviewLabel = meta ? text('editorialReview') : state.sourceReviewed.has(character.name) ? (state.lang === 'tr' ? 'Kaynak kontrollü build incelemesi' : 'Source-checked build review') : research ? text('communityReview') : text('data');
    return `<section class="profile-head" style="--element:${info.color}"><div class="profile-portrait"><img src="${escapeHtml(characterImage(character))}" alt="${escapeHtml(character.name)}" referrerpolicy="no-referrer"><span class="card-element">${glyph(element)}</span></div><div class="profile-summary"><div class="profile-kicker">${glyph(element)} ${escapeHtml(element || '')} · ${'★'.repeat(Math.max(0, Number(character.rarity) || 0))}</div><h2>${escapeHtml(character.name)}</h2><p class="profile-title">${escapeHtml(translated(title))}</p><div class="role-chips">${roles.map(role => `<span>${escapeHtml(role)}</span>`).join('')}</div></div><div class="profile-side"><div class="profile-stat"><span>${text('profileF2p')}</span><b>${escapeHtml(f2p)}</b></div><div class="profile-stat"><span>${text('review')}</span><b>${escapeHtml(reviewLabel)}</b></div><div class="profile-stat"><span>${text('weapon')}</span><b>${escapeHtml(profile?.weapon || character.weaponText || '—')}</b></div><div class="profile-stat"><span>${text('version')}</span><b>v${escapeHtml(profile?.version || character.version || '—')}</b></div></div></section>`;
  }

  function renderWorkspace() {
    const host = byId('characterWorkspace');
    if (!host || !state.catalog || !state.selected) return;
    const character = characterByName(state.selected);
    if (!character) return;
    const meta = metaForCharacter(character.name);
    const research = state.research?.characters?.[character.name];
    const profile = meta ? activeProfile(meta) : null;
    const constellation = constellationByName(profile?.kitName || character.name);
    host.innerHTML = `${profileMarkup(character, meta, research)}${meta ? metaMarkup(character, meta, constellation) : research ? communityMarkup(character, research, constellation) : noMetaMarkup(character, constellation)}`;
  }

  function openKit() {
    const dialog = byId('kitDialog'); const target = byId('kitDialogContent'); const heading = byId('kitDialogTitle');
    const character = characterByName(state.selected);
    if (!dialog || !target || !heading || !character) return;
    const meta = metaForCharacter(character.name);
    const profile = meta ? activeProfile(meta) : null;
    const kitName = profile?.kitName || character.name;
    const talent = talentByName(kitName);
    const constellation = constellationByName(kitName);
    const section = (label, entry) => entry ? `<section class="kit-section"><h3>${escapeHtml(label)}</h3><h4>${escapeHtml(entry.name || '')}</h4><p>${escapeHtml(rawDescription(entry.description))}</p></section>` : '';
    heading.textContent = `${kitName} · kit`;
    target.innerHTML = `${section(text('normal'), talent?.combat1)}${section(text('skill'), talent?.combat2)}${section(text('burst'), talent?.combat3)}${section(text('c1'), constellation?.c1)}<p class="team-sub-note">${text('sourceEnglish')}</p>`;
    dialog.showModal();
  }

  function selectCharacter(name, replaceHash = false) {
    if (!characterByName(name)) return;
    state.selected = name;
    state.buildMode = '';
    if (replaceHash) history.replaceState(null, '', `#${encodeURIComponent(name)}`); else if (location.hash !== `#${encodeURIComponent(name)}`) location.hash = encodeURIComponent(name);
    renderLibrary(); renderWorkspace();
  }

  function attachEvents() {
    document.addEventListener('click', event => {
      const language = event.target.closest('[data-language]');
      if (language) { setLanguage(language.dataset.language); return; }
      const filter = event.target.closest('[data-element]');
      if (filter) { state.element = filter.dataset.element; renderElementFilters(); renderLibrary(); return; }
      const owned = event.target.closest('[data-own]');
      if (owned) { const name = owned.dataset.own; state.owned.has(name) ? state.owned.delete(name) : state.owned.add(name); storage.set('zw_genshin_owned', JSON.stringify([...state.owned])); renderLibrary(); renderWorkspace(); return; }
      const card = event.target.closest('[data-character]');
      if (card) { selectCharacter(card.dataset.character); return; }
      const mode = event.target.closest('[data-mode]');
      if (mode) { state.mode = mode.dataset.mode === 'premium' ? 'premium' : 'f2p'; renderWorkspace(); return; }
      const buildMode = event.target.closest('[data-build-mode]');
      if (buildMode) { state.buildMode = buildMode.dataset.buildMode; renderWorkspace(); return; }
      if (event.target.closest('[data-open-kit]') || event.target.closest('[href="#kit"]')) { event.preventDefault(); openKit(); }
      if (event.target.closest('#closeKit')) byId('kitDialog')?.close();
    });
    byId('characterSearch')?.addEventListener('input', event => { state.query = event.target.value; renderLibrary(); });
    byId('ownedOnly')?.addEventListener('change', event => { state.ownedOnly = event.target.checked; renderLibrary(); });
    window.addEventListener('hashchange', () => { const name = decodeURIComponent(location.hash.slice(1)); if (name && name !== state.selected) selectCharacter(name, true); });
    window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); byId('characterSearch')?.focus(); } if (event.key === 'Escape') byId('kitDialog')?.close(); });
  }

  async function initialise() {
    const savedLanguage = storage.get('zw_genshin_lang', '');
    state.lang = savedLanguage === 'tr' || savedLanguage === 'en' ? savedLanguage : (navigator.language || '').toLowerCase().startsWith('tr') ? 'tr' : 'en';
    try { state.owned = new Set(JSON.parse(storage.get('zw_genshin_owned', '[]'))); } catch { state.owned = new Set(); }
    attachEvents();
    try {
      const [catalogResponse, metaResponse, researchResponse, priorityResponse, batchResponse] = await Promise.all([fetch('/data/genshin-catalog.json?v=0.1'), fetch('/data/genshin-meta.json?v=0.2'), fetch('/data/genshin-research.json?v=0.2'), fetch('/data/genshin-priority-reviews.json?v=0.1'), fetch('/data/genshin-batch-reviews.json?v=0.1')]);
      if (!catalogResponse.ok || !metaResponse.ok || !researchResponse.ok || !priorityResponse.ok || !batchResponse.ok) throw new Error('Data snapshot unavailable');
      state.catalog = await catalogResponse.json(); state.meta = await metaResponse.json(); state.research = await researchResponse.json();
      const priority = await priorityResponse.json();
      const batch = await batchResponse.json();
      state.meta.characters = { ...state.meta.characters, ...(priority.characters || {}), ...(batch.characters || {}) };
      state.sourceReviewed = new Set(batch.sourceReviewed || []);
      const hashSelection = decodeURIComponent(location.hash.slice(1));
      state.selected = characterByName(hashSelection)?.name || characterByName('Arlecchino')?.name || state.catalog.data.characters[0]?.name;
      setLanguage(state.lang);
    } catch (error) {
      console.error(error);
      byId('characterWorkspace').innerHTML = `<div class="missing-meta"><strong>Unable to load the Genshin data snapshot.</strong><p>The static data files may not have been published yet. Refresh after the deployment completes.</p></div>`;
    }
  }

  initialise();
})();
