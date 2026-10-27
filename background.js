import * as core from './core.js';

const OPENROUTER = core.OPENROUTER;
const TIMEOUT_MS = 30_000;

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'translate', title: 'Translate selection', contexts: ['selection'] });
  });
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

// Pages without our content script (chrome://, Web Store, PDF viewer) fall back to the Toolbar Popup.
async function openPopup(text) {
  if (text) await chrome.storage.session.set({ pendingText: text });
  // A popup that failed to open must not translate this text when the user opens it later.
  chrome.action.openPopup().catch(() => chrome.storage.session.remove('pendingText'));
}

// sendMessage rejects only when the frame has no content script. A content script that declines
// (a Selection in input, textarea or contenteditable) gets no popup either.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'translateSelection' }, { frameId: info.frameId })
    .catch(() => openPopup(info.selectionText));
});

// The frame holding the Selection answers; when none does (the reply is undefined), the popup opens.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'translate-selection') return;
  chrome.tabs.sendMessage(tab.id, { type: 'translateSelection', keyboard: true }).then(answered => answered || openPopup(), () => openPopup());
});

const getSettings = () => core.readSettings(chrome.storage.local);

async function fetchJson(url, init = {}, timeout = TIMEOUT_MS) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? `No answer within ${timeout / 1000} s` : e.message);
  }
  const body = await res.text();
  if (!res.ok) throw core.httpError(res.status, body, Object.fromEntries(res.headers));
  try {
    return JSON.parse(body);
  } catch {
    throw core.httpError(res.status, body); // JSON.parse's own message quotes the body.
  }
}

const microsoft = async (text, lang) => core.parseMicrosoft(await fetchJson(
  `https://edge.microsoft.com/translate/translatetext?from=&to=${core.providerCode('microsoft', lang)}&isEnterpriseClient=false`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([text]) },
));

const google = async (text, lang) => core.parseGoogle(await fetchJson(
  `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${core.providerCode('google', lang)}&dt=t`,
  { method: 'POST', body: new URLSearchParams({ q: text }) },
));

let detector, downloading = false;
async function detect(text) {
  if (!('LanguageDetector' in self)) return { detectorState: 'unavailable' };
  try {
    if (!detector) {
      const availability = await LanguageDetector.availability();
      if (availability === 'unavailable') return { detectorState: 'unavailable' };
      downloading = availability !== 'available';
      detector = LanguageDetector.create();
      // A rejected create() stays in `detector`: the next call reports 'failed', and the one after it retries.
      detector.catch(() => {}).then(() => { downloading = false; });
    }
    // The first create() in a profile downloads the model (about 12 s); translate without detection until it is there.
    if (downloading) return { detectorState: 'downloading' };
    const [top] = await (await detector).detect(text);
    return { lang: top?.detectedLanguage, confidence: top?.confidence ?? 0 };
  } catch {
    detector = undefined;
    return { detectorState: 'failed' };
  }
}

async function chromeState(pick) {
  if (!('Translator' in self)) return 'missing';
  if (!pick.confident) return 'unknown';
  try {
    return await Translator.availability({ sourceLanguage: pick.from, targetLanguage: pick.lang });
  } catch {
    return 'unavailable';
  }
}

const translators = new Map();
async function chromeTranslate(text, pick) {
  const pair = `${pick.from}>${pick.lang}`;
  if (!translators.has(pair)) {
    translators.set(pair, Translator.create({ sourceLanguage: pick.from, targetLanguage: pick.lang }));
  }
  try {
    const translator = await translators.get(pair);
    return { text: await core.translateLines(line => translator.translate(line), text), lang: pick.lang };
  } catch (e) {
    translators.delete(pair);
    throw e;
  }
}

const keyInfo = async key => (await fetchJson(`${OPENROUTER}/key`, { headers: { Authorization: `Bearer ${key}` } })).data;

