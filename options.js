import * as core from './core.js';

const $ = id => document.getElementById(id);
const stored = () => chrome.storage.local.get(null);
let s = core.withDefaults(await stored(), navigator.languages);
const save = async values => {
  await chrome.storage.local.set(values);
  s = core.withDefaults(await stored(), navigator.languages);
};

function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}
const iconButton = (text, label, onClick) => {
  const b = el('button', { className: 'plain', textContent: text, title: label });
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
};

// ---- Providers ----

$('key').value = s.openrouterKey ?? '';
const keyStatus = (text, cls = 'muted') => Object.assign($('keyStatus'), { textContent: text, className: `status ${cls}` });

$('saveKey').addEventListener('click', async () => {
  const key = $('key').value.trim();
  if (!key) return keyStatus('Enter a key first.', 'err');
  await save({ openrouterKey: key });
  keyStatus('chain' in await stored() ? 'Key saved.' : 'Key saved. AI Models now back up the keyless Providers in the Fallback Chain.', 'ok');
  renderChain();
});
$('deleteKey').addEventListener('click', async () => {
  await chrome.storage.local.remove('openrouterKey');
  s = core.withDefaults(await stored(), navigator.languages);
  $('key').value = '';
  keyStatus('Key deleted.');
  renderChain();
});

const money = n => `$${Number(n).toFixed(2)}`;
$('testKey').addEventListener('click', async () => {
  const key = $('key').value.trim() || s.openrouterKey;
  if (!key) return keyStatus('Enter a key first.', 'err');
  keyStatus('Testing…');
  const d = await chrome.runtime.sendMessage({ type: 'testKey', key });
  if (d?.error) return keyStatus(`The key did not work. ${d.error}`, 'err');
  const parts = ['The key works.'];
  if (d.limit_remaining != null) parts.push(`Credit left on this key: ${money(d.limit_remaining)}.`);
  else if (d.usage != null) parts.push(`No credit limit on this key. Used so far: ${money(d.usage)}.`);
  const free = d.free_model_daily_requests;
  if (free?.remaining != null) parts.push(`Free Model requests left today: ${free.remaining}${free.limit != null ? ` of ${free.limit}` : ''}.`);
  keyStatus(parts.join(' '), 'ok');
});

// ---- Fallback Chain ----

const KEYLESS = core.KEYLESS_CHAIN;
const tagOf = entry => {
  if (KEYLESS.includes(entry)) return 'Keyless';
  if (core.modelOf(entry) === core.FREE_ROUTER) return 'Free Router';
  return entry.endsWith(':free') ? 'Free Model' : 'Model';
};

function renderChain() {
  const list = $('chainList');
  list.textContent = '';
  s.chain.forEach((entry, i) => {
    const move = async to => {
      const chain = [...s.chain];
      chain.splice(to, 0, chain.splice(i, 1)[0]);
      await save({ chain });
      renderChain();
      $('chainList').children[to]?.querySelector(`[aria-label^="${to < i ? 'Move up' : 'Move down'}"]`)?.focus();
    };
    const end = el('span', { className: 'end' });
    if (i > 0) end.append(iconButton('↑', `Move up ${core.entryLabel(entry)}`, () => move(i - 1)));
    if (i < s.chain.length - 1) end.append(iconButton('↓', `Move down ${core.entryLabel(entry)}`, () => move(i + 1)));
    end.append(iconButton('✕', `Remove ${core.entryLabel(entry)}`, async () => {
      await save({ chain: s.chain.filter(e => e !== entry) });
      renderChain();
    }));
    const li = el('li', {}, el('span', { className: 'name', textContent: core.entryLabel(entry) }), el('span', { className: 'tag', textContent: tagOf(entry) }));
    if (core.isModel(entry) && !s.openrouterKey) li.append(el('span', { className: 'muted small', textContent: 'needs a key' }));
    li.append(end);
    list.append(li);
  });
  if (!s.chain.length) list.append(el('li', { className: 'muted', textContent: 'The chain is empty. Add an entry or reset to default.' }));
  fillEntryList();
}

let models = [];
function fillEntryList() {
  const list = $('entryList');
  list.textContent = '';
  for (const entry of KEYLESS) if (!s.chain.includes(entry)) list.append(el('option', { value: core.entryLabel(entry) }));
  for (const id of models) if (!s.chain.includes(core.OR_PREFIX + id)) list.append(el('option', { value: id }));
}

async function loadModels() {
  const all = !$('freeOnly').checked;
  $('modelStatus').textContent = 'Loading Models…';
  const res = await chrome.runtime.sendMessage({ type: 'models', all });
  if (res?.error) {
    models = [];
    $('modelStatus').textContent = `Couldn't load the Model list. ${res.error}`;
  } else {
    models = res;
    $('modelStatus').textContent = `${models.length} ${all ? 'Models' : 'Free Models'} available. You can also type any Model id.`;
  }
  fillEntryList();
}
$('freeOnly').addEventListener('change', loadModels);

