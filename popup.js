import * as core from './core.js';

const $ = id => document.getElementById(id);
const settings = await core.readSettings(chrome.storage.local);
const save = values => chrome.storage.local.set(values);

$('enabled').checked = settings.enabled;
$('enabled').addEventListener('change', e => save({ enabled: e.target.checked }));

const showTarget = () => {
  $('target').textContent = core.languageName(settings.target);
  $('target').setAttribute('aria-label', `Target Language: ${core.languageName(settings.target)}`);
};
showTarget();
// The language panel covers the popup instead of opening below the button: the popup window is too short for a list.
$('target').addEventListener('click', () => {
  const sheet = el('div', { className: 'sheet', innerHTML: `<div class="sheet-hd"><button class="plain" title="Back" aria-label="Back"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg></button><h2>Translate to</h2></div>` });
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Translate to');
  const panel = languagePanel({
    button: $('target'), list: core.languageList(), value: settings.target, pinned: [settings.target, settings.second], label: 'Target Language',
    onClose: () => { sheet.remove(); $('main').inert = false; },
    onPick: async code => {
      settings.target = code;
      showTarget();
      await save({ target: code });
      if ($('text').value.trim()) translate();
    },
  });
  sheet.querySelector('button').addEventListener('click', panel.close);
  sheet.append(panel);
  $('main').inert = true;
  document.body.append(sheet);
});

$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
const openOptions = hash => chrome.runtime.sendMessage({ type: 'openOptions', hash });

const line = (text, cls = '') => el('p', { className: `small ${cls}`, textContent: text });

function show(res) {
  const out = $('result');
  out.hidden = false;
  out.textContent = '';
  if (res.error) return out.append(line(res.error, 'err'));
  if (res.note) out.append(line(res.already ? `${res.note} Set a Second Language in the options to translate it anyway.` : res.note));
  if (res.text) {
    const by = el('b', { textContent: res.answeredBy });
    out.append(el('div', { dir: 'auto', textContent: res.text }), el('span', { className: 'by' }, res.from ? `${core.languageName(res.from)}. Answered by ` : 'Answered by ', by));
  }
  for (const x of res.skipped ?? []) {
    const p = line(x.line, 'muted');
    if (x.pack) p.append(' ', el('button', { className: 'link', textContent: 'Make this pair offline', onclick: () => openOptions(`#pack=${x.pack}`) }));
    out.append(p);
  }
}

async function translate() {
  const text = $('text').value;
  if (!text.trim()) return $('text').focus();
  $('go').disabled = true;
  $('go').textContent = 'Translating…';
  try {
    show(await chrome.runtime.sendMessage({ type: 'translate', text }));
  } finally {
    $('go').disabled = false;
    $('go').textContent = 'Translate';
  }
}
$('go').addEventListener('click', translate);
$('text').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) translate();
});

// "Don't show on this site" needs the page's host name, which only our content script can tell
// (no "tabs" permission). Pages without the content script get no button.
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const site = tab && await chrome.tabs.sendMessage(tab.id, { type: 'host' }, { frameId: 0 }).then(r => r?.host, () => null);
if (site) {
  const label = () => {
    const off = settings.disabledSites.includes(site);
    $('site').textContent = off ? `Show on ${site}` : `Don't show on ${site}`;
    $('site').title = off ? `Show the Trigger Icon and instant translation on ${site} again.` : `Hide the Trigger Icon and instant translation on ${site}. The shortcut and right-click still translate.`;
  };
  $('site').hidden = false;
  label();
  $('site').addEventListener('click', async () => {
    settings.disabledSites = settings.disabledSites.includes(site) ? settings.disabledSites.filter(h => h !== site) : [...settings.disabledSites, site];
    await save({ disabledSites: settings.disabledSites });
    label();
  });
}

const { pendingText } = await chrome.storage.session.get('pendingText');
if (pendingText) {
  await chrome.storage.session.remove('pendingText');
  $('text').value = pendingText;
  translate();
} else {
  $('text').focus();
}
