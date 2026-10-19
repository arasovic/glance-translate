import * as core from './core.js';

const $ = id => document.getElementById(id);
let settings;
const reload = async () => { settings = await core.readSettings(chrome.storage.local); };
await reload();
const save = async values => { await chrome.storage.local.set(values); await reload(); };

const iconButton = (text, label, onClick) => {
  const b = el('button', { className: 'plain', textContent: text, title: label });
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
};

$('key').value = settings.openrouterKey ?? '';
const keyStatus = (text, cls = 'muted') => Object.assign($('keyStatus'), { textContent: text, className: `status ${cls}` });

$('saveKey').addEventListener('click', async () => {
  const key = $('key').value.trim();
  if (!key) return keyStatus('Enter a key first.', 'err');
  await save({ openrouterKey: key });
  keyStatus('Key saved. Explain is ready in the Translation Card.', 'ok');
});
$('deleteKey').addEventListener('click', async () => {
  await chrome.storage.local.remove('openrouterKey');
  await reload();
  $('key').value = '';
  keyStatus('Key deleted. Explain is off; translation works as before.');
});

const money = n => `$${Number(n).toFixed(2)}`;
$('testKey').addEventListener('click', async () => {
  const key = $('key').value.trim() || settings.openrouterKey;
  if (!key) return keyStatus('Enter a key first.', 'err');
  keyStatus('Testing…');
  const info = await chrome.runtime.sendMessage({ type: 'testKey', key });
  if (info?.error) return keyStatus(`The key did not work. ${info.error}`, 'err');
  const parts = ['The key works.'];
  if (info.limit_remaining != null) parts.push(`Credit left on this key: ${money(info.limit_remaining)}.`);
  else if (info.usage != null) parts.push(`No credit limit on this key. Used so far: ${money(info.usage)}.`);
  const free = info.free_model_daily_requests;
  if (free?.remaining != null) parts.push(`Free Model requests left today: ${free.remaining}${free.limit != null ? ` of ${free.limit}` : ''}.`);
  keyStatus(parts.join(' '), 'ok');
});

// The Fallback Chain and the Explain Model list: ordered rows with move and remove buttons.
const LISTS = {
  chain: { list: 'chainList', empty: 'The chain is empty. Reset it to default.' },
  explainModels: { list: 'modelList', empty: 'The list is empty. Add a Model or reset to default.', tags: true },
};

function renderRows(name) {
  const { list, empty, tags } = LISTS[name];
  const items = settings[name];
  $(list).textContent = '';
  items.forEach((entry, i) => {
    const label = core.entryLabel(entry);
    const move = async to => {
      const next = [...items];
      next.splice(to, 0, next.splice(i, 1)[0]);
      await save({ [name]: next });
      renderRows(name);
      $(list).children[to]?.querySelector(`[aria-label^="${to < i ? 'Move up' : 'Move down'}"]`)?.focus();
    };
    const end = el('span', { className: 'end' });
    if (i > 0) end.append(iconButton('↑', `Move up ${label}`, () => move(i - 1)));
    if (i < items.length - 1) end.append(iconButton('↓', `Move down ${label}`, () => move(i + 1)));
    end.append(iconButton('✕', `Remove ${label}`, async () => {
      await save({ [name]: items.filter(e => e !== entry) });
      renderRows(name);
    }));
    const li = el('li', {}, el('span', { className: 'name', textContent: label }));
    if (tags) li.append(el('span', { className: 'tag', textContent: core.entryTag(entry) }));
    li.append(end);
    $(list).append(li);
  });
  if (!items.length) $(list).append(el('li', { className: 'muted', textContent: empty }));
  if (name === 'explainModels') fillModelOptions();
}

$('resetChain').addEventListener('click', async () => {
  await chrome.storage.local.remove('chain');
  await reload();
  renderRows('chain');
});

let models = [];
function fillModelOptions() {
  $('modelOptions').textContent = '';
  for (const id of models) if (!settings.explainModels.includes(core.OR_PREFIX + id)) $('modelOptions').append(el('option', { value: id }));
}

// The list loads when the user starts to add a Model, so opening the options page contacts no AI Provider.
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
  fillModelOptions();
}
$('model').addEventListener('focus', loadModels, { once: true });
$('freeOnly').addEventListener('change', loadModels);

$('addModel').addEventListener('click', async () => {
  const id = $('model').value.trim();
  if (!id) return $('model').focus();
  if (/\s/.test(id)) return ($('modelStatus').textContent = 'A Model id has no spaces, for example nvidia/nemotron-3-super-120b-a12b:free.');
  const entry = core.OR_PREFIX + id;
  if (settings.explainModels.includes(entry)) return ($('modelStatus').textContent = `${id} is already in the list.`);
  await save({ explainModels: [...settings.explainModels, entry] });
  $('model').value = '';
  renderRows('explainModels');
});
$('model').addEventListener('keydown', e => e.key === 'Enter' && $('addModel').click());
$('resetModels').addEventListener('click', async () => {
  await chrome.storage.local.remove('explainModels');
  await reload();
  renderRows('explainModels');
});

