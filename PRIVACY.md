# Privacy policy

Glance Translate translates text you select on a web page, and explains it when you add your own OpenRouter key. It has no server of its own, no telemetry and no analytics. This page lists every piece of data the extension handles and where it goes.

## What leaves your browser

Only the text to translate leaves the browser: the Selection, or text you type in the Toolbar Popup. It leaves only when a Fallback Chain entry that runs off-device translates it. Text typed in the Toolbar Popup goes to the same Providers, in the same order, as a Selection. When you click Explain in the Translation Card, OpenRouter also gets the Selection, its translation and, for 1–3 words, the Context Sentence. The page URL, the page title and cookies are never sent.

All text to translate first goes to Chrome's Language Detector, which runs on your device.

| When | What is sent | Sent to |
|---|---|---|
| Chrome on-device answers | Nothing. The Selection stays on your device. | Chrome's built-in Translator and Language Detector |
| Microsoft answers | The Selection and the output language | `edge.microsoft.com` (Microsoft) |
| Google answers | The Selection and the output language | `translate.googleapis.com` (Google) |
| You click Explain in the Translation Card | The Selection, its translation, the Target Language, the Context Sentence for Selections of 1–3 words, and your OpenRouter API key | `openrouter.ai` (OpenRouter), which passes the request to the Model's provider |
| You click "Test key", or an Explain Model reports a rate limit | Your OpenRouter API key | `openrouter.ai/api/v1/key` |
| You start to add an Explain Model on the options page | Nothing about you; no key | `openrouter.ai/api/v1/models` |
| You click an Offline Pack download button | The language pair | Chrome downloads the pack from Google |
| The first translation, if Chrome does not have its Language Detector model yet | Nothing from the page. Chrome downloads the model without a click. | Chrome downloads the model from Google |
| You click Listen | The translation | Your browser's speech voices. Some browsers offer voices that run on a network service; the extension prefers voices that run on the device. |

The entries are tried in the order of your Fallback Chain, and the first one that answers stops the walk. With the default chain, Chrome on-device is tried first; Microsoft and Google get the Selection only when Chrome cannot translate it. OpenRouter never translates. It gets text only when you click Explain, and only with your key.

Microsoft, Google, OpenRouter and the Model providers handle the text under their own privacy policies. Some Free Models on OpenRouter are offered by providers that may log or train on requests. Check OpenRouter's privacy settings for your account if this matters to you.

## What is stored on your device

| Data | Where | How long |
|---|---|---|
| Settings: Target and Second Language, Trigger Mode, Fallback Chain, Explain Models, Disabled Sites (host names), on/off switch, debug log switch | `chrome.storage.local` | Until you change them or remove the extension |
| OpenRouter API key | `chrome.storage.local`, never `chrome.storage.sync` | Until you delete it or remove the extension |
| Cooldown end times per Fallback Chain entry and Explain Model | `chrome.storage.local` | Until they expire |
| Translation cache: the Selection or the text typed in the Toolbar Popup, and its translation | `chrome.storage.session` | Until the browser closes |
| Text for the Toolbar Popup: the Selection, when you use the context menu on a page where the extension's content script cannot run, such as Chrome's PDF viewer | `chrome.storage.session` | Until the Toolbar Popup reads it. If the popup fails to open, it is deleted at once. |

The API key is never logged and never reaches web pages: only the extension's background service worker uses it. Nothing is synced across devices.

The debug log is off by default. When you turn it on in the options page, the service worker's console on your device shows how long each translation step and each Explain request took, the detected language and which entry or Model answered. It never holds the Selection, the translation, the Explanation or the key, and it is not sent anywhere. A Provider error shows only as its HTTP status code, because the error message can quote the text.

## Contact

Open an issue in the project's repository.