async function callEntry(entry, { text, pick }) {
  try {
    if (entry === 'chrome') return await chromeTranslate(text, pick);
    if (entry === 'microsoft') return await core.applySecondLanguage(microsoft, text, pick);
    if (entry === 'google') return await core.applySecondLanguage(google, text, pick);
    throw new Error('Unknown entry');
  } catch (e) {
    if (e.status === 429) await startCooldown(entry, e.headers ?? {});
    throw e;
  }
}

// The header-based Cooldown is saved at once so the chain moves on; the daily-limit lookup refines it afterwards.
async function startCooldown(entry, headers, key) {
  const now = Date.now();
  await saveCooldown(entry, core.cooldownUntil({ entry, headers, now }));
  if (core.isModel(entry) && ![20, 50, 1000].includes(Number(headers['x-ratelimit-limit']))) {
    keyInfo(key).then(k => k?.free_model_daily_requests?.remaining === 0 && saveCooldown(entry, core.nextUtcMidnight(now)), () => {});
  }
}

async function saveCooldown(entry, until) {
  const now = Date.now();
  const { cooldowns = {} } = await chrome.storage.local.get('cooldowns');
  const live = Object.fromEntries(Object.entries(cooldowns).filter(([, t]) => t > now));
  await chrome.storage.local.set({ cooldowns: { ...live, [entry]: until } });
}

// Opt-in debug log (options page → Debug): step timings in this worker's console. Never the text, the key or a Provider's error text.
async function timed(on, label, fn) {
  const start = performance.now();
  const ms = () => Math.round(performance.now() - start);
  try {
    const value = await fn();
    if (on) console.info(`[Glance Translate] ${label}: ${ms()} ms`);
    return value;
  } catch (e) {
    if (on) console.info(`[Glance Translate] ${label}: failed after ${ms()} ms (${core.debugReason(e.message, e.status)})`);
    throw e;
  }
}

async function cacheSet(key, value) {
  try {
    await chrome.storage.session.set({ [key]: value });
  } catch {
    await chrome.storage.session.clear(); // Quota reached: start over.
  }
}

function answeredBy(entry, model) {
  return entry === core.OR_PREFIX + core.FREE_ROUTER && model ? `${model} (Free Router)` : core.entryLabel(entry);
}

async function translate(msg) {
  const settings = await getSettings();
  const res = core.describeResult(await timed(settings.debug, 'translation', () => translateWith(settings, msg)));
  if (settings.debug) {
    const { text, skipped, ...rest } = res;
    console.info('[Glance Translate] result', { chars: msg.text?.trim().length, ...rest, skipped: skipped?.map(x => `${x.label}: ${core.debugReason(x.reason, x.status)}`) });
  }
  return res;
}

async function translateWith(settings, { text = '', entry }) {
  text = text.trim();
  const check = core.checkSelection(text);
  if (check === 'ignore') return { error: 'There is no text to translate.' };
  if (check === 'too-long') return { error: `The Selection is too long. The limit is ${core.MAX_CHARS.toLocaleString('en')} characters.` };

  const chain = settings.chain.map(e => ({ entry: e, label: core.entryLabel(e) }));
  const detection = await timed(settings.debug, 'detect', () => detect(text));
  const pick = core.pickOutput({ detected: detection.lang, confidence: detection.confidence, target: settings.target, second: settings.second });
  if (settings.debug) console.info('[Glance Translate] detection', detection, pick);
  const base = { target: settings.target, chain };
  if (pick.already) return { ...base, already: true, from: pick.from };

  const cacheKey = `t:${pick.confident ? pick.lang : `${pick.lang}|${pick.second}`}:${text}`;
  if (!entry) {
    const hit = (await chrome.storage.session.get(cacheKey))[cacheKey];
    if (hit) return { ...base, ...hit, skipped: [], cached: true };
  }

  const now = Date.now();
  const { cooldowns } = await chrome.storage.local.get('cooldowns');
  const outcome = await core.walkChain(entry ? [entry] : settings.chain, {
    skip: async e => core.skipReason(e, { now, cooldowns, confident: pick.confident, detectorState: detection.detectorState, chrome: e === 'chrome' ? await chromeState(pick) : undefined }),
    call: e => timed(settings.debug, e, () => callEntry(e, { text, pick })),
  });

  const skipped = outcome.skipped.map(x => ({
    label: core.entryLabel(x.entry),
    reason: x.reason,
    status: x.status,
    ...(x.reason === core.PACK_MISSING && { pack: `${pick.from}:${pick.lang}` }),
  }));
  if (outcome.failed) return { ...base, failed: true, skipped };
  if (outcome.already) return { ...base, already: true, from: outcome.detected, skipped };

  const result = { text: outcome.text, lang: outcome.lang, from: outcome.detected || pick.from || '', answeredBy: core.entryLabel(outcome.entry), entry: outcome.entry };
  if (!entry) await cacheSet(cacheKey, result);
  return { ...base, ...result, skipped };
}

