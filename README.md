# Glance Translate

A Chromium extension (Manifest V3). Select text on a web page and read it in your language, right where it is. It works right after install, with no account and no key.

- It tries Chrome's built-in on-device translator first. When it answers, the text stays on your device.
- When it cannot answer, Microsoft and Google translation services answer instead.
- With your own OpenRouter key, the Translation Card can also explain a translation.

It has no server of its own, no telemetry and no analytics. [PRIVACY.md](PRIVACY.md) lists every piece of data it handles and where it goes.

## Install from source

1. Open `chrome://extensions` and turn on Developer mode.
2. Click "Load unpacked" and select this folder.

## Tests

```bash
node --test test/core.test.js
```

## License

The code is under the [MIT License](LICENSE). The icon artwork in `icons/` is not covered by the MIT License.
