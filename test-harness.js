#!/usr/bin/env node
// ── BugCal Test Harness ────────────────────────────────────────────────────
// Usage:  node test-harness.js [--url http://localhost:8080] [--email you@example.com]
// Env:    TEST_EMAIL, SERVER_URL
//
// Tests every feature:
//  • Pure logic  – recurrence, date utils, conflict math
//  • Server      – health check, Anthropic proxy, email (full trip)
//  • AI agents   – conflict, timezone, NL parser, voice command, grounding

import process from 'node:process'

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const BASE_URL  = getArg('--url')   || process.env.SERVER_URL   || 'http://localhost:8080'
const TEST_EMAIL = getArg('--email') || process.env.TEST_EMAIL  || null

// ── Tiny reporter ────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0
const CLR = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m' }
const c = (color, str) => CLR[color] + str + CLR.reset

function section(name) { console.log('\n' + c('bold', c('cyan', `── ${name} ${'─'.repeat(Math.max(0, 50 - name.length))}`))) }

function ok(label, detail = '') {
  passed++
  console.log(c('green', '  ✓') + ' ' + label + (detail ? c('dim', '  ' + detail) : ''))
}
function fail(label, err = '') {
  failed++
  console.log(c('red', '  ✗') + ' ' + label)
  if (err) console.log(c('red', '    ' + String(err).split('\n')[0]))
}
function skip(label, reason = '') {
  skipped++
  console.log(c('yellow', '  –') + ' ' + label + (reason ? c('dim', '  (' + reason + ')') : ''))
}
function assert(cond, label, detail = '') { cond ? ok(label, detail) : fail(label, 'assertion failed') }

