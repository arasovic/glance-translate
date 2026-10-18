// Language panel for the Toolbar Popup, the options page and the Translation Card: a search field over
// "Your languages" and all languages, each shown with its own name. A classic script, so the content script
// can load it too (manifest, before content.js); the content script adds LANG_PANEL_CSS to its Shadow DOM.
const LANG_PANEL_CSS = `
  .lang { display: inline-flex; align-items: center; gap: 6px; min-width: 0; text-align: left; }
  .lang::after { content: ""; flex: none; width: 5px; height: 5px; margin: 0 2px 0 auto; border: solid var(--mut);
                 border-width: 0 1.5px 1.5px 0; translate: 0 -2px; rotate: 45deg; }
  .lang[aria-expanded="true"]::after { translate: 0 2px; rotate: 225deg; }
  .lp { display: flex; flex-direction: column; min-height: 0; font-size: 13px; line-height: 1.4; color: var(--fg); }
  .lp-search { position: relative; flex: none; padding: 8px; border-bottom: 1px solid var(--line); }
  .lp-search svg { position: absolute; left: 18px; top: 50%; translate: 0 -50%; color: var(--mut); pointer-events: none; }
  .lp-search input { display: block; width: 100%; margin: 0; font: inherit; color: inherit; background: transparent;
                     border: 1px solid var(--line); border-radius: 7px; padding: 6px 10px 6px 30px; outline: none; }
  .lp-search input:focus { border-color: var(--acc); }
  .lp-search input::placeholder { color: var(--mut); }
  .lp-list { position: relative; flex: 1 1 auto; min-height: 0; overflow: auto; padding: 2px 4px 4px; overscroll-behavior: contain;
             scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  .lp-group { padding: 8px 8px 3px; font-size: 11.5px; color: var(--mut); }
  .lp-opt { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 5px 8px;
            border-radius: 6px; cursor: pointer; }
  .lp-opt svg { visibility: hidden; color: var(--acc); }
  .lp-opt[aria-selected="true"] svg { visibility: visible; }
  .lp-opt[aria-selected="true"] .lp-name { font-weight: 600; }
  .lp-opt.on { background: var(--soft); }
  .lp-opt.on .lp-name { color: var(--acc); }
  .lp-native { max-width: 9em; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; color: var(--mut); }
  .lp-empty { padding: 16px 12px; text-align: center; color: var(--mut); overflow-wrap: anywhere; }
`;

let langPanelCount = 0;