// Explain's text arrives in parts: { text } with the explanation so far, then { done }, { failed } or { needsKey }.
// Only the background holds the key; the content script learns only that there is none.
async function explain({ text = '', block, start, end, translation = '' }, signal, post) {
  const settings = await getSettings();
  const key = settings.openrouterKey;
  if (!key) return post({ needsKey: true });
  text = text.trim();
  if (core.checkSelection(text) !== 'ok') return post({ failed: true, skipped: ['There is no text to explain.'] });
  const context = block && core.wantsContext(text) ? core.contextSentence(block, start, end) : '';
  const messages = core.explainMessages({ text, translation, context, target: settings.target });
  const now = Date.now();
  const { cooldowns } = await chrome.storage.local.get('cooldowns');
  let shown = '';
  const show = part => part !== shown && post({ text: shown = part });
  // A Model that fails, even after some text, hands over to the next one, which starts the text again.
  const outcome = await core.walkChain(settings.explainModels, {
    skip: async e => (signal.aborted ? 'cancelled' : core.skipReason(e, { now, cooldowns })),
    call: async e => {
      show('');
      try {
        return await timed(settings.debug, `explain ${core.modelOf(e)}`, () => core.streamExplanation(core.modelOf(e), messages, key, signal, show));
      } catch (err) {
        if (err.status === 429) await startCooldown(e, err.headers ?? {}, key);
        throw err;
      }
    },
  });
  if (outcome.failed) return post({ failed: true, skipped: outcome.skipped.map(s => `${core.entryLabel(s.entry)}: ${s.reason}.`) });
  post({ done: true, text: outcome.text, answeredBy: answeredBy(outcome.entry, outcome.model) });
}

// Closing the Translation Card disconnects the port, which cancels the request.
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'explain' || !port.sender?.tab) return;
  const cancel = new AbortController();
  port.onDisconnect.addListener(() => cancel.abort());
  const post = msg => { if (!cancel.signal.aborted) port.postMessage(msg); };
  port.onMessage.addListener(msg => explain(msg, cancel.signal, post).catch(e => post({ failed: true, skipped: [e.message] })));
});

async function models(all) {
  const list = (await fetchJson(`${OPENROUTER}/models${all ? '' : '?max_price=0'}`)).data;
  return core.textModels(list);
}

// Content scripts may only translate, explain and open the options page. Key handling stays with extension pages.
const handlers = {
  translate,
  languages: async () => {
    const settings = await getSettings();
    return { list: core.languageList(), pinned: [settings.target, settings.second] };
  },
  openOptions: ({ hash = '' }) => chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${hash}`) }).then(() => ({})),
};
const extensionHandlers = {
  testKey: ({ key }) => keyInfo(key),
  models: ({ all }) => models(all),
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const fromExtension = sender.url?.startsWith(chrome.runtime.getURL(''));
  const handler = handlers[msg?.type] ?? (fromExtension && extensionHandlers[msg?.type]);
  if (!handler) return false;
  Promise.resolve(handler(msg)).then(reply, e => reply({ error: e.message }));
  return true;
});