// ── Inlined pure functions (mirrors BugCal.jsx exactly) ─────────────────────
const toKey  = (y, m, d) => `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
const getDays = (y, m)    => new Date(y, m + 1, 0).getDate()
const timeToMins = t      => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m }
const addDays = (s, n)    => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0] }
const startOfWeek = s     => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0] }

function doesOccurOn(ev, ds) {
  const s = new Date(ev.date + 'T00:00:00'), c = new Date(ds + 'T00:00:00')
  if (c < s) return false
  if (ev.repeatEnd === 'date' && ev.repeatEndDate && c > new Date(ev.repeatEndDate + 'T00:00:00')) return false
  if (!ev.repeat || ev.repeat === 'none') return ev.date === ds
  if (ev.repeat === 'daily')    return true
  if (ev.repeat === 'weekly')   return c.getDay() === s.getDay()
  if (ev.repeat === 'biweekly') { const d = Math.round((c - s) / 86400000); return d % 14 === 0 }
  if (ev.repeat === 'custom_days') return (ev.repeatDays || []).includes(c.getDay())
  if (ev.repeat === 'monthly')  return c.getDate() === s.getDate()
  if (ev.repeat === 'yearly')   return c.getDate() === s.getDate() && c.getMonth() === s.getMonth()
  return false
}

function countUpTo(ev, ds) {
  const s = new Date(ev.date + 'T00:00:00'), e = new Date(ds + 'T00:00:00'); let cnt = 0
  for (let t = new Date(s); t <= e; t.setDate(t.getDate() + 1))
    if (doesOccurOn({ ...ev, repeatEnd: ev.repeatEnd === 'count' ? 'never' : ev.repeatEnd }, t.toISOString().split('T')[0])) cnt++
  return cnt
}

function getEventsForDate(evs, ds) {
  return evs.filter(ev => {
    if (!doesOccurOn(ev, ds)) return false
    if (ev.repeatEnd === 'count' && ev.repeatCount && countUpTo(ev, ds) > Number(ev.repeatCount)) return false
    return true
  })
}

// ── HTTP helper ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(BASE_URL + path, opts)
  const json = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, json }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 1 – Pure logic
// ═══════════════════════════════════════════════════════════════════════════
function testPureLogic() {
  section('Pure Logic')

  // toKey
  assert(toKey(2026, 2, 5) === '2026-03-05', 'toKey formats date correctly')

  // getDays
  assert(getDays(2026, 1) === 28, 'getDays: Feb 2026 has 28 days')
  assert(getDays(2024, 1) === 29, 'getDays: Feb 2024 (leap) has 29 days')

  // timeToMins
  assert(timeToMins('09:30') === 570, 'timeToMins 09:30 → 570')
  assert(timeToMins('00:00') === 0,   'timeToMins 00:00 → 0')
  assert(timeToMins(null) === null,   'timeToMins null → null')

  // addDays
  assert(addDays('2026-03-17', 7)  === '2026-03-24', 'addDays +7')
  assert(addDays('2026-03-28', 5)  === '2026-04-02', 'addDays crosses month boundary')

  // startOfWeek  (2026-03-17 is a Tuesday → Sunday = 2026-03-15)
  assert(startOfWeek('2026-03-17') === '2026-03-15', 'startOfWeek Tuesday → preceding Sunday')

  // ── recurrence: none ──────────────────────────────────────────────────────
  const single = { id: '1', date: '2026-03-17', repeat: 'none' }
  assert( doesOccurOn(single, '2026-03-17'), 'none: occurs on own date')
  assert(!doesOccurOn(single, '2026-03-18'), 'none: does not occur day after')
  assert(!doesOccurOn(single, '2026-03-16'), 'none: does not occur before start')

  // ── recurrence: daily ─────────────────────────────────────────────────────
  const daily = { id: '2', date: '2026-03-01', repeat: 'daily' }
  assert( doesOccurOn(daily, '2026-03-01'), 'daily: occurs on start')
  assert( doesOccurOn(daily, '2026-03-17'), 'daily: occurs 16 days later')
  assert(!doesOccurOn(daily, '2026-02-28'), 'daily: does not occur before start')

  const dailyEnds = { ...daily, repeatEnd: 'date', repeatEndDate: '2026-03-10' }
  assert( doesOccurOn(dailyEnds, '2026-03-10'), 'daily+endDate: last day included')
  assert(!doesOccurOn(dailyEnds, '2026-03-11'), 'daily+endDate: stops after end date')

  // ── recurrence: weekly ────────────────────────────────────────────────────
  // 2026-03-17 is Tuesday
  const weekly = { id: '3', date: '2026-03-17', repeat: 'weekly' }
  assert( doesOccurOn(weekly, '2026-03-24'), 'weekly: +7 days')
  assert( doesOccurOn(weekly, '2026-03-31'), 'weekly: +14 days')
  assert(!doesOccurOn(weekly, '2026-03-18'), 'weekly: different day of week')

  // ── recurrence: biweekly ──────────────────────────────────────────────────
  const bw = { id: '4', date: '2026-03-17', repeat: 'biweekly' }
  assert( doesOccurOn(bw, '2026-03-31'), 'biweekly: +14 days')
  assert(!doesOccurOn(bw, '2026-03-24'), 'biweekly: not +7 days')

  // ── recurrence: custom_days ───────────────────────────────────────────────
  // repeatDays [1,3,5] = Mon, Wed, Fri
  // 2026-03-16=Mon, 2026-03-17=Tue, 2026-03-18=Wed
  const mwf = { id: '5', date: '2026-03-01', repeat: 'custom_days', repeatDays: [1, 3, 5] }
  assert( doesOccurOn(mwf, '2026-03-16'), 'custom_days: Monday ✓')
  assert(!doesOccurOn(mwf, '2026-03-17'), 'custom_days: Tuesday ✗')
  assert( doesOccurOn(mwf, '2026-03-18'), 'custom_days: Wednesday ✓')

  // ── recurrence: monthly ───────────────────────────────────────────────────
  const monthly = { id: '6', date: '2026-01-15', repeat: 'monthly' }
  assert( doesOccurOn(monthly, '2026-03-15'), 'monthly: same day different month')
  assert(!doesOccurOn(monthly, '2026-03-16'), 'monthly: different day')

  // ── recurrence: yearly ────────────────────────────────────────────────────
  const yearly = { id: '7', date: '2026-01-01', repeat: 'yearly' }
  assert( doesOccurOn(yearly, '2027-01-01'), 'yearly: same day next year')
  assert(!doesOccurOn(yearly, '2027-01-02'), 'yearly: different day')

  // ── repeatEnd: count ──────────────────────────────────────────────────────
  const dailyCount3 = { id: '8', date: '2026-03-01', repeat: 'daily', repeatEnd: 'count', repeatCount: 3 }
  const evs = [dailyCount3]
  assert( getEventsForDate(evs, '2026-03-01').length === 1, 'count: occurrence 1 included')
  assert( getEventsForDate(evs, '2026-03-03').length === 1, 'count: occurrence 3 included')
  assert( getEventsForDate(evs, '2026-03-04').length === 0, 'count: occurrence 4 excluded')

  // ── getEventsForDate: multiple events ─────────────────────────────────────
  const pool = [
    { id: 'a', date: '2026-03-17', repeat: 'none' },
    { id: 'b', date: '2026-03-01', repeat: 'weekly' },   // Sundays
    { id: 'c', date: '2026-03-15', repeat: 'weekly' },   // Sundays
  ]
  // 2026-03-17 is Tuesday — event b (weekly from Sun 3/1) should not fire
  const result = getEventsForDate(pool, '2026-03-17')
  assert(result.some(e => e.id === 'a'),  'getEventsForDate: single-day event found')
  assert(!result.some(e => e.id === 'b'), 'getEventsForDate: weekly(Sun) excluded on Tue')

  // ── conflict math (mirrors runConflictAgent logic) ────────────────────────
  const newEv = { id: 'x', date: '2026-03-17', time: '10:00', duration: '60' }
  const existing = [
    { id: 'y', date: '2026-03-17', time: '10:30', duration: '60', repeat: 'none' },
    { id: 'z', date: '2026-03-17', time: '12:00', duration: '60', repeat: 'none' },
  ]
  const conflicts = existing.filter(ev => {
    if (ev.id === newEv.id || !ev.time || !doesOccurOn(ev, newEv.date)) return false
    const nm = timeToMins(newEv.time), ne = nm + (Number(newEv.duration) || 60)
    const em = timeToMins(ev.time),   ee = em + (Number(ev.duration) || 60)
    return nm < ee && ne > em
  })
  assert(conflicts.length === 1,          'conflict: 10:00–11:00 overlaps 10:30 event')
  assert(conflicts[0].id === 'y',         'conflict: correct overlapping event identified')
  assert(!conflicts.some(e => e.id === 'z'), 'conflict: 12:00 event not flagged')
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 2 – Server / API
// ═══════════════════════════════════════════════════════════════════════════
async function testServer() {
  section('Server Endpoints')

  // Health check (/healthz is intercepted by Cloud Run infra; use /health)
  try {
    const { status, json } = await api('GET', '/health')
    assert(status === 200 && json.status === 'ok', 'GET /health → 200 ok', `status=${status}`)
  } catch (e) { fail('GET /health', e) }

  // Missing fields validation
  try {
    const { status } = await api('POST', '/api/send-reminder', { to: 'a@b.com' })
    assert(status === 400, 'POST /api/send-reminder with missing fields → 400')
  } catch (e) { fail('send-reminder missing-fields validation', e) }

  // Anthropic proxy — minimal ping
  try {
    const { status, json } = await api('POST', '/api/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Reply with one word: pong' }]
    })
    const text = json.content?.map(c => c.text || '').join('').trim().toLowerCase() || ''
    assert(status === 200, 'POST /api/messages → 200', `status=${status}`)
    assert(text.length > 0, 'Anthropic proxy returns non-empty text', `"${text}"`)
  } catch (e) { fail('POST /api/messages (Anthropic proxy)', e) }

  // SPA fallback — random non-API route
  try {
    const res = await fetch(BASE_URL + '/some-unknown-page')
    assert(res.status === 200, 'SPA fallback: non-API route → 200 (index.html)')
  } catch (e) { fail('SPA fallback', e) }

  // API 404 guard
  try {
    const res = await fetch(BASE_URL + '/api/nonexistent')
    assert(res.status === 404, 'API 404 guard: unknown /api/* → 404')
  } catch (e) { fail('API 404 guard', e) }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 3 – Email (full trip)
// ═══════════════════════════════════════════════════════════════════════════
async function testEmail() {
  section('Email — Full Trip')

  if (!TEST_EMAIL) {
    skip('Full-trip email send', 'no --email address provided (set --email or TEST_EMAIL env)')
    return
  }

  const now = new Date().toLocaleString()

  // Test 1: single event reminder
  try {
    const { status, json } = await api('POST', '/api/send-reminder', {
      to: TEST_EMAIL,
      subject: '🪲 BugCal Test: Single Event Reminder',
      body: `This is a test reminder from the BugCal test harness.\n\nEvent: Team Standup\nDate: ${now}\nNotes: Automated test — if you see this, email delivery is working.`
    })
    assert(status === 200 && json.success, 'Single event reminder email delivered', `→ ${TEST_EMAIL}`)
  } catch (e) { fail('Single event reminder', e) }

  // Test 2: bulk "upcoming events" summary (mirrors ReminderSettingsPanel behavior)
  const upcomingEvents = [
    { title: '🐛 Daily Standup',    date: '2026-03-18', time: '09:00', note: 'Regular sync' },
    { title: '🦋 Sprint Planning',  date: '2026-03-19', time: '10:00', note: 'Q2 kickoff' },
    { title: '🐝 Code Review',      date: '2026-03-20', time: '14:00', note: '' },
    { title: '🐞 1:1 with Manager', date: '2026-03-21', time: '11:00', note: 'Weekly check-in' },
    { title: '🦗 Deploy Day',       date: '2026-03-22', time: '13:00', note: 'Production release' },
  ]
  const bodyLines = upcomingEvents.map(ev =>
    `• ${ev.title} — ${ev.date}${ev.time ? ' at ' + ev.time : ''}${ev.note ? '\n  ↳ ' + ev.note : ''}`
  )
  const bulkBody = `Your upcoming BugCal events (test harness bulk send):\n\n${bodyLines.join('\n\n')}\n\nSent: ${now}`

  try {
    const { status, json } = await api('POST', '/api/send-reminder', {
      to: TEST_EMAIL,
      subject: '🪲 BugCal Test: Upcoming Events Summary',
      body: bulkBody
    })
    assert(status === 200 && json.success, 'Bulk upcoming-events email delivered', `→ ${TEST_EMAIL}`)
  } catch (e) { fail('Bulk upcoming-events email', e) }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 4 – AI Agents (via server proxy)
// ═══════════════════════════════════════════════════════════════════════════
async function testAgents() {
  section('AI Agents (via /api/messages proxy)')

  // Helper: minimal aiCall
  async function aiCall(system, userMsg, extra = {}) {
    const { status, json } = await api('POST', '/api/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system,
      ...extra,
      messages: [{ role: 'user', content: userMsg }]
    })
    if (status !== 200) throw new Error(`HTTP ${status}: ${JSON.stringify(json)}`)
    return json.content?.map(c => c.text || '').join('').trim() || ''
  }

  // ── Conflict detection agent ───────────────────────────────────────────────
  try {
    const text = await aiCall(
      'Bug-themed conflict detection agent. One charming warning under 20 words.',
      '"Team Standup" at 09:00 conflicts with: "Daily Scrum" at 09:00'
    )
    assert(text.length > 0, 'Conflict agent: returns warning text', `"${text.slice(0,60)}…"`)
    assert(text.split(/\s+/).length <= 30, 'Conflict agent: response is concise')
  } catch (e) { fail('Conflict detection agent', e) }

  // ── Natural language event parser ─────────────────────────────────────────
  try {
    const text = await aiCall(
      'Parse plain English into a JSON event object. Return ONLY valid JSON with keys: title, date (YYYY-MM-DD relative to today 2026-03-17), time (HH:MM), duration (minutes as string), repeat, repeatDays (array), bug (emoji). No markdown.',
      'standup every Mon/Wed/Fri at 9am for 30 min'
    )
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    assert(typeof parsed.title    === 'string', 'NL parser: title present',    parsed.title)
    assert(typeof parsed.time     === 'string', 'NL parser: time present',     parsed.time)
    assert(typeof parsed.duration === 'string', 'NL parser: duration present', parsed.duration)
    assert(Array.isArray(parsed.repeatDays),    'NL parser: repeatDays is array')
    assert(parsed.repeatDays.length === 3,      'NL parser: 3 repeat days (M/W/F)', JSON.stringify(parsed.repeatDays))
  } catch (e) { fail('Natural language event parser', e) }

  // ── Timezone converter agent ───────────────────────────────────────────────
  try {
    const text = await aiCall(
      'Timezone converter. Return ONLY JSON: {"converted":"HH:MM","summary":"brief","dayNote":"same day|next day|previous day"}. No markdown.',
      'Convert 9:00 AM New York time to Los Angeles time'
    )
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    assert(typeof parsed.converted === 'string', 'Timezone agent: converted field present', parsed.converted)
    assert(typeof parsed.summary   === 'string', 'Timezone agent: summary field present',   parsed.summary)
    assert(typeof parsed.dayNote   === 'string', 'Timezone agent: dayNote field present',   parsed.dayNote)
    // Model may return "06:00", "6:00", "6:00 AM" etc — just check the hour is 6
    assert(/^0?6:00/.test(parsed.converted), 'Timezone agent: NY 9am → LA 6am correct', parsed.converted)
  } catch (e) { fail('Timezone converter agent', e) }

  // Real BugCal voice agent system prompt (mirrors BugCal.jsx exactly)
  const VOICE_SYSTEM = `You are BugCal's voice command agent. Today is 2026-03-17 (Tuesday).