// list: [[code, English name, own name]]; pinned: codes for "Your languages"; none: label of an empty choice.
function languagePanel({ list, value, pinned = [], none, label, onPick, onClose }) {
  const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const all = list.map(([code, name, own = '']) => ({ code, name, own, key: [fold(name), fold(own)] }));
  const byCode = new Map(all.map(l => [l.code, l]));
  const top = [...(none ? [{ code: '', name: none, own: '' }] : []), ...new Set(pinned)].map(c => typeof c === 'string' ? byCode.get(c) : c).filter(Boolean);
  // Lower is better: the code itself, then a name that starts with the query, a word in it that does, a name that
  // contains it. Within a tier the shorter name wins, so "fra" lists French before Canadian French. -1: no match.
  const TIERS = [q => k => k.startsWith(q), q => k => k.split(/[\s(),-]+/).some(w => w.startsWith(q)), q => k => k.includes(q)];
  const rank = (l, q) => {
    if (l.code.toLowerCase() === q) return 0;
    for (const [i, tier] of TIERS.entries()) {
      const hits = l.key.filter(tier(q));
      if (hits.length) return i + 1 + Math.min(...hits.map(k => k.length)) / 1000;
    }
    return -1;
  };

  const id = `lp${++langPanelCount}`;
  const panel = document.createElement('div');
  panel.className = 'lp';
  panel.innerHTML = `<div class="lp-search"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
    <input type="text" role="combobox" aria-autocomplete="list" aria-expanded="true" autocomplete="off" spellcheck="false" placeholder="Search languages" aria-label="Search languages"></div>
    <div class="lp-list" role="listbox"></div>`;
  const input = panel.querySelector('input'), box = panel.querySelector('.lp-list');
  box.id = `${id}-list`;
  box.setAttribute('aria-label', label);
  input.setAttribute('aria-controls', box.id);
  let opts = [], active = -1;

  const CHECK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
  function option(l) {
    const o = document.createElement('div');
    o.className = 'lp-opt';
    o.id = `${id}-${opts.length}`;
    o.dataset.code = l.code;
    o.setAttribute('role', 'option');
    o.setAttribute('aria-selected', String(l.code === value));
    o.innerHTML = CHECK;
    const name = document.createElement('span');
    name.className = 'lp-name';
    name.textContent = l.name;
    o.append(name);
    if (l.own) {
      const own = document.createElement('span');
      own.className = 'lp-native';
      own.lang = l.code;
      own.textContent = l.own;
      o.append(own);
    }
    opts.push(o);
    return o;
  }

  function group(title, items) {
    const g = document.createElement('div');
    g.setAttribute('role', 'group');
    if (title) {
      const h = document.createElement('div');
      h.className = 'lp-group';
      h.id = `${id}-g${box.children.length}`;
      h.textContent = title;
      g.setAttribute('aria-labelledby', h.id);
      g.append(h);
    }
    g.append(...items.map(option));
    box.append(g);
  }

  function setActive(i, reveal) {
    opts[active]?.classList.remove('on');
    active = i;
    const o = opts[i];
    if (!o) return input.removeAttribute('aria-activedescendant');
    o.classList.add('on');
    input.setAttribute('aria-activedescendant', o.id);
    // scrollTop, not scrollIntoView: that could also scroll the page under the Translation Card.
    if (reveal === 'center') box.scrollTop = o.offsetTop - (box.clientHeight - o.offsetHeight) / 2;
    else if (reveal && o.offsetTop < box.scrollTop) box.scrollTop = o.offsetTop - 4;
    else if (reveal && o.offsetTop + o.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = o.offsetTop + o.offsetHeight - box.clientHeight + 4;
  }

  function render() {
    const q = fold(input.value.trim());
    box.textContent = '';
    opts = [];
    active = -1;
    if (!q) {
      if (top.length) group('Your languages', top);
      group('All languages', all);
      const i = opts.findIndex(o => o.dataset.code === value);
      return setActive(i, i >= top.length && 'center');
    }
    const hits = all.map(l => [l, rank(l, q)]).filter(([, r]) => r >= 0).sort((a, b) => a[1] - b[1]).map(([l]) => l);
    if (hits.length) group('', hits);
    else box.append(Object.assign(document.createElement('div'), { className: 'lp-empty', textContent: `No language matches “${input.value.trim()}”.` }));
    box.scrollTop = 0;
    setActive(hits.length ? 0 : -1);
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', e => {
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[e.key];
    if (step) {
      e.preventDefault();
      if (opts.length) setActive(Math.max(0, Math.min(opts.length - 1, active + step)), true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (opts[active]) onPick(opts[active].dataset.code);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  });
  // Keys typed here must not reach the host page's own shortcuts.
  for (const type of ['keydown', 'keyup', 'keypress']) panel.addEventListener(type, e => e.stopPropagation());
  box.addEventListener('mousedown', e => e.preventDefault()); // Keep focus in the search field.
  box.addEventListener('pointermove', e => {
    const o = e.target.closest('.lp-opt');
    if (o && o !== opts[active]) setActive(opts.indexOf(o));
  });
  box.addEventListener('click', e => {
    const o = e.target.closest('.lp-opt');
    if (o) onPick(o.dataset.code);
  });
  // Runs once the caller has put the panel in the page and shown it (a popover is shown after its beforetoggle event).
  requestAnimationFrame(() => { render(); input.focus({ preventScroll: true }); });
  return panel;
}

// Extension pages load this file with a <script> tag; content scripts have no currentScript.
if (document.currentScript) document.head.append(Object.assign(document.createElement('style'), { textContent: LANG_PANEL_CSS }));
