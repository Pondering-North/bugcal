import express from 'express'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 8080   // Cloud Run injects PORT

app.use(express.json({ limit: '2mb' }))

// ── CORS — allow portfolio to call this server ─────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://programportfolio.vercel.app');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Anthropic API proxy ────────────────────────────────────────────────────
// The frontend calls /api/messages instead of api.anthropic.com directly.
// This keeps ANTHROPIC_API_KEY server-side and out of the browser bundle.
app.post('/api/messages', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify(req.body),
    })

    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (err) {
    console.error('Anthropic proxy error:', err)
    res.status(502).json({ error: 'Failed to reach Anthropic API' })
  }
})

// ── Health check (Cloud Run uses this) ────────────────────────────────────
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }))

// ── Serve the Vite build ───────────────────────────────────────────────────
const distPath = join(__dirname, 'dist')
app.use(express.static(distPath))

// SPA fallback — all non-API routes return index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' })
  res.sendFile(join(distPath, 'index.html'))
})

createServer(app).listen(PORT, () => {
  console.log(`🪲 BugCal server running on port ${PORT}`)
})
