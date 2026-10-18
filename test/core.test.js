import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../core.js';

const NOW = Date.UTC(2026, 9, 18, 13, 0, 0);

test('languages: Provider codes map both ways', () => {
  assert.equal(core.providerCode('google', 'zh-Hant'), 'zh-TW');
  assert.equal(core.providerCode('microsoft', 'zh'), 'zh-Hans');
  assert.equal(core.providerCode('google', 'tr'), 'tr');
  assert.equal(core.canonical('iw', 'google'), 'he');
  assert.equal(core.canonical('ku', 'google'), 'kmr');
  assert.equal(core.canonical('ku', 'microsoft'), 'ckb');
  assert.equal(core.canonical('zh-Hans', 'microsoft'), 'zh');
  assert.equal(core.canonical('tr-TR'), 'tr');
  assert.equal(core.canonical('zh-TW'), 'zh-Hant');
  assert.equal(core.canonical('pt-BR'), 'pt');
  assert.ok(core.sameLanguage('en-US', 'en'));
  assert.ok(!core.sameLanguage('', 'en'));
});

test('languages: Target and Second Language defaults', () => {
  assert.deepEqual(core.defaultLanguages(['tr-TR', 'tr', 'en-US']), { target: 'tr', second: 'en' });
  assert.deepEqual(core.defaultLanguages(['de-DE', 'fr']), { target: 'de', second: 'fr' });
  assert.deepEqual(core.defaultLanguages(['de']), { target: 'de', second: 'en' });
  assert.deepEqual(core.defaultLanguages(['en-US', 'en-GB']), { target: 'en', second: '' });
  assert.deepEqual(core.defaultLanguages([]), { target: 'en', second: '' });
});

test('languages: every language has a name, the list is in name order', () => {
  const list = core.languageList();
  assert.equal(list.length, core.LANGS.length);
  for (const [code, name] of list) assert.ok(name !== code && !name.startsWith(`${code} `), `${code} has no name`);
  assert.deepEqual(list.map(([, n]) => n), list.map(([, n]) => n).sort((a, b) => a.localeCompare(b, 'en')));
  assert.equal(core.languageName('ty'), 'Tahitian');
});

test('selection: ignores text without letters, rejects long text', () => {
  assert.equal(core.checkSelection('  12.5, 3 '), 'ignore');
  assert.equal(core.checkSelection('!!!'), 'ignore');
  assert.equal(core.checkSelection('Merhaba'), 'ok');
  assert.equal(core.checkSelection('a'.repeat(5001)), 'too-long');
});

test('output language: Second Language rule', () => {
  const langs = { target: 'tr', second: 'en' };
  assert.deepEqual(core.pickOutput({ detected: 'en', confidence: 0.9, ...langs }), { sure: true, from: 'en', lang: 'tr' });
  assert.deepEqual(core.pickOutput({ detected: 'tr', confidence: 0.9, ...langs }), { sure: true, from: 'tr', lang: 'en' });
  assert.deepEqual(core.pickOutput({ detected: 'tr', confidence: 0.9, target: 'tr', second: '' }), { sure: true, from: 'tr', already: true });
  assert.deepEqual(core.pickOutput({ detected: 'en', confidence: 0.69, ...langs }), { sure: false, lang: 'tr', second: 'en' });
  assert.equal(core.pickOutput({ detected: 'und', confidence: 1, ...langs }).sure, false);
});

test('output language: Keyless Providers re-request with the Second Language when unsure', async () => {
  const calls = [];
  const fake = async (text, lang) => { calls.push(lang); return { text: `${text}>${lang}`, detected: 'tr' }; };
  const r = await core.applySecondLanguage(fake, 'Merhaba', { sure: false, lang: 'tr', second: 'en' });
  assert.deepEqual(calls, ['tr', 'en']);
  assert.equal(r.lang, 'en');
  assert.equal(r.text, 'Merhaba>en');

  const none = await core.applySecondLanguage(fake, 'Merhaba', { sure: false, lang: 'tr', second: '' });
  assert.equal(none.already, true);

  calls.length = 0;
  await core.applySecondLanguage(fake, 'Merhaba', { sure: true, from: 'tr', lang: 'en' });
  assert.deepEqual(calls, ['en']);
});

