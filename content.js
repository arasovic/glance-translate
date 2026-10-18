// Selection Translation on the page: Trigger Icon and Translation Card in a closed Shadow DOM.
// Every decision about languages and Providers is made in background.js.
(() => {
  const settings = { enabled: true, triggerMode: 'icon', disabledSites: [] };
  chrome.storage.local.get(Object.keys(settings)).then(s => Object.assign(settings, s));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(settings)) if (key in changes) settings[key] = changes[key].newValue ?? settings[key];
  });

  const topHost = () => {
    const origins = location.ancestorOrigins;
    return origins?.length ? new URL(origins[origins.length - 1]).hostname : location.hostname;
  };
  const autoTrigger = () => settings.enabled && settings.triggerMode !== 'manual' && !settings.disabledSites.includes(topHost());

  const GLYPH = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4h7M6 2.5V4M4 4c.4 2.4 2 4.3 4 5M8 4c-.5 2.6-2.4 4.7-5 6"/><path d="M9.5 13.5l2.5-6 2.5 6M10.4 11.6h3.2"/></svg>';
  const ICONS = {
    copy: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h6.5"/></svg>',
    done: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
    listen: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6v4h2.5L8.5 13V3L5 6z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8" stroke-linecap="round"/></svg>',
    pause: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M5.5 3.5v9M10.5 3.5v9"/></svg>',
    more: '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/></svg>',
  };

  const STYLE = `
    :host { all: initial !important; position: absolute !important; top: 0 !important; left: 0 !important; z-index: 2147483647 !important; }
    * { box-sizing: border-box; }
    .w { --acc: #2b50d8; --on-acc: #fff; --bg: #fff; --fg: #1d1f23; --mut: #626975; --line: #e3e5e9; --soft: #eef1fd; --err: #b42318;
         font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--fg); }
    @media (prefers-color-scheme: dark) {
      .w { --acc: #8fa6ff; --on-acc: #14183a; --bg: #26282c; --fg: #e8e9ec; --mut: #a2a7b0; --line: #393c42; --soft: #2d3350; --err: #ff9b8f; }
    }
    [hidden] { display: none !important; }
    button { font: inherit; color: inherit; background: none; border: 0; margin: 0; padding: 0; cursor: pointer; }
    :focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
    .icon { position: absolute; width: 26px; height: 26px; border-radius: 7px; background: var(--acc); color: var(--on-acc);
            display: grid; place-items: center; box-shadow: 0 2px 8px rgb(20 30 80 / .3); }
    .card { position: absolute; width: 340px; max-width: calc(100vw - 16px); background: var(--bg); border: 1px solid var(--line);
            border-radius: 10px; box-shadow: 0 6px 24px rgb(15 20 35 / .14); max-height: calc(100vh - 16px); overflow: auto; }
    .card:focus-visible { outline-offset: -1px; }
    .hd { display: flex; align-items: center; gap: 4px; padding: 8px 8px 0 14px; font-size: 12.5px; color: var(--mut); cursor: move; user-select: none; touch-action: none; }
    .hd .lang { color: var(--fg); border-radius: 5px; padding: 2px 4px; max-width: 170px; overflow-wrap: break-word; }
    /* The Source Language name wraps first; the Target button wraps only when that is not enough. */
    .hd > span { flex-shrink: 1000; }
    .hd .lang:hover, .hd .lang[aria-expanded="true"] { background: var(--soft); }
    .card .lp { margin-top: 6px; border-top: 1px solid var(--line); }
    .card .lp-list { max-height: 264px; }
    ${LANG_PANEL_CSS}
    .acts { margin-left: auto; display: flex; gap: 2px; flex: none; }
    .ib { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 6px; color: var(--mut); }
    .ib:hover, .ib[aria-expanded="true"] { background: var(--soft); color: var(--acc); }
    .tx { padding: 6px 14px 10px; font-size: 15.5px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 50vh; overflow: auto; }
    .tx.note { font-size: 14px; }
    .ft { border-top: 1px solid var(--line); padding: 7px 14px 9px; font-size: 12px; color: var(--mut); overflow-wrap: anywhere; }
    .ft b { font-weight: 600; color: var(--acc); }
    .ft p { margin: 3px 0 0; }
    .ft .err { color: var(--fg); }
    .link { color: var(--acc); text-decoration: underline; text-underline-offset: 2px; font-size: inherit; }
    .menu { margin: 4px 8px 0; padding: 4px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); }
    .menu button { display: block; width: 100%; text-align: left; padding: 5px 8px; border-radius: 5px; font-size: 13px; overflow-wrap: anywhere; }
    .menu button:hover, .menu button:focus-visible { background: var(--soft); color: var(--acc); }
    .menu .lbl { padding: 2px 8px 4px; font-size: 12px; color: var(--mut); }
    .busy { display: flex; gap: 5px; padding: 12px 14px 14px; }
    .busy i { width: 6px; height: 6px; border-radius: 50%; background: var(--acc); opacity: .35; animation: p 1s infinite; }
    .busy i:nth-child(2) { animation-delay: .15s; } .busy i:nth-child(3) { animation-delay: .3s; }
    @keyframes p { 50% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .busy i { animation: none; opacity: .7; } }
  `;

  let host, root, icon, card, last, langs, dwell, moved;

  function ensureHost() {
    if (!host) {
      host = document.createElement('select-translate');
      root = host.attachShadow({ mode: 'closed' });
      root.innerHTML = `<style>${STYLE}</style><div class="w">
        <button class="icon" hidden aria-label="Translate selection" title="Translate selection">${GLYPH}</button>
        <div class="card" role="dialog" aria-label="Translation" tabindex="-1" hidden></div></div>`;
      icon = root.querySelector('.icon');
      card = root.querySelector('.card');
      icon.addEventListener('mousedown', e => e.preventDefault()); // Keep the page Selection.
      icon.addEventListener('click', () => { hideIcon(); translateSelection(last); });
      // Resting the mouse on the icon also starts the translation; a pass across it does not.
      icon.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') dwell = setTimeout(() => icon.click(), 200); });
      icon.addEventListener('pointerleave', () => clearTimeout(dwell));
      card.addEventListener('keydown', e => e.key === 'Escape' && closeAll());
      card.addEventListener('pointerdown', dragCard);
    }
    if (!host.isConnected) document.documentElement.append(host);
  }

  const hideIcon = () => { clearTimeout(dwell); if (icon) icon.hidden = true; };
  function closeAll() {
    hideIcon();
    moved = false;
    if (card) { card.hidden = true; card.textContent = ''; }
    speechSynthesis.cancel();
  }

  const isEditable = node => {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return !!el && (el.isContentEditable || !!el.closest('input, textarea'));
  };

  function blockOf(node) {
    let el = node.nodeType === 1 ? node : node.parentElement;
    while (el && el !== document.body && getComputedStyle(el).display.startsWith('inline')) el = el.parentElement;
    return el ?? document.body;
  }

  // The Selection, its position and, for 1–3 words, the text block around it for the Context Sentence.
  function readSelection() {
    const sel = getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return null;
    const text = sel.toString();
    if (!/\p{L}/u.test(text)) return null;
    const range = sel.getRangeAt(0);
    if (isEditable(range.commonAncestorContainer) || isEditable(document.activeElement)) return null;
    const rects = range.getClientRects();
    const rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
    const box = range.getBoundingClientRect();
    const out = { text, rect, box };
    if (text.trim().split(/\s+/).length <= 3) {
      const el = blockOf(range.startContainer);
      const before = document.createRange();
      before.setStart(el, 0);
      before.setEnd(range.startContainer, range.startOffset);
      const all = document.createRange();
      all.selectNodeContents(el);
      const block = all.toString();
      const start = before.toString().length;
      const end = start + range.toString().length;
      const from = Math.max(0, start - 1500);
      Object.assign(out, { block: block.slice(from, end + 1500), start: start - from, end: end - from });
    }
    return out;
  }

  function placeIcon(sel) {
    ensureHost();
    icon.hidden = false;
    const x = Math.min(sel.rect.right + 4, innerWidth - 34);
    const y = sel.rect.bottom + 4 + 26 > innerHeight ? sel.rect.top - 30 : sel.rect.bottom + 4;
    icon.style.left = `${x + scrollX}px`;
    icon.style.top = `${y + scrollY}px`;
  }

  function placeCard(box) {
    if (moved) return;
    const w = card.offsetWidth, h = card.offsetHeight;
    const x = Math.max(8, Math.min(box.left, innerWidth - w - 8));
    const below = box.bottom + 8, above = box.top - h - 8;
    // Below the Selection, else above it, else as low as fits so no part is off screen.
    const y = below + h <= innerHeight - 8 ? below : above >= 8 ? above : Math.max(8, innerHeight - h - 8);
    card.style.left = `${x + scrollX}px`;
    card.style.top = `${y + scrollY}px`;
  }

  // Dragging the header moves the card; it stays there until it closes.
  function dragCard(e) {
    if (e.button !== 0 || !e.target.closest('.hd') || e.target.closest('button, select')) return;
    e.preventDefault();
    const r = card.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = m => {
      moved = true;
      card.style.left = `${Math.max(0, Math.min(m.clientX - dx, innerWidth - r.width)) + scrollX}px`;
      card.style.top = `${Math.max(0, Math.min(m.clientY - dy, innerHeight - 40)) + scrollY}px`;
    };
    card.setPointerCapture(e.pointerId);
    card.addEventListener('pointermove', move);
    card.addEventListener('lostpointercapture', () => card.removeEventListener('pointermove', move), { once: true });
  }

  const el = (tag, props = {}, ...kids) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...kids);
    return node;
  };

  const send = msg => chrome.runtime.sendMessage(msg).catch(e => ({ error: /context invalidated/i.test(e.message) ? 'Select Translate was updated. Reload this page to use it.' : e.message }));

  async function translateSelection(sel, { entry, keyboard } = {}) {
    if (!sel) return;
    if (sel !== last) moved = false;
    last = sel;
    ensureHost();
    hideIcon();
    card.hidden = false;
    card.setAttribute('aria-busy', 'true');
    card.replaceChildren(el('div', { className: 'busy', title: 'Translating…' }, el('i'), el('i'), el('i')));
    placeCard(sel.box);
    if (keyboard) card.focus();
    const [res] = await Promise.all([send({ type: 'translate', text: sel.text, block: sel.block, start: sel.start, end: sel.end, entry }), loadLangs()]);
    if (last !== sel || card.hidden) return;
    render(res);
    card.removeAttribute('aria-busy');
    placeCard(sel.box);
  }

  async function loadLangs() {
    langs ??= await send({ type: 'languages' });
  }

  // The language panel opens inside the card, in place of the translation.
  function targetButton(target) {
    const b = el('button', { className: 'lang', textContent: nameOf(target), title: 'Target Language' });
    b.setAttribute('aria-label', `Target Language: ${nameOf(target)}`);
    b.setAttribute('aria-haspopup', 'listbox');
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', () => {
      if (closePanel()) return;
      closeMenu();
      const panel = languagePanel({
        list: langs?.list ?? [], value: target, pinned: [target, ...langs?.pinned ?? []], label: 'Target Language',
        onClose: () => { closePanel(); b.focus(); },
        onPick: async code => {
          closePanel();
          if (code === target) return b.focus();
          await chrome.storage.local.set({ target: code });
          translateSelection(last, { keyboard: true });
        },
      });
      for (const x of card.querySelectorAll('.tx, .ft')) x.hidden = true;
      card.querySelector('.hd').after(panel);
      b.setAttribute('aria-expanded', 'true');
      placeCard(last.box);
    });
    return b;
  }

  function closePanel() {
    const panel = card.querySelector('.lp');
    if (!panel) return false;
    panel.remove();
    for (const x of card.querySelectorAll('.tx, .ft')) x.hidden = false;
    card.querySelector('.hd .lang')?.setAttribute('aria-expanded', 'false');
    placeCard(last.box);
    return true;
  }

  function button(cls, label, svg, onClick) {
    const b = el('button', { className: cls, title: label });
    b.setAttribute('aria-label', label);
    b.innerHTML = svg;
    b.addEventListener('click', onClick);
    return b;
  }

  const nameOf = code => langs?.list?.find(([c]) => c === code)?.[1] || code;

  function render(res) {
    speechSynthesis.cancel();
    card.textContent = '';
    if (res.error) {
      card.append(el('div', { className: 'tx note', textContent: res.error }));
      return;
    }
    const tx = el('div', { className: 'tx', dir: 'auto' });
    tx.setAttribute('aria-live', 'polite');
    const hd = el('div', { className: 'hd' });
    if (res.from) hd.append(el('span', { textContent: nameOf(res.from) }), ' to ');
    else hd.append('To ');
    hd.append(targetButton(res.target));
    const acts = el('div', { className: 'acts' });
    hd.append(acts);
    card.append(hd);

    if (res.text) {
      const copy = button('ib', 'Copy translation', ICONS.copy, () => copyText(res.text, copy));
      acts.append(copy, listenButton(res.text, res.lang));
    }
    const others = (res.chain ?? []).filter(c => c.entry !== res.entry);
    if (others.length) {
      const more = button('ib', 'Translate with another entry', ICONS.more, () => toggleMenu(more, others));
      more.setAttribute('aria-haspopup', 'menu');
      more.setAttribute('aria-expanded', 'false');
      acts.append(more);
    }
    card.append(tx);

    const ft = el('div', { className: 'ft' });
    if (res.text) {
      tx.textContent = res.text;
      ft.append('Answered by ', el('b', { textContent: res.answeredBy }), res.cached ? ' (cached)' : '');
    } else if (res.already) {
      tx.className = 'tx note';
      tx.textContent = `This text is already in ${nameOf(res.target)}.`;
      ft.append(el('p', {}, 'To translate it anyway, ', link('set a Second Language', '#languages'), '.'));
    } else if (res.failed) {
      tx.className = 'tx note';
      tx.textContent = 'No entry in the Fallback Chain could translate this.';
    }
    for (const s of res.skipped ?? []) {
      const p = el('p', { className: res.failed ? 'err' : '' }, `${res.failed ? '' : 'Skipped '}${s.label}: ${s.reason}.`);
      if (s.pack) p.append(' ', link('Make this pair offline', `#pack=${s.pack}`));
      ft.append(p);
    }
    if (ft.childNodes.length) card.append(ft);
  }

  function link(text, hash) {
    const b = el('button', { className: 'link', textContent: text });
    b.addEventListener('click', () => send({ type: 'openOptions', hash }));
    return b;
  }

  function closeMenu() {
    const menu = card.querySelector('.menu');
    menu?.remove();
    card.querySelector('.hd [aria-haspopup=menu]')?.setAttribute('aria-expanded', 'false');
    return !!menu;
  }

  function toggleMenu(more, others) {
    if (closeMenu()) return;
    closePanel();
    const menu = el('div', { className: 'menu' }, el('div', { className: 'lbl', textContent: 'Translate with' }));
    menu.setAttribute('role', 'menu');
    for (const o of others) {
      const b = el('button', { textContent: o.label });
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => translateSelection(last, { entry: o.entry, keyboard: true }));
      menu.append(b);
    }
    card.querySelector('.hd').after(menu);
    more.setAttribute('aria-expanded', 'true');
    menu.querySelector('[role=menuitem]').focus();
    placeCard(last.box);
  }

  async function copyText(text, b) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = el('textarea', { value: text });
      root.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    b.innerHTML = ICONS.done;
    b.setAttribute('aria-label', 'Copied');
    setTimeout(() => { b.innerHTML = ICONS.copy; b.setAttribute('aria-label', 'Copy translation'); }, 1200);
  }

  // Listen starts from the top, then pauses and resumes. It checks speaking first:
  // after cancel() during a pause, Chrome keeps speechSynthesis.paused true.
  function listenButton(text, lang) {
    const set = (svg, label) => { b.innerHTML = svg; b.title = label; b.setAttribute('aria-label', label); };
    const b = button('ib', 'Listen', ICONS.listen, () => {
      if (!speechSynthesis.speaking) { speak(text, lang, () => set(ICONS.listen, 'Listen')); set(ICONS.pause, 'Pause'); }
      else if (speechSynthesis.paused) { speechSynthesis.resume(); set(ICONS.pause, 'Pause'); }
      else { speechSynthesis.pause(); set(ICONS.listen, 'Resume'); }
    });
    return b;
  }

  // Prefers a voice that runs on the device, so the text stays local when possible.
  function speak(text, lang, done) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase()));
    u.voice = voices.find(v => v.localService) ?? voices[0] ?? null;
    u.onend = u.onerror = done;
    speechSynthesis.speak(u);
  }

  const inHost = e => host && e.composedPath().includes(host);

  document.addEventListener('mousedown', e => { if (!inHost(e)) closeAll(); }, true);
  // Esc in the language panel closes only the panel (lang-panel.js handles it).
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && card && !card.hidden && !card.querySelector('.lp')) closeAll(); }, true);
  addEventListener('scroll', hideIcon, { passive: true, capture: true });

  document.addEventListener('mouseup', e => {
    if (e.button !== 0 || inHost(e)) return;
    setTimeout(() => {
      const sel = readSelection();
      if (!sel || !autoTrigger()) return;
      last = sel;
      if (settings.triggerMode === 'instant') translateSelection(sel);
      else placeIcon(sel);
    });
  });

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.type === 'host' && window === top) return reply({ host: location.hostname });
    if (msg.type !== 'translateSelection') return;
    const sel = readSelection();
    if (!sel) return; // Another frame may hold the Selection.
    translateSelection(sel, { keyboard: msg.keyboard });
    reply({ ok: true });
  });
})();
