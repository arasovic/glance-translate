// Listen in the Translation Card: reads a translation aloud. A classic content script that runs before
// content.js (manifest), which calls toggleListen() and stopListen().
const { toggleListen, stopListen } = (() => {
  // speechSynthesis is shared with the page, so its state is ours only while `ours` is set.
  let ours;
  const stopListen = () => { if (ours) { ours = null; speechSynthesis.cancel(); } };

  // Chrome lists its network voices first and the on-device ones about a second later,
  // so the first Listen on a page waits for them, at most 1.5 s.
  let localVoices;
  const waitForLocalVoices = () => localVoices ??= new Promise(resolve => {
    const done = () => { clearTimeout(timer); speechSynthesis.removeEventListener('voiceschanged', check); resolve(); };
    const check = () => { if (speechSynthesis.getVoices().some(v => v.localService)) done(); };
    const timer = setTimeout(done, 1500);
    speechSynthesis.addEventListener('voiceschanged', check);
    check();
  });

  // Prefers a voice that runs on the device, so the text stays local when possible.
  // A network voice is never set here (Chrome may still pick one for a language without a local voice).
  let lastSpeak = 0;
  async function speak(text, lang, button, done) {
    const id = ++lastSpeak;
    await waitForLocalVoices();
    // A newer Listen wins, and a closed or redrawn card has detached the button.
    if (id !== lastSpeak || !button.isConnected) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase()));
    u.voice = voices.find(v => v.localService) ?? null;
    // cancel() ends the previous utterance later, so only the current one clears `ours`.
    u.onend = u.onerror = () => { if (ours === u) ours = null; done(); };
    ours = u;
    speechSynthesis.speak(u);
  }

  // Listen starts from the top, then pauses and resumes. It checks `ours` before `paused`:
  // after cancel() during a pause, Chrome keeps speechSynthesis.paused true.
  // show(state) draws the button: 'playing', 'paused' or 'stopped'.
  function toggleListen(button, text, lang, show) {
    if (!ours) { speak(text, lang, button, () => show('stopped')); show('playing'); }
    else if (speechSynthesis.paused) { speechSynthesis.resume(); show('playing'); }
    else { speechSynthesis.pause(); show('paused'); }
  }

  return { toggleListen, stopListen };
})();