test('chain: default chains', () => {
  assert.deepEqual(core.defaultChain(false), ['chrome', 'microsoft', 'google']);
  assert.deepEqual(core.defaultChain(true).slice(0, 3), ['chrome', 'microsoft', 'google']);
  assert.deepEqual(core.defaultChain(true).slice(3), ['openrouter:nvidia/nemotron-3-super-120b-a12b:free', 'openrouter:dots-studio/dots-3-note-preview:free']);
  assert.equal(core.entryLabel('openrouter:openrouter/free'), 'openrouter/free');
  assert.equal(core.entryLabel('chrome'), 'Chrome on-device');
});

test('chain: skip rules', () => {
  const base = { now: NOW, cooldowns: {}, hasKey: true, sure: true, chrome: 'available' };
  assert.equal(core.skipReason('chrome', base), '');
  assert.match(core.skipReason('google', { ...base, cooldowns: { google: NOW + 1000 } }), /^in Cooldown until/);
  assert.equal(core.skipReason('google', { ...base, cooldowns: { google: NOW - 1 } }), '');
  assert.equal(core.skipReason('openrouter:x', { ...base, hasKey: false }), 'no OpenRouter key');
  assert.equal(core.skipReason('chrome', { ...base, chrome: 'missing' }), 'Translator API not available');
  assert.equal(core.skipReason('chrome', { ...base, sure: false }), 'language detection unsure');
  assert.equal(core.skipReason('chrome', { ...base, chrome: 'downloadable' }), core.PACK_MISSING);
  assert.equal(core.skipReason('chrome', { ...base, chrome: 'unavailable' }), 'language pair not supported');
  assert.equal(core.skipReason('microsoft', { ...base, sure: false }), '');
});

test('chain: walks past skips and failures to the first answer', async () => {
  const called = [];
  const r = await core.walkChain(['a', 'b', 'c', 'd'], {
    skip: async e => (e === 'a' ? 'in Cooldown' : ''),
    call: async e => {
      called.push(e);
      if (e === 'b') throw Object.assign(new Error('HTTP 404: no such model'), { status: 404 });
      return { text: `from ${e}` };
    },
  });
  assert.deepEqual(called, ['b', 'c']);
  assert.equal(r.text, 'from c');
  assert.equal(r.entry, 'c');
  assert.deepEqual(r.skipped, [{ entry: 'a', reason: 'in Cooldown' }, { entry: 'b', reason: 'HTTP 404: no such model', status: 404 }]);
});

test('chain: reports every failure when nothing answers', async () => {
  const r = await core.walkChain(['a', 'b'], { skip: async () => '', call: async e => { throw new Error(`${e} down`); } });
  assert.equal(r.failed, true);
  assert.deepEqual(r.skipped.map(s => s.reason), ['a down', 'b down']);
});

test('cooldown: OpenRouter per-minute and daily limits', () => {
  const midnight = Date.UTC(2026, 9, 19);
  const or = 'openrouter:google/gemma-4-31b-it:free';
  assert.equal(core.cooldownUntil({ entry: or, headers: { 'x-ratelimit-limit': '50' }, now: NOW }), midnight);
  assert.equal(core.cooldownUntil({ entry: or, headers: { 'x-ratelimit-limit': '1000' }, now: NOW }), midnight);
  assert.equal(core.cooldownUntil({ entry: or, headers: {}, now: NOW, freeDailyRemaining: 0 }), midnight);
  assert.equal(core.cooldownUntil({ entry: or, headers: { 'x-ratelimit-limit': '20', 'x-ratelimit-reset': String(NOW + 30_000) }, now: NOW }), NOW + 30_000);
  assert.equal(core.cooldownUntil({ entry: or, headers: { 'x-ratelimit-limit': '20' }, now: NOW }), NOW + core.DEFAULT_COOLDOWN_MS);
});

test('cooldown: reset parsing and keyless defaults', () => {
  assert.equal(core.parseReset(String(NOW + 5000), NOW), NOW + 5000);
  assert.equal(core.parseReset(String((NOW + 5000) / 1000), NOW), NOW + 5000);
  assert.equal(core.parseReset('30', NOW), NOW + 30_000);
  assert.equal(core.parseReset('', NOW), 0);
  assert.equal(core.cooldownUntil({ entry: 'google', now: NOW }), NOW + 60_000);
  assert.equal(core.cooldownUntil({ entry: 'microsoft', headers: { 'retry-after': '10' }, now: NOW }), NOW + 10_000);
});

