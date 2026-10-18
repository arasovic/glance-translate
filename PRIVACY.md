# Privacy policy

Select Translate translates text you select on a web page. It has no server of its own, no telemetry and no analytics. This page lists every piece of data the extension handles and where it goes.

## What leaves your browser

Only the Selection leaves the browser, and only when a Fallback Chain entry that runs off-device translates it. AI Models also get the Context Sentence. The page URL, the page title and cookies are never sent.

| When | What is sent | Sent to |
|---|---|---|
| Chrome on-device answers | Nothing. The Selection stays on your device. | Chrome's built-in Translator and Language Detector |
| Microsoft answers | The Selection and the output language | `edge.microsoft.com` (Microsoft) |
| Google answers | The Selection and the output language | `translate.googleapis.com` (Google) |
| An OpenRouter Model answers | The Selection, the output language, the Context Sentence for Selections of 1–3 words, and your OpenRouter API key | `openrouter.ai` (OpenRouter), which passes the request to the Model's provider |
| You click "Test key", or a Model reports a rate limit | Your OpenRouter API key | `openrouter.ai/api/v1/key` |
| The options page lists Models | Nothing about you; no key | `openrouter.ai/api/v1/models` |
| You click an Offline Pack download button | The language pair | Chrome downloads the pack from Google |
| You click Listen | The translation | Your browser's speech voices. Some browsers offer voices that run on a network service; the extension prefers voices that run on the device. |

The entries are tried in the order of your Fallback Chain, and the first one that answers stops the walk. With the default chain, Chrome on-device is tried first; Microsoft and Google get the Selection only when Chrome cannot translate it. With a key, AI Models get it only when all three fail, or when you pick a Model in the Translation Card.

Microsoft, Google, OpenRouter and the Model providers handle the text under their own privacy policies. Some Free Models on OpenRouter are offered by providers that may log or train on requests. Check OpenRouter's privacy settings for your account if this matters to you.

## What is stored on your device

| Data | Where | How long |
|---|---|---|
| Settings: Target and Second Language, Trigger Mode, Fallback Chain, Disabled Sites (host names), on/off switch, debug log switch | `chrome.storage.local` | Until you change them or remove the extension |
| OpenRouter API key | `chrome.storage.local`, never `chrome.storage.sync` | Until you delete it or remove the extension |
| Cooldown end times per Fallback Chain entry | `chrome.storage.local` | Until they expire |
| Translation cache: the Selection and its translation | `chrome.storage.session` | Until the browser closes |

The API key is never logged and never reaches web pages: only the extension's background service worker uses it. Nothing is synced across devices.

The debug log is off by default. When you turn it on in the options page, the service worker's console on your device shows how long each translation step took, the detected language and which entry answered. It never holds the Selection, the translation or the key, and it is not sent anywhere.

## Contact

Open an issue in the project's repository.