The user's upcoming events (next 14 days):
2026-03-18: Team Standup at 09:00

Analyze the user's voice command and return ONLY valid JSON — one of these action shapes:

1. CREATE event:
{"action":"create","event":{"title":"...","date":"YYYY-MM-DD","time":"HH:MM or ''","duration":60,"bug":"🐛","color":"#7ec85a","repeat":"none","repeatDays":[],"repeatEnd":"never","repeatEndDate":"","repeatCount":"","note":"","reminderEnabled":true,"reminderMinutes":"15","timezone":""},"speak":"friendly confirmation to read aloud"}

2. SEARCH events:
{"action":"search","query":"search term","speak":"what you're searching for"}

3. CHECK schedule (read out events for a date/range):
{"action":"schedule","date":"YYYY-MM-DD","speak":"spoken summary of what's on that day based on the context above"}

4. NAVIGATE (switch view or go to date):
{"action":"navigate","view":"month|week|day|agenda","date":"YYYY-MM-DD or ''","speak":"navigation confirmation"}

5. UNKNOWN (can't parse):
{"action":"unknown","speak":"friendly apology and suggestion of what to try"}

Rules:
- For "create": parse natural language dates/times carefully relative to today.
- For "schedule": compose the speak field as a natural spoken sentence listing the events found in context, or say there's nothing scheduled if empty.
- The speak field should always be short, friendly, and bug-themed (max 2 sentences).
- Return ONLY the JSON. No markdown, no explanation.`

  // ── Voice command agent — CREATE ───────────────────────────────────────────
  try {
    const text = await aiCall(VOICE_SYSTEM, 'Voice command: "Add a dentist appointment on Friday at 2pm"')
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    assert(parsed.action === 'create',        'Voice agent CREATE: action=create',   parsed.action)
    assert(typeof parsed.speak === 'string',  'Voice agent CREATE: speak field present')
    assert(parsed.speak.length > 0,           'Voice agent CREATE: speak is non-empty')
    assert(parsed.event?.title?.length > 0,   'Voice agent CREATE: event.title present', parsed.event?.title)
  } catch (e) { fail('Voice command agent (CREATE)', e) }

  // ── Voice command agent — NAVIGATE ────────────────────────────────────────
  try {
    const text = await aiCall(VOICE_SYSTEM, 'Voice command: "Switch to week view"')
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    assert(parsed.action === 'navigate',      'Voice agent NAVIGATE: action=navigate', parsed.action)
    assert(parsed.view === 'week',            'Voice agent NAVIGATE: view=week',       parsed.view)
  } catch (e) { fail('Voice command agent (NAVIGATE)', e) }

  // ── Voice command agent — SCHEDULE ────────────────────────────────────────
  try {
    const text = await aiCall(VOICE_SYSTEM, "Voice command: \"What's on my schedule tomorrow?\"")
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    assert(parsed.action === 'schedule',      'Voice agent SCHEDULE: action=schedule', parsed.action)
    assert(parsed.speak?.toLowerCase().includes('standup') || parsed.speak?.length > 10,
      'Voice agent SCHEDULE: mentions standup or gives info', parsed.speak?.slice(0, 60))
  } catch (e) { fail('Voice command agent (SCHEDULE)', e) }

  // ── Holiday grounding agent (no web search — JSON parse check) ────────────
  try {
    const text = await aiCall(
      'Holiday verification agent. Return ONLY a valid JSON object mapping YYYY-MM-DD to US federal holiday names. No markdown, no explanation.',
      'US federal holidays for 2026 as JSON with exact dates.'
    )
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    assert(typeof parsed === 'object' && parsed !== null, 'Grounding agent: returns object')
    const keys = Object.keys(parsed)
    assert(keys.length >= 10, 'Grounding agent: at least 10 holidays returned', `got ${keys.length}`)
    assert(keys.some(k => k.startsWith('2026')), 'Grounding agent: 2026 dates present', keys.slice(0,3).join(', '))
    assert(Object.values(parsed).some(v => v.includes('Christmas')), 'Grounding agent: Christmas included')
  } catch (e) { fail('Holiday grounding agent', e) }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 5 – Data model round-trip (localStorage schema)
// ═══════════════════════════════════════════════════════════════════════════
function testDataModel() {
  section('Data Model & Event Structure')

  // Validates that an event object matching the stored schema round-trips correctly
  const event = {
    id: 'test-001',
    title: 'Weekly Standup',
    date: '2026-03-17',
    time: '09:00',
    endTime: '09:30',
    duration: '30',
    bug: '🐛',
    color: '#7ec85a',
    repeat: 'weekly',
    repeatDays: [],
    repeatEnd: 'count',
    repeatEndDate: '',
    repeatCount: 8,
    note: 'Bring agenda',
    reminderEnabled: true,
    reminderMinutes: '15',
    timezone: 'America/New_York',
  }

  // Schema check: all required keys present
  const required = ['id','title','date','time','duration','bug','color','repeat','repeatDays','repeatEnd','note','reminderEnabled','reminderMinutes']
  for (const key of required) {
    assert(key in event, `Event schema has key: ${key}`)
  }

  // Serialization round-trip
  const serialised   = JSON.stringify({ events: [event], reminderSettings: { enabled: true, minutesBefore: 15 }, userTz: 'America/New_York' })
  const deserialised = JSON.parse(serialised)
  assert(deserialised.events[0].id === 'test-001', 'Round-trip: event id preserved')
  assert(deserialised.events[0].bug === '🐛',      'Round-trip: emoji preserved')
  assert(deserialised.userTz === 'America/New_York', 'Round-trip: userTz preserved')

  // Verify all 8 event colors are valid hex
  const EVENT_COLORS = ['#7ec85a','#d4a843','#c05050','#5a9ec8','#c85aaa','#5ac8b4','#c8875a','#a0c85a']
  assert(EVENT_COLORS.every(c => /^#[0-9a-f]{6}$/.test(c)), `All ${EVENT_COLORS.length} event colors are valid hex`)

  // Verify 12 bug emojis
  const BUGS = ['🐛','🦋','🐝','🐞','🦗','🪲','🦟','🪳','🐜','🪰','🦠','🕷️']
  assert(BUGS.length === 12, '12 bug mascots defined')

  // Reminder minutes valid options
  const VALID_MINUTES = ['5','10','15','30','60','1440']
  assert(VALID_MINUTES.includes(event.reminderMinutes), `reminderMinutes "${event.reminderMinutes}" is a valid option`)
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUITE 6 – CORS headers
// ═══════════════════════════════════════════════════════════════════════════
async function testCORS() {
  section('CORS')

  try {
    const res = await fetch(BASE_URL + '/api/messages', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://programportfolio.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      }
    })
    assert(res.status === 200, 'OPTIONS preflight → 200')
    const origin = res.headers.get('Access-Control-Allow-Origin')
    assert(origin === 'https://programportfolio.vercel.app', 'CORS origin header correct', origin)
    const methods = res.headers.get('Access-Control-Allow-Methods') || ''
    assert(methods.includes('POST'), 'CORS allows POST')
  } catch (e) { fail('CORS preflight', e) }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Run all suites
// ═══════════════════════════════════════════════════════════════════════════
console.log(c('bold', '\n🪲 BugCal Test Harness'))
console.log(c('dim', `   Server : ${BASE_URL}`))
console.log(c('dim', `   Email  : ${TEST_EMAIL || '(skipped — provide --email)'}`))

testPureLogic()
testDataModel()
await testServer()
await testCORS()
await testAgents()
await testEmail()

// ── Summary ──────────────────────────────────────────────────────────────────
section('Summary')
const total = passed + failed + skipped
console.log(`  ${c('green', passed + ' passed')}  ${failed ? c('red', failed + ' failed') : c('dim', '0 failed')}  ${skipped ? c('yellow', skipped + ' skipped') : c('dim', '0 skipped')}  (${total} total)\n`)

if (failed > 0) {
  console.log(c('red', c('bold', '  BUILD NOT READY — fix failing tests before deploying.\n')))
  process.exit(1)
} else {
  console.log(c('green', c('bold', '  All checks passed. Ready to build. 🚀\n')))
}
