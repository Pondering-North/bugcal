This is a bug-themed calendar made for personal use, created with Claude AI and powered by AI agents.

It features:
- Event creation through a manual system and/or a natural language event entry
- The ability to schedule recurrent reminders at a specific time
- The ability to adjust how long the event goes and when it ends 
- A conflict detection agent
- An Agent that verifies US holidays via web search.
- Voice command
- Filtering

---

**How to run locally**

(Requires Node.js 18+)

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (hot reload)
npm run dev
# → open http://localhost:5173

# 3. Build for production
npm run build
# → output in dist/

# 4. Preview the production build locally
npm run preview
```

---

## How to deploy (github)

```bash
npm run build

# If you have the gh-pages package:
npx gh-pages -d dist

# Or just push the dist/ folder to your repo's gh-pages branch manually.
```

Make sure `base: './'` stays in `vite.config.js` — this ensures assets load correctly from a subfolder.

### Loading on Netifly/Vercel

Connect your repo and set:
- **Build command:** `npm run build`
- **Publish directory:** `dist`

Both platforms auto-deploy on every push to `main`.

---

## Embed in website as a demo

### Step 1 — Build the embed bundle

```bash
npm run build:lib
# → outputs dist-embed/bugcal.embed.js  (single self-contained file, ~200kb)
```

### Step 2 — Host the file

Upload `dist-embed/bugcal.embed.js` to your server, CDN, or any static host.

### Step 3 — Add to any webpage

```html
<!-- Place this where you want the calendar to appear -->
<div id="bugcal-root"></div>

<!-- Load the embed bundle (adjust path as needed) -->
<script type="module" src="/assets/bugcal.embed.js"></script>
```

**Alternative mount target** (if `bugcal-root` conflicts with your existing IDs):

```html
<div data-bugcal></div>
<script type="module" src="/assets/bugcal.embed.js"></script>
```

### Iframe embed (zero-conflict option)

If wanting isolation from CSS:

```html
<iframe
  src="https://your-deployed-bugcal-url.com"
  width="100%"
  height="800px"
  style="border: none; border-radius: 12px;"
  title="BugCal"
></iframe>
```

---

## Environment & API key

BugCal calls the Anthropic API directly from the browser for:
1. Natural language event parsing
2. Conflict detection warnings
3. Holiday grounding (web search)

The API requests are proxied through Anthropic's infrastructure when running inside Claude.ai. **For standalone use**, you'll need to add your own Anthropic API key. Add a `.env` file:

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Then update the fetch calls in `src/BugCal.jsx` — find each `fetch("https://api.anthropic.com/v1/messages", {` and add the header:

```js
headers: {
  "Content-Type": "application/json",
  "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
},
```

> `.env` is already in `.gitignore`. For production, use a small backend proxy instead of exposing the key in the browser bundle.

---

## Project structure

```
bugcal/
├── index.html              # App shell
├── package.json
├── vite.config.js          # Standalone app build
├── vite.lib.config.js      # Embeddable bundle build
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx            # Standalone app entry
    ├── embed.jsx           # Self-mounting embed entry
    └── BugCal.jsx          # The full calendar component
```
# bugcal
