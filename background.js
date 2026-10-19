import * as core from './core.js';

const OPENROUTER = 'https://openrouter.ai/api/v1';
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

async function getSettings() {
  return core.withDefaults(await chrome.storage.local.get(null), navigator.languages);
}

// ---- Providers ----

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
  if (!('LanguageDetector' in self)) return {};
  try {
    if (!detector) {
      downloading = await LanguageDetector.availability() !== 'available';
      detector = LanguageDetector.create();
      detector.then(() => { downloading = false; }, () => { detector = undefined; });
    }
    // The first create() in a profile downloads the model (about 12 s); translate without detection until it is there.
    if (downloading) return { downloading: true };
    const [top] = await (await detector).detect(text);
    return { lang: top?.detectedLanguage, confidence: top?.confidence ?? 0 };
  } catch {
    detector = undefined;
    return {};
  }
}

async function chromeState(pick) {
  if (!('Translator' in self)) return 'missing';
  if (!pick.sure) return 'unknown';
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
    return { text: await (await translators.get(pair)).translate(text), lang: pick.lang };
  } catch (e) {
    translators.delete(pair);
    throw e;
  }
}

async function openRouter(model, { text, pick, context, key }) {
  const messages = core.buildMessages({ text, pick, context });
  const send = reasoning => fetchJson(`${OPENROUTER}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-OpenRouter-Title': 'Select Translate' },
    body: JSON.stringify(core.openRouterBody(model, messages, text.length, reasoning)),
  }, Math.min(TIMEOUT_MS, 10_000 + text.length * 10)); // Free Models stall for 15–30 s at times; move on sooner on short text.
  let json;
  try {
    json = await send(true);
  } catch (e) {
    if (e.status !== 400) throw e;
    json = await send(false); // Some Models reject the reasoning parameter.
  }
  return { ...core.parseOpenRouter(json), lang: pick.lang };
}

const keyInfo = async key => (await fetchJson(`${OPENROUTER}/key`, { headers: { Authorization: `Bearer ${key}` } })).data;

async function callEntry(entry, ctx) {
  try {
    if (entry === 'chrome') return await chromeTranslate(ctx.text, ctx.pick);
    if (entry === 'microsoft') return await core.applySecondLanguage(microsoft, ctx.text, ctx.pick);
    if (entry === 'google') return await core.applySecondLanguage(google, ctx.text, ctx.pick);
    if (core.isModel(entry)) return await openRouter(core.modelOf(entry), ctx);
    throw new Error('Unknown entry');
  } catch (e) {
    if (e.status === 429) await startCooldown(entry, e.headers ?? {}, ctx.key);
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

// ---- Translation flow ----

// Opt-in debug log (options page → Debug): step timings in this worker's console. Never the text, the key or a Provider's error text.
async function timed(on, label, fn) {
  const start = performance.now();
  const ms = () => Math.round(performance.now() - start);
  try {
    const value = await fn();
    if (on) console.info(`[Select Translate] ${label}: ${ms()} ms`);
    return value;
  } catch (e) {
    if (on) console.info(`[Select Translate] ${label}: failed after ${ms()} ms (${core.debugReason(e.message, e.status)})`);
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
  const s = await getSettings();
  const res = await timed(s.debug, 'translation', () => translateWith(s, msg));
  if (s.debug) {
    const { text, skipped, ...rest } = res;
    console.info('[Select Translate] result', { chars: msg.text?.trim().length, ...rest, skipped: skipped?.map(x => `${x.label}: ${core.debugReason(x.reason, x.status)}`) });
  }
  return res;
}

async function translateWith(s, { text = '', block, start, end, entry }) {
  text = text.trim();
  const check = core.checkSelection(text);
  if (check === 'ignore') return { error: 'There is no text to translate.' };
  if (check === 'too-long') return { error: `The Selection is too long. The limit is ${core.MAX_CHARS.toLocaleString('en')} characters.` };

  const chain = s.chain.map(e => ({ entry: e, label: core.entryLabel(e) }));
  const det = await timed(s.debug, 'detect', () => detect(text));
  const pick = core.pickOutput({ detected: det.lang, confidence: det.confidence, target: s.target, second: s.second });
  if (s.debug) console.info('[Select Translate] detection', det, pick);
  const base = { target: s.target, chain };
  if (pick.already) return { ...base, already: true, from: pick.from };

  const cacheKey = `t:${pick.sure ? pick.lang : `${pick.lang}|${pick.second}`}:${text}`;
  if (!entry) {
    const hit = (await chrome.storage.session.get(cacheKey))[cacheKey];
    if (hit) return { ...base, ...hit, skipped: [], cached: true };
  }

  const now = Date.now();
  const { cooldowns } = await chrome.storage.local.get('cooldowns');
  const ctx = { text, pick, key: s.openrouterKey, context: block && core.wantsContext(text) ? core.contextSentence(block, start, end) : '' };
  const r = await core.walkChain(entry ? [entry] : s.chain, {
    skip: async e => core.skipReason(e, { now, cooldowns, hasKey: !!s.openrouterKey, sure: pick.sure, chrome: e === 'chrome' ? await chromeState(pick) : undefined }),
    call: e => timed(s.debug, e, () => callEntry(e, ctx)),
  });

  const skipped = r.skipped.map(x => ({
    label: core.entryLabel(x.entry),
    reason: x.reason,
    status: x.status,
    ...(x.reason === core.PACK_MISSING && { pack: `${pick.from}:${pick.lang}` }),
  }));
  if (r.failed) return { ...base, failed: true, skipped };
  if (r.already) return { ...base, already: true, from: r.detected, skipped };

  const result = { text: r.text, lang: r.lang, from: r.detected || pick.from || '', answeredBy: answeredBy(r.entry, r.model), entry: r.entry };
  if (!entry) await cacheSet(cacheKey, result);
  return { ...base, ...result, skipped };
}

async function models(all) {
  const list = (await fetchJson(`${OPENROUTER}/models${all ? '' : '?max_price=0'}`)).data;
  return core.textModels(list);
}

// Content scripts may only translate and open the options page. Key handling stays with extension pages.
const handlers = {
  translate,
  languages: async () => {
    const s = await getSettings();
    return { list: core.languageList(), pinned: [s.target, s.second] };
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