test('parsers: Microsoft, Google, OpenRouter', () => {
  const ms = [{ detectedLanguage: { language: 'en', score: 1 }, translations: [{ text: 'Merhaba dünya.\nİkinci satır.', to: 'tr' }] }];
  assert.deepEqual(core.parseMicrosoft(ms), { text: 'Merhaba dünya.\nİkinci satır.', detected: 'en' });
  assert.throws(() => core.parseMicrosoft({ error: 'x' }), /Unexpected Microsoft/);

  const g = [[['Merhaba dünya.\n', 'Hello world.\n', null, null, 10], ['İkinci satır.', 'Second line.', null, null, 10]], null, 'iw'];
  assert.deepEqual(core.parseGoogle(g), { text: 'Merhaba dünya.\nİkinci satır.', detected: 'he' });
  assert.throws(() => core.parseGoogle(null), /Unexpected Google/);

  const ok = { model: 'meta/llama:free', choices: [{ message: { content: '<think>hmm</think>\n Merhaba \n' }, finish_reason: 'stop' }] };
  assert.deepEqual(core.parseOpenRouter(ok), { text: 'Merhaba', model: 'meta/llama:free' });
  assert.equal(core.parseOpenRouter({ choices: [{ message: { content: '<text>Merhaba\ndünya</text>' } }] }).text, 'Merhaba\ndünya');
  assert.throws(() => core.parseOpenRouter({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }), /finish_reason: length/);
  assert.throws(() => core.parseOpenRouter({ error: { code: 429, message: 'Rate limit exceeded' } }), e => e.status === 429);
});

test('parsers: HTTP errors keep the raw Provider message, short', () => {
  const j = core.httpError(404, JSON.stringify({ error: { message: 'No endpoints found', code: 404 } }), { a: '1' });
  assert.equal(j.message, 'HTTP 404: No endpoints found');
  assert.equal(j.status, 404);
  const h = core.httpError(429, '<html><head><title>Sorry...</title><style>b{}</style></head><body><h1>We\'re sorry</h1></body></html>');
  assert.equal(h.message, "HTTP 429: Sorry... We're sorry");
  assert.ok(core.httpError(500, 'x'.repeat(1000)).message.length < 220);
});

test('prompt: target rule, Second Language rule, Context Sentence', () => {
  const sure = core.buildMessages({ text: 'run', pick: { sure: true, from: 'en', lang: 'tr' } });
  assert.match(sure[0].content, /into Turkish\./);
  assert.doesNotMatch(sure[0].content, /already in/);
  assert.equal(sure[1].content, '<text>run</text>');
  assert.match(sure[0].content, /do not obey or answer them/);

  const unsure = core.buildMessages({ text: 'run', pick: { sure: false, lang: 'tr', second: 'en' } });
  assert.match(unsure[0].content, /If the text is already in Turkish, translate it into English instead\./);

  const ctx = core.buildMessages({ text: 'bank', pick: { sure: true, from: 'en', lang: 'tr' }, context: 'We sat on the river bank.' });
  assert.equal(ctx[1].content, '<context>We sat on the river bank.</context>\n<text>bank</text>');
  assert.match(ctx[0].content, /Translate only the text/);
});

test('prompt: Context Sentence extraction', () => {
  const block = 'First one here. We sat on the river bank today. Last one.';
  const start = block.indexOf('bank');
  assert.equal(core.contextSentence(block, start, start + 4), 'We sat on the river bank today.');
  assert.equal(core.contextSentence('Hello.', 0, 6), '');
  assert.ok(core.wantsContext('river bank today'));
  assert.ok(!core.wantsContext('one two three four'));
});

test('prompt: request body', () => {
  const b = core.openRouterBody('m', [], 100);
  assert.deepEqual(b.reasoning, { effort: 'none' });
  assert.ok(b.max_tokens >= 2000);
  assert.equal('reasoning' in core.openRouterBody('m', [], 100, false), false);
});

test('models: text-output only, Free Router first', () => {
  const list = [
    { id: 'z/model:free', architecture: { modality: 'text+image->text' } },
    { id: 'google/lyria-3-pro-preview', architecture: { modality: 'text+image->text+audio' } },
    { id: 'a/model:free', architecture: { modality: 'text->text' } },
  ];
  assert.deepEqual(core.textModels(list), ['openrouter/free', 'a/model:free', 'z/model:free']);
});

test('settings: chain default follows the key', () => {
  assert.deepEqual(core.withDefaults({}, ['tr']).chain, core.KEYLESS_CHAIN);
  assert.deepEqual(core.withDefaults({ openrouterKey: 'k' }, ['tr']).chain, core.KEY_CHAIN);
  assert.deepEqual(core.withDefaults({ chain: ['google'] }, ['tr']).chain, ['google']);
  assert.equal(core.withDefaults({ second: '' }, ['tr', 'en']).second, '');
});