const langList = core.languageList();
const showLang = (button, code) => {
  const name = code ? core.languageName(code) : 'None';
  button.value = code;
  button.textContent = name;
  button.setAttribute('aria-label', `${button.dataset.label}: ${name}`);
};
// The button opens the language panel as a popover below it, or above it when there is more room there.
function langPicker(button, value, onPick, none) {
  showLang(button, value);
  const pop = el('div', { className: 'lang-popover', popover: 'auto' });
  button.popoverTargetElement = pop;
  button.setAttribute('aria-haspopup', 'listbox');
  const place = () => {
    const rect = button.getBoundingClientRect(), below = innerHeight - rect.bottom - 12, above = rect.top - 12;
    const up = below < 320 && above > below;
    pop.style.maxHeight = `${Math.min(380, up ? above : below)}px`;
    pop.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - pop.offsetWidth - 8))}px`;
    pop.style.top = up ? '' : `${rect.bottom + 4}px`;
    pop.style.bottom = up ? `${innerHeight - rect.top + 4}px` : '';
  };
  pop.addEventListener('beforetoggle', e => {
    if (e.newState !== 'open') return;
    pop.replaceChildren(languagePanel({
      button, list: langList, value: button.value, pinned: [settings.target, settings.second], none, label: button.dataset.label,
      onClose: () => pop.hidePopover(),
      onPick: code => { showLang(button, code); onPick(code); },
    }));
  });
  pop.addEventListener('toggle', e => {
    const open = e.newState === 'open';
    button.setAttribute('aria-expanded', String(open));
    for (const type of ['scroll', 'resize']) open ? addEventListener(type, place, true) : removeEventListener(type, place, true);
    if (open) place(); else pop.textContent = '';
  });
  document.body.append(pop);
}
langPicker($('target'), settings.target, async code => { await save({ target: code }); renderPacks(); });
langPicker($('second'), settings.second, code => save({ second: code }), 'None');

document.querySelector(`input[name=mode][value=${settings.triggerMode}]`).checked = true;
document.querySelectorAll('input[name=mode]').forEach(radio => radio.addEventListener('change', () => save({ triggerMode: radio.value })));

const command = (await chrome.commands.getAll()).find(c => c.name === 'translate-selection');
$('shortcut').textContent = command?.shortcut || 'Not set';
$('shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

const extraPairs = [];
const hashPair = location.hash.match(/^#pack=([\w-]+):([\w-]+)$/);
if (hashPair) extraPairs.push([hashPair[1], hashPair[2]]);

function suggestedPairs() {
  const other = settings.target === 'en' ? settings.second : settings.target;
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
    const translator = await Translator.create({
      sourceLanguage: from,
      targetLanguage: to,
      monitor: m => m.addEventListener('downloadprogress', e => (status.textContent = `${Math.round(e.loaded * 100)}%`)),
    });
    translator.destroy();
    button.remove();
    status.textContent = 'Ready offline';
  } catch (e) {
    button.disabled = false;
    status.textContent = `Download failed. ${e.message}`;
  }
}

langPicker($('packFrom'), 'en', () => {});
langPicker($('packTo'), settings.target, () => {});
$('addPack').addEventListener('click', () => {
  extraPairs.push([$('packFrom').value, $('packTo').value]);
  renderPacks(`${$('packFrom').value}:${$('packTo').value}`);
});

function renderSites() {
  const list = $('siteList');
  list.textContent = '';
  for (const site of settings.disabledSites) {
    list.append(el('li', {}, el('span', { className: 'name', textContent: site }), el('span', { className: 'end' },
      iconButton('✕', `Remove ${site}`, async () => {
        await save({ disabledSites: settings.disabledSites.filter(h => h !== site) });
        renderSites();
      }))));
  }
  $('noSites').hidden = settings.disabledSites.length > 0;
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  await reload();
  if (changes.disabledSites) renderSites();
  if (changes.target) showLang($('target'), settings.target);
});

$('debugLog').checked = !!settings.debug;
$('debugLog').addEventListener('change', e => save({ debug: e.target.checked }));

renderRows('chain');
renderRows('explainModels');
renderSites();
await renderPacks(hashPair && `${hashPair[1]}:${hashPair[2]}`);
if (location.hash && !hashPair) document.querySelector(location.hash)?.scrollIntoView();
// The card's "Add key" link opens #ai.
if (location.hash === '#ai' && !settings.openrouterKey) $('key').focus();
