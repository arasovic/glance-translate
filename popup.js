import * as core from './core.js';

const $ = id => document.getElementById(id);
const s = core.withDefaults(await chrome.storage.local.get(null), navigator.languages);
const save = values => chrome.storage.local.set(values);

$('enabled').checked = s.enabled;
$('enabled').addEventListener('change', e => save({ enabled: e.target.checked }));

for (const [code, name] of core.languageList()) $('target').append(new Option(name, code, false, code === s.target));
$('target').addEventListener('change', async e => {
  await save({ target: e.target.value });
  if ($('text').value.trim()) translate();
});

$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
const openOptions = hash => chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${hash}`) });

function line(text, cls = '') {
  const p = document.createElement('p');
  p.className = `small ${cls}`;
  p.textContent = text;
  return p;
}

function show(res) {
  const out = $('result');
  out.hidden = false;
  out.textContent = '';
  if (res.error) return out.append(line(res.error, 'err'));
  if (res.already) out.append(line(`This text is already in ${core.languageName(res.target)}. Set a Second Language in the options to translate it anyway.`));
  if (res.failed) out.append(line('No entry in the Fallback Chain could translate this.'));
  if (res.text) {
    const text = document.createElement('div');
    text.dir = 'auto';
    text.textContent = res.text;
    const by = document.createElement('span');
    by.className = 'by';
    const b = document.createElement('b');
    b.textContent = res.answeredBy;
    by.append(res.from ? `${core.languageName(res.from)}. Answered by ` : 'Answered by ', b);
    out.append(text, by);
  }
  for (const x of res.skipped ?? []) {
    const p = line(`${res.failed ? '' : 'Skipped '}${x.label}: ${x.reason}.`, 'muted');
    if (x.pack) {
      const a = document.createElement('button');
      a.className = 'link';
      a.textContent = 'Make this pair offline';
      a.addEventListener('click', () => openOptions(`#pack=${x.pack}`));
      p.append(' ', a);
    }
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
    const off = s.disabledSites.includes(site);
    $('site').textContent = off ? `Show on ${site}` : `Don't show on ${site}`;
    $('site').title = off ? `Show the Trigger Icon and instant translation on ${site} again.` : `Hide the Trigger Icon and instant translation on ${site}. The shortcut and right-click still translate.`;
  };
  $('site').hidden = false;
  label();
  $('site').addEventListener('click', async () => {
    s.disabledSites = s.disabledSites.includes(site) ? s.disabledSites.filter(h => h !== site) : [...s.disabledSites, site];
    await save({ disabledSites: s.disabledSites });
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