$('add').addEventListener('click', async () => {
  const value = $('entry').value.trim();
  if (!value) return $('entry').focus();
  const entry = KEYLESS.find(e => e === value.toLowerCase() || core.entryLabel(e).toLowerCase() === value.toLowerCase())
    ?? core.OR_PREFIX + value;
  if (/\s/.test(value) && !KEYLESS.includes(entry)) return ($('modelStatus').textContent = 'A Model id has no spaces, for example nvidia/nemotron-3-super-120b-a12b:free.');
  if (s.chain.includes(entry)) return ($('modelStatus').textContent = `${core.entryLabel(entry)} is already in the chain.`);
  await save({ chain: [...s.chain, entry] });
  $('entry').value = '';
  renderChain();
});
$('entry').addEventListener('keydown', e => e.key === 'Enter' && $('add').click());
$('resetChain').addEventListener('click', async () => {
  await chrome.storage.local.remove('chain');
  s = core.withDefaults(await stored(), navigator.languages);
  renderChain();
});

// ---- Languages ----

const fillLangs = (select, value, none) => {
  select.textContent = '';
  if (none) select.append(new Option(none, ''));
  for (const code of core.LANGS) select.append(new Option(core.languageName(code), code));
  select.value = value;
};
fillLangs($('target'), s.target);
fillLangs($('second'), s.second, 'None');
$('target').addEventListener('change', async e => { await save({ target: e.target.value }); renderPacks(); });
$('second').addEventListener('change', e => save({ second: e.target.value }));

// ---- Trigger ----

document.querySelector(`input[name=mode][value=${s.triggerMode}]`).checked = true;
document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => save({ triggerMode: r.value })));
const command = (await chrome.commands.getAll()).find(c => c.name === 'translate-selection');
$('shortcut').textContent = command?.shortcut || 'Not set';
$('shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

// ---- Offline Packs ----

const extraPairs = [];
const hashPair = location.hash.match(/^#pack=([\w-]+):([\w-]+)$/);
if (hashPair) extraPairs.push([hashPair[1], hashPair[2]]);

function suggestedPairs() {
  const other = s.target === 'en' ? s.second : s.target;
  return other ? [['en', other], [other, 'en']] : [];
}

async function renderPacks(focusPair) {
  if (!('Translator' in self)) {
    $('noTranslator').hidden = false;
    return;
  }
  const list = $('packList');
  list.textContent = '';
  const seen = new Set();
  for (const [from, to] of [...suggestedPairs(), ...extraPairs]) {
    const key = `${from}:${to}`;
    if (seen.has(key) || from === to) continue;
    seen.add(key);
    const status = el('span', { className: 'muted small', textContent: 'Checking…' });
    const end = el('span', { className: 'end' }, status);
    const li = el('li', {}, el('span', { className: 'name', textContent: `${core.languageName(from)} to ${core.languageName(to)}` }), end);
    list.append(li);
    const state = await Translator.availability({ sourceLanguage: from, targetLanguage: to }).catch(() => 'unavailable');
    if (state === 'available') status.textContent = 'Ready offline';
    else if (state === 'unavailable') status.textContent = 'Not supported by Chrome';
    else {
      status.textContent = '';
      const b = el('button', { textContent: 'Download' });
      b.setAttribute('aria-label', `Download ${core.languageName(from)} to ${core.languageName(to)}`);
      b.addEventListener('click', () => download(from, to, b, status));
      end.append(b);
      if (key === focusPair) {
        li.classList.add('focus');
        li.scrollIntoView({ block: 'center' });
        b.focus();
      }
    }
  }
}

async function download(from, to, button, status) {
  button.disabled = true;
  status.textContent = 'Starting…';
  try {
    const t = await Translator.create({
      sourceLanguage: from,
      targetLanguage: to,
      monitor: m => m.addEventListener('downloadprogress', e => (status.textContent = `${Math.round(e.loaded * 100)}%`)),
    });
    t.destroy();
    button.remove();
    status.textContent = 'Ready offline';
  } catch (e) {
    button.disabled = false;
    status.textContent = `Download failed. ${e.message}`;
  }
}

fillLangs($('packFrom'), 'en');
fillLangs($('packTo'), s.target);
$('addPack').addEventListener('click', () => {
  extraPairs.push([$('packFrom').value, $('packTo').value]);
  renderPacks(`${$('packFrom').value}:${$('packTo').value}`);
});

// ---- Disabled Sites ----

function renderSites() {
  const list = $('siteList');
  list.textContent = '';
  for (const site of s.disabledSites) {
    list.append(el('li', {}, el('span', { className: 'name', textContent: site }), el('span', { className: 'end' },
      iconButton('✕', `Remove ${site}`, async () => {
        await save({ disabledSites: s.disabledSites.filter(h => h !== site) });
        renderSites();
      }))));
  }
  $('noSites').hidden = s.disabledSites.length > 0;
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  s = core.withDefaults(await stored(), navigator.languages);
  if (changes.disabledSites) renderSites();
  if (changes.target) $('target').value = s.target;
});

renderChain();
renderSites();
loadModels();
await renderPacks(hashPair && `${hashPair[1]}:${hashPair[2]}`);
if (location.hash && !hashPair) document.querySelector(location.hash)?.scrollIntoView();
