import { useState, useEffect, useCallback, useRef } from "react";

// ── Palette ────────────────────────────────────────────────────────────────
const C = { bg: "#0f1a0e", surface: "#162314", card: "#1e2f1b", border: "#2e4a28", accent: "#7ec85a", accentDim: "#4a7a34", amber: "#d4a843", amberDim: "#8a6620", text: "#d4e8c2", muted: "#7a9e6a", danger: "#c05050", warn: "#d4843a", white: "#f0f7ea" };
const BUGS = ["🐛", "🦋", "🐝", "🐞", "🦗", "🪲", "🦟", "🪳", "🐜", "🪰", "🦠", "🕷️"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EVENT_COLORS = ["#7ec85a", "#d4a843", "#c05050", "#5a9ec8", "#c85aaa", "#5ac8b4", "#c8875a", "#a0c85a"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i - 12}pm`);
const COMMON_TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow", "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland", "America/Sao_Paulo", "America/Toronto", "America/Vancouver"];
const BASE_HOLIDAYS = { "2025-01-01": "New Year's Day", "2025-01-20": "MLK Jr. Day", "2025-02-17": "Presidents' Day", "2025-05-26": "Memorial Day", "2025-06-19": "Juneteenth", "2025-07-04": "Independence Day", "2025-09-01": "Labor Day", "2025-10-13": "Columbus Day", "2025-11-11": "Veterans Day", "2025-11-27": "Thanksgiving", "2025-12-25": "Christmas Day", "2026-01-01": "New Year's Day", "2026-01-19": "MLK Jr. Day", "2026-02-16": "Presidents' Day", "2026-05-25": "Memorial Day", "2026-06-19": "Juneteenth", "2026-07-04": "Independence Day", "2026-09-07": "Labor Day", "2026-10-12": "Columbus Day", "2026-11-11": "Veterans Day", "2026-11-26": "Thanksgiving", "2026-12-25": "Christmas Day", "2027-01-01": "New Year's Day", "2027-01-18": "MLK Jr. Day", "2027-02-15": "Presidents' Day", "2027-05-31": "Memorial Day", "2027-06-19": "Juneteenth", "2027-07-04": "Independence Day", "2027-09-06": "Labor Day", "2027-10-11": "Columbus Day", "2027-11-11": "Veterans Day", "2027-11-25": "Thanksgiving", "2027-12-25": "Christmas Day" };

// ── Helpers ────────────────────────────────────────────────────────────────
const toKey = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const getDays = (y, m) => new Date(y, m + 1, 0).getDate();
const getFirstDow = (y, m) => new Date(y, m, 1).getDay();
const timeToMins = t => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmtDate = d => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };
const startOfWeek = s => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split("T")[0]; };

// ── Recurrence ─────────────────────────────────────────────────────────────
function doesOccurOn(ev, ds) {
  const s = new Date(ev.date + "T00:00:00"), c = new Date(ds + "T00:00:00");
  if (c < s) return false;
  if (ev.repeatEnd === "date" && ev.repeatEndDate && c > new Date(ev.repeatEndDate + "T00:00:00")) return false;
  if (!ev.repeat || ev.repeat === "none") return ev.date === ds;
  if (ev.repeat === "daily") return true;
  if (ev.repeat === "weekly") return c.getDay() === s.getDay();
  if (ev.repeat === "biweekly") { const d = Math.round((c - s) / 86400000); return d % 14 === 0; }
  if (ev.repeat === "custom_days") return (ev.repeatDays || []).includes(c.getDay());
  if (ev.repeat === "monthly") return c.getDate() === s.getDate();
  if (ev.repeat === "yearly") return c.getDate() === s.getDate() && c.getMonth() === s.getMonth();
  return false;
}
function countUpTo(ev, ds) {
  const s = new Date(ev.date + "T00:00:00"), e = new Date(ds + "T00:00:00"); let c = 0;
  for (let t = new Date(s); t <= e; t.setDate(t.getDate() + 1))if (doesOccurOn({ ...ev, repeatEnd: ev.repeatEnd === "count" ? "never" : ev.repeatEnd }, t.toISOString().split("T")[0])) c++;
  return c;
}
function getEventsForDate(evs, ds) { return evs.filter(ev => { if (!doesOccurOn(ev, ds)) return false; if (ev.repeatEnd === "count" && ev.repeatCount && countUpTo(ev, ds) > Number(ev.repeatCount)) return false; return true; }); }
function expandForMonth(evs, vy, vm) { const r = {}, days = getDays(vy, vm); for (let d = 1; d <= days; d++) { const k = toKey(vy, vm, d); r[k] = getEventsForDate(evs, k); } return r; }

// ✅ Fixed — routes through the backend proxy
async function aiCall(system, userMsg, extra = {}) {
  const res = await fetch("https://bugcal-513255025979.us-central1.run.app/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },  // ← no API key needed
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      system,
      ...extra,
      messages: [{ role: "user", content: userMsg }]
    })
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("API error:", res.status, JSON.stringify(data));
    throw new Error(`API error ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
  }

  return data.content?.map(c => c.text || "").join("").trim() || "";
}

// ── Existing Agents ────────────────────────────────────────────────────────
async function runConflictAgent(nev, all) {
  if (!nev.time || !nev.date) return null;
  const nm = timeToMins(nev.time), ne = nm + (Number(nev.duration) || 60);
  const cx = all.filter(ev => { if (ev.id === nev.id || !ev.time || !doesOccurOn(ev, nev.date)) return false; const em = timeToMins(ev.time), ee = em + (Number(ev.duration) || 60); return nm < ee && ne > em; });
  if (!cx.length) return null;
  try { const t = await aiCall("Bug-themed conflict detection agent. One charming warning under 20 words.", `"${nev.title}" at ${nev.time} conflicts with: ${cx.map(e => `"${e.title}" at ${e.time}`).join(", ")}`); return t || `⚠️ Overlaps with: ${cx.map(e => e.title).join(", ")}`; }
  catch { return `⚠️ Overlap with: ${cx.map(e => e.title).join(", ")}`; }
}
async function runGroundingAgent(year) {
  try {
    const t = await aiCall("Holiday verification agent. Return ONLY a valid JSON object mapping YYYY-MM-DD to US federal holiday names. No markdown, no explanation.", `US federal holidays for ${year} as JSON with exact dates.`, { tools: [{ type: "web_search_20250305", name: "web_search" }] });
    return { data: JSON.parse(t.replace(/```json|```/g, "").trim()), verified: true };
  } catch { const fb = {}; Object.entries(BASE_HOLIDAYS).forEach(([k, v]) => { if (k.startsWith(String(year))) fb[k] = v; }); return { data: fb, verified: false }; }
}
function startReminderAgent(evs, settings) {
  if (!settings.enabled || !("Notification" in window)) return () => { };
  const fired = new Set();
  const check = () => {
    const now = new Date();
    evs.forEach(ev => {
      if (!ev.time || ev.reminderEnabled === false) return;
      const mb = Number(ev.reminderMinutes || settings.minutesBefore || 15);
      for (let i = 0; i < 2; i++) {
        const d = new Date(now); d.setDate(d.getDate() + i);
        const ds = d.toISOString().split("T")[0];
        if (!doesOccurOn(ev, ds)) continue;
        const et = new Date(ds + "T" + ev.time + ":00"), ms = et - now;
        if (ms > 0 && ms <= mb * 60 * 1000) {
          const key = `${ev.id}-${ds}`;
          if (!fired.has(key)) { fired.add(key); const ml = Math.round(ms / 60000); if (Notification.permission === "granted") new Notification(`🪲 ${ev.bug} ${ev.title}`, { body: ml <= 1 ? "Starting now!" : `Starting in ${ml} min` }); }
        }
      }
    });
  };
  check(); const id = setInterval(check, 30000); return () => clearInterval(id);
}
async function runTimezoneAgent(q) {
  try { const t = await aiCall('Timezone converter. Return ONLY JSON: {"converted":"HH:MM","summary":"brief","dayNote":"same day|next day|previous day"}. No markdown.', q); return JSON.parse(t.replace(/```json|```/g, "").trim()); }
  catch { return { error: "Could not convert" }; }
}

// ── 🎤 Voice Command Agent ─────────────────────────────────────────────────
// Interprets spoken text and returns a structured action for the calendar.
async function runVoiceCommandAgent(transcript, events, todayKey) {
  const today = new Date(todayKey + "T00:00:00");
  const todayStr = todayKey;
  const upcomingContext = [];
  // Gather next 14 days of events as context
  for (let i = 0; i < 14; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const ds = d.toISOString().split("T")[0];
    const evs = getEventsForDate(events, ds);
    evs.forEach(ev => upcomingContext.push(`${ds}: ${ev.title}${ev.time ? " at " + ev.time : ""}`));
  }

  const system = `You are BugCal's voice command agent. Today is ${todayStr} (${WEEKDAYS_FULL[today.getDay()]}).

The user's upcoming events (next 14 days):
${upcomingContext.length ? upcomingContext.join("\n") : "(none scheduled)"}

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
- Return ONLY the JSON. No markdown, no explanation.`;

  try {
    const t = await aiCall(system, `Voice command: "${transcript}"`);
    return JSON.parse(t.replace(/```json|```/g, "").trim());
  } catch (e) {
    return { action: "unknown", speak: "My antennae couldn't quite pick that up. Try saying: add event, what's on today, or search for something." };
  }
}

// ── Text-to-Speech helper ──────────────────────────────────────────────────
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05; u.pitch = 1.0;
  // Prefer a natural-sounding voice
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.name.includes("Samantha") || v.name.includes("Google US English") || v.name.includes("Karen") || v.name.includes("Daniel")) || voices[0];
  if (preferred) u.voice = preferred;
  window.speechSynthesis.speak(u);
}

// ── Storage ────────────────────────────────────────────────────────────────
async function storageGet(key) {
  try { if (window.storage) { const r = await window.storage.get(key); return r?.value ? JSON.parse(r.value) : null; } const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
async function storageSet(key, val) {
  try { if (window.storage) { await window.storage.set(key, JSON.stringify(val)); return; } localStorage.setItem(key, JSON.stringify(val)); } catch { }
}

// ── UI Primitives ──────────────────────────────────────────────────────────
function Modal({ title, icon = "🐛", onClose, children, wide = false }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, maxWidth: wide ? 620 : 460, width: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontFamily: "Georgia,serif", fontSize: 19, color: C.accent }}>{icon} {title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
const iSt = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 11px", color: C.text, fontSize: 13, fontFamily: "monospace", outline: "none", boxSizing: "border-box" };
function FI({ label, ...p }) { return (<div style={{ marginBottom: 12 }}>{label && <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>{label}</label>}<input {...p} style={{ ...iSt, ...p.style }} /></div>); }
function FS({ label, children, ...p }) { return (<div style={{ marginBottom: 12 }}>{label && <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>{label}</label>}<select {...p} style={{ ...iSt, ...p.style }}>{children}</select></div>); }
function Btn({ children, variant = "primary", small = false, ...p }) {
  const bg = variant === "primary" ? C.accent : variant === "danger" ? C.danger : variant === "ghost" ? "transparent" : C.border;
  return (<button {...p} style={{ background: bg, color: variant === "primary" ? C.bg : C.white, border: variant === "ghost" ? `1px solid ${C.border}` : "none", borderRadius: 8, padding: small ? "5px 10px" : "8px 16px", fontSize: small ? 11 : 13, cursor: "pointer", fontFamily: "monospace", fontWeight: "bold", ...p.style }}>{children}</button>);
}
function Pill({ children, active, onClick }) { return (<button onClick={onClick} style={{ background: active ? C.accentDim : "transparent", border: `1px solid ${active ? C.accent : C.border}`, color: active ? C.white : C.muted, borderRadius: 6, padding: "3px 9px", fontSize: 12, cursor: "pointer", fontFamily: "monospace" }}>{children}</button>); }
function Toggle({ on, onToggle }) { return (<button onClick={onToggle} style={{ background: on ? C.accent : C.border, border: "none", borderRadius: 14, width: 42, height: 22, cursor: "pointer", position: "relative", transition: "background .2s", flexShrink: 0 }}><span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, background: C.white, borderRadius: "50%", transition: "left .2s", display: "block" }} /></button>); }
function VTab({ label, active, onClick }) { return (<button onClick={onClick} style={{ background: active ? C.accent : "transparent", color: active ? C.bg : C.muted, border: `1px solid ${active ? C.accent : C.border}`, borderRadius: 7, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "monospace", fontWeight: active ? "bold" : "normal", letterSpacing: .4 }}>{label}</button>); }

// ── 🎤 Voice HUD ───────────────────────────────────────────────────────────
// Floating voice button + status banner — the entire voice UX lives here
function VoiceHUD({ events, todayKey, onCreateEvent, onSearch, onNavigate }) {
  const [state, setState] = useState("idle"); // idle | listening | processing | speaking | error | unsupported
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [visible, setVisible] = useState(false);
  const recogRef = useRef(null);
  const timerRef = useRef(null);

  const supported = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
  const micStreamRef = useRef(null); // holds the getUserMedia stream so we can release it

  const isListening = state === "listening";
  const isProcessing = state === "processing";
  const isSpeaking = state === "speaking";
  const isError = state === "error";
  const isRequesting = state === "requesting";

  const micColor = isListening ? C.danger : isProcessing || isSpeaking ? C.amber : isRequesting ? C.amber : C.accent;

  // Release mic stream if we grabbed one via getUserMedia
  const releaseMicStream = () => {
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
  };

  const stopListening = () => {
    if (recogRef.current) { try { recogRef.current.stop(); } catch { } }
    clearTimeout(timerRef.current);
    releaseMicStream();
  };

  const processCommand = async (text) => {
    if (!text.trim()) { setState("idle"); setVisible(false); return; }
    setState("processing");
    setResponse("🕷️ Thinking...");
    try {
      const cmd = await runVoiceCommandAgent(text, events, todayKey);
      const spokenText = cmd.speak || "Done!";
      setResponse(spokenText);
      setState("speaking");
      speak(spokenText);
      if (cmd.action === "create" && cmd.event) setTimeout(() => onCreateEvent(cmd.event), 400);
      else if (cmd.action === "search" && cmd.query) setTimeout(() => onSearch(cmd.query), 400);
      else if (cmd.action === "navigate") setTimeout(() => onNavigate(cmd.view || "month", cmd.date || ""), 400);
      timerRef.current = setTimeout(() => { setState("idle"); setVisible(false); setTranscript(""); setResponse(""); }, 5500);
    } catch {
      setState("error");
      setResponse("Something went wrong. Please try again.");
      speak("Something went wrong. Please try again.");
      timerRef.current = setTimeout(() => { setState("idle"); setVisible(false); }, 4000);
    }
  };

  const startListening = async () => {
    if (!supported) {
      setState("error"); setVisible(true);
      setResponse("Speech recognition isn't available in this browser. Please try Chrome or Edge.");
      return;
    }

    // ── Step 1: explicitly request mic permission via getUserMedia ────────────
    // This is what triggers the OS/browser permission prompt in Firefox and
    // other browsers that don't auto-prompt on SpeechRecognition.start().
    setState("requesting"); setVisible(true); setResponse(""); setTranscript("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream; // we'll stop these tracks after recognition starts
    } catch (err) {
      // User denied, or hardware unavailable
      const denied = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
      setState("error");
      setResponse(denied
        ? "Microphone access was denied. Please allow mic access in your browser settings and try again."
        : "Could not access microphone: " + err.message);
      timerRef.current = setTimeout(() => { setState("idle"); setVisible(false); }, 5000);
      return;
    }

    // ── Step 2: now start speech recognition (permission is already granted) ──
    window.speechSynthesis?.cancel();
    setState("listening"); setTranscript(""); setResponse("");

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = "en-US"; r.interimResults = true; r.maxAlternatives = 1;
    recogRef.current = r;

    r.onresult = e => {
      const interim = Array.from(e.results).map(x => x[0].transcript).join("");
      setTranscript(interim);
      if (e.results[e.results.length - 1].isFinal) { stopListening(); processCommand(interim); }
    };
    r.onerror = e => {
      releaseMicStream();
      if (e.error === "no-speech") { setState("idle"); setVisible(false); }
      else if (e.error === "not-allowed") {
        setState("error"); setVisible(true);
        setResponse("Microphone access was denied. Please allow mic access in your browser settings and try again.");
        timerRef.current = setTimeout(() => { setState("idle"); setVisible(false); }, 5000);
      } else {
        setState("error"); setVisible(true);
        setResponse("Microphone error: " + e.error + ". Please try again.");
        timerRef.current = setTimeout(() => { setState("idle"); setVisible(false); }, 4000);
      }
    };
    r.onend = () => { releaseMicStream(); };
    r.start();

    // Release the getUserMedia stream now — SpeechRecognition has its own handle
    // We do this after a short delay to let the recognizer start cleanly
    setTimeout(() => releaseMicStream(), 300);

    // Auto-stop after 10s if no speech detected
    timerRef.current = setTimeout(() => { stopListening(); setState("idle"); setVisible(false); }, 10000);
  };

  const toggle = () => {
    if (isListening || isRequesting) { stopListening(); setState("idle"); setVisible(false); }
    else if (state === "idle") { startListening(); }
    else { setState("idle"); setVisible(false); setTranscript(""); setResponse(""); window.speechSynthesis?.cancel(); }
  };

  useEffect(() => () => { stopListening(); window.speechSynthesis?.cancel(); }, []);

  const statusIcon = isListening ? "🎙️" : isProcessing ? "🕷️" : isSpeaking ? "🔊" : (isError || state === "unsupported") ? "⚠️" : isRequesting ? "🔑" : "🎤";

  return (
    <>
      {/* Floating mic button */}
      <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 900, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {/* Ripple rings when listening */}
        {isListening && [1, 2, 3].map(i => (
          <div key={i} style={{
            position: "absolute", width: 56, height: 56, borderRadius: "50%", border: `2px solid ${C.danger}`,
            opacity: 0, animation: `voiceRipple ${1 + i * 0.3}s ease-out infinite`, animationDelay: `${i * 0.3}s`, pointerEvents: "none"
          }} />
        ))}
        <button onClick={toggle} title={isListening ? "Stop listening" : "Start voice command"}
          style={{
            width: 56, height: 56, borderRadius: "50%", border: `2px solid ${micColor}`,
            background: isListening ? "rgba(192,80,80,0.18)" : isRequesting || isProcessing || isSpeaking ? "rgba(212,168,67,0.15)" : "rgba(126,200,90,0.1)",
            cursor: "pointer", fontSize: 22, transition: "all .2s", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 ${isListening ? 20 : isRequesting ? 14 : 8}px ${micColor}55`, transform: isListening || isRequesting ? "scale(1.08)" : "scale(1)"
          }}>
          {statusIcon}
        </button>
        <div style={{
          fontSize: 9, color: micColor, fontFamily: "monospace", letterSpacing: .5, textAlign: "center",
          background: C.surface + "cc", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap"
        }}>
          {isListening ? "LISTENING" : isSpeaking ? "SPEAKING" : isProcessing ? "THINKING" : isRequesting ? "ALLOW MIC" : "VOICE"}
        </div>
      </div>

      {/* Voice HUD banner — appears above mic button */}
      {visible && (
        <div style={{
          position: "fixed", bottom: 110, right: 20, zIndex: 900,
          background: C.card, border: `1px solid ${micColor}66`, borderRadius: 14,
          padding: "14px 18px", maxWidth: 310, minWidth: 210,
          boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 20px ${micColor}22`
        }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 16 }}>{statusIcon}</span>
              <span style={{ color: micColor, fontSize: 11, fontFamily: "monospace", letterSpacing: .8, fontWeight: "bold" }}>
                {isRequesting ? "ALLOW MIC..." : isListening ? "LISTENING..." : isProcessing ? "THINKING..." : isSpeaking ? "SPEAKING..." : isError ? "ERROR" : "VOICE"}
              </span>
            </div>
            <button onClick={() => { stopListening(); setState("idle"); setVisible(false); setTranscript(""); setResponse(""); window.speechSynthesis?.cancel(); }}
              style={{ background: "none", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>

          {/* Permission request prompt */}
          {isRequesting && (
            <div style={{
              background: "rgba(212,168,67,0.1)", border: `1px solid ${C.amber}44`, borderRadius: 8,
              padding: "9px 11px", marginBottom: 8, fontSize: 12, color: C.amber, fontFamily: "monospace", lineHeight: 1.6
            }}>
              🔑 Your browser is asking for microphone permission.<br />
              <span style={{ fontSize: 11, color: C.muted }}>Click <strong style={{ color: C.white }}>Allow</strong> in the prompt to continue.</span>
            </div>
          )}

          {/* Waveform visualizer when listening */}
          {isListening && (
            <div style={{ display: "flex", alignItems: "center", gap: 3, height: 28, marginBottom: 10, justifyContent: "center" }}>
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} style={{
                  width: 3, background: C.danger, borderRadius: 2,
                  animation: `voiceBar 0.8s ease-in-out infinite`,
                  animationDelay: `${i * 0.07}s`,
                  minHeight: 4
                }} />
              ))}
            </div>
          )}

          {/* Transcript (live) */}
          {transcript && (
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "7px 10px", marginBottom: 8, fontSize: 12, color: C.text, fontFamily: "monospace",
              fontStyle: "italic", lineHeight: 1.5
            }}>
              "{transcript}"
            </div>
          )}

          {/* AI response / error */}
          {response && response !== "🕷️ Thinking..." && (
            <div style={{ fontSize: 12, color: isError ? C.danger : isSpeaking ? C.amber : C.text, fontFamily: "monospace", lineHeight: 1.6 }}>
              {isSpeaking && <span style={{ marginRight: 5 }}>🔊</span>}
              {isError && <span style={{ marginRight: 5 }}>⚠️</span>}
              {response}
            </div>
          )}
          {response === "🕷️ Thinking..." && (
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>🕷️</span> Thinking...
            </div>
          )}

          {/* Voice command hints */}
          {state === "idle" && !response && (
            <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", lineHeight: 1.7 }}>
              Try saying:<br />
              <span style={{ color: C.accent }}>"Add dentist appointment Friday at 3pm"</span><br />
              <span style={{ color: C.accent }}>"What's on my schedule today?"</span><br />
              <span style={{ color: C.accent }}>"Search for standup"</span><br />
              <span style={{ color: C.accent }}>"Switch to week view"</span>
            </div>
          )}
        </div>
      )}

      {/* Inject keyframe animations */}
      <style>{`
        @keyframes voiceRipple{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.8);opacity:0}}
        @keyframes voiceBar{0%,100%{height:4px}50%{height:${Math.random() * 16 + 8}px}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes voiceBarA{0%,100%{height:5px}50%{height:22px}}
        @keyframes voiceBarB{0%,100%{height:8px}50%{height:14px}}
        @keyframes voiceBarC{0%,100%{height:4px}50%{height:20px}}
        @keyframes voiceBarD{0%,100%{height:10px}50%{height:6px}}
        @keyframes voiceBarE{0%,100%{height:6px}50%{height:18px}}
        @keyframes voiceBarF{0%,100%{height:4px}50%{height:24px}}
      `}</style>
    </>
  );
}

// ── Search Panel (now also accepts a prefilled query) ──────────────────────
// ── Year View ──────────────────────────────────────────────────────────────
function YearView({ year, events, holidays, todayKey, onSelectMonth }) {
  const todayY = parseInt(todayKey.slice(0, 4)), todayM = parseInt(todayKey.slice(5, 7)) - 1, todayD = parseInt(todayKey.slice(8, 10));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, flex: 1, overflowY: "auto", paddingRight: 2 }}>
      {MONTHS.map((mName, mi) => {
        const days = getDays(year, mi), fdow = getFirstDow(year, mi);
        const isCurrentMonth = year === todayY && mi === todayM;
        // Gather a lightweight map: day→{hasEvent,hasHoliday,colors}
        const dayData = {};
        for (let d = 1; d <= days; d++) {
          const k = toKey(year, mi, d);
          const evs = getEventsForDate(events, k);
          const hol = holidays[k];
          if (evs.length || hol) dayData[d] = { evs, hol };
        }
        return (
          <div key={mi} onClick={() => onSelectMonth(mi)}
            style={{
              background: C.card, border: `1px solid ${isCurrentMonth ? C.accent : C.border}`, borderRadius: 10,
              padding: "8px 7px", cursor: "pointer", transition: "background .15s", userSelect: "none"
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.surface}
            onMouseLeave={e => e.currentTarget.style.background = C.card}>
            {/* Month name */}
            <div style={{
              fontFamily: "Georgia,serif", fontSize: 12, fontWeight: "bold",
              color: isCurrentMonth ? C.accent : C.white, marginBottom: 5, letterSpacing: .3
            }}>
              {mName}
            </div>
            {/* Day-of-week header */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 2 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} style={{ textAlign: "center", fontSize: 7, color: C.muted, fontFamily: "monospace" }}>{d}</div>
              ))}
            </div>
            {/* Day grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "1px 0" }}>
              {Array.from({ length: fdow }).map((_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: days }).map((_, i) => {
                const d = i + 1;
                const isToday = year === todayY && mi === todayM && d === todayD;
                const data = dayData[d];
                const hasEvent = data?.evs?.length > 0;
                const hasHoliday = !!data?.hol;
                const dotColor = data?.evs?.[0]?.color || C.accent;
                return (
                  <div key={d} style={{
                    position: "relative", textAlign: "center",
                    width: "100%", paddingBottom: "100%"/* square cells */
                  }}>
                    <div style={{
                      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 1
                    }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 8, fontFamily: "monospace", lineHeight: 1,
                        background: isToday ? C.accent : "transparent",
                        color: isToday ? C.bg : hasEvent ? C.white : C.muted,
                        fontWeight: isToday || hasEvent ? "bold" : "normal",
                      }}>{d}</div>
                      {/* dot row: event dot + holiday dot */}
                      <div style={{ display: "flex", gap: 1, height: 4, alignItems: "center" }}>
                        {hasEvent && <div style={{ width: 3, height: 3, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />}
                        {hasHoliday && <div style={{ width: 3, height: 3, borderRadius: "50%", background: C.amber, flexShrink: 0 }} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Monthly event count badge */}
            {Object.values(dayData).some(d => d.evs?.length) && (
              <div style={{ marginTop: 4, fontSize: 8, color: C.muted, fontFamily: "monospace", textAlign: "right" }}>
                {Object.values(dayData).reduce((s, d) => s + (d.evs?.length || 0), 0)} event{Object.values(dayData).reduce((s, d) => s + (d.evs?.length || 0), 0) !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SearchPanel({ events, onClickEvent, onClose, initialQuery = "" }) {
  const [q, setQ] = useState(initialQuery); const [fc, setFc] = useState(""); const [fr, setFr] = useState(""); const [fb, setFb] = useState("");
  const res = events.filter(ev => {
    if (q && !ev.title.toLowerCase().includes(q.toLowerCase()) && !ev.note?.toLowerCase().includes(q.toLowerCase())) return false;
    if (fc && ev.color !== fc) return false; if (fr && ev.repeat !== fr) return false; if (fb && ev.bug !== fb) return false; return true;
  }).sort((a, b) => a.date < b.date ? -1 : 1);
  return (
    <Modal title="Search & Filter" icon="🔍" onClose={onClose} wide>
      <div style={{ position: "relative", marginBottom: 12 }}><input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Search title or notes..." style={{ ...iSt, paddingLeft: 30 }} /><span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 13 }}>🔍</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginBottom: 12 }}>
        <div>
          <label style={{ display: "block", color: C.muted, fontSize: 10, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>COLOR</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <div onClick={() => setFc("")} style={{ width: 18, height: 18, borderRadius: "50%", background: C.border, cursor: "pointer", outline: !fc ? `2px solid ${C.white}` : "none", outlineOffset: 2 }} />
            {EVENT_COLORS.map(col => <div key={col} onClick={() => setFc(fc === col ? "" : col)} style={{ width: 18, height: 18, borderRadius: "50%", background: col, cursor: "pointer", outline: fc === col ? `2px solid ${C.white}` : "none", outlineOffset: 2 }} />)}
          </div>
        </div>
        <div>
          <label style={{ display: "block", color: C.muted, fontSize: 10, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>REPEAT</label>
          <select value={fr} onChange={e => setFr(e.target.value)} style={{ ...iSt, padding: "4px 7px", fontSize: 11 }}>
            <option value="">Any</option><option value="none">One-time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="custom_days">Custom</option>
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", color: C.muted, fontSize: 10, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>BUG</label>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          <button onClick={() => setFb("")} style={{ background: !fb ? C.accentDim : "transparent", border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 6px", cursor: "pointer", fontSize: 11, color: C.muted }}>All</button>
          {BUGS.map(b => <button key={b} onClick={() => setFb(fb === b ? "" : b)} style={{ fontSize: 13, background: fb === b ? C.accentDim : "transparent", border: `1px solid ${fb === b ? C.accent : C.border}`, borderRadius: 4, padding: "1px 3px", cursor: "pointer" }}>{b}</button>)}
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginBottom: 7, letterSpacing: .5 }}>{res.length} RESULT{res.length !== 1 ? "S" : ""}</div>
      <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
        {!res.length && <div style={{ textAlign: "center", padding: 24, color: C.muted, fontFamily: "monospace" }}>🦠 No matches</div>}
        {res.map(ev => (
          <div key={ev.id} onClick={() => { onClickEvent(ev); onClose(); }} style={{ background: ev.color + "18", border: `1px solid ${ev.color}44`, borderRadius: 7, padding: "7px 11px", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = ev.color + "2e"} onMouseLeave={e => e.currentTarget.style.background = ev.color + "18"}>
            <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <span style={{ fontSize: 17, flexShrink: 0 }}>{ev.bug}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "Georgia,serif", fontSize: 13, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginTop: 1 }}>{fmtDate(ev.date)}{ev.time ? ` · ${ev.time}` : ""}{ev.repeat && ev.repeat !== "none" ? " · ↻ " + ev.repeat : ""}</div>
              </div>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: ev.color, flexShrink: 0 }} />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Event Form ─────────────────────────────────────────────────────────────
const EMPTY = { title: "", date: "", time: "", endTime: "", duration: "60", bug: "🐛", color: "#7ec85a", repeat: "none", repeatDays: [], repeatEnd: "never", repeatEndDate: "", repeatCount: "", note: "", reminderEnabled: true, reminderMinutes: "15", timezone: "" };

function EventForm({ initial = {}, allEvents = [], onSave, onDelete, defaultTz = "" }) {
  const [f, setF] = useState({ ...EMPTY, timezone: defaultTz, ...initial, repeatDays: initial.repeatDays || [] });
  const [ai, setAi] = useState(""); const [aiL, setAiL] = useState(false);
  const [conflict, setConflict] = useState(null); const [ck, setCk] = useState(false);
  const tmr = useRef(null);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const togDay = d => set("repeatDays", f.repeatDays.includes(d) ? f.repeatDays.filter(x => x !== d) : [...f.repeatDays, d]);

  useEffect(() => {
    if (!f.time || !f.date) { setConflict(null); return; }
    clearTimeout(tmr.current); setCk(true);
    tmr.current = setTimeout(async () => { setConflict(await runConflictAgent(f, allEvents)); setCk(false); }, 700);
    return () => clearTimeout(tmr.current);
  }, [f.time, f.date, f.duration]);

  const parseAI = async () => {
    if (!ai.trim()) return; setAiL(true);
    const today = new Date().toISOString().split("T")[0];
    try {
      const t = await aiCall(`Scheduling parser. Today is ${today}. Return ONLY JSON: {title,date(YYYY-MM-DD),time(HH:MM or ""),duration(mins),repeat("none"|"daily"|"weekly"|"biweekly"|"monthly"|"yearly"|"custom_days"),repeatDays([0-6]),repeatEnd("never"|"date"|"count"),repeatEndDate(YYYY-MM-DD or ""),repeatCount(number or ""),note(""),bug(from:🐛🦋🐝🐞🦗🪲🦟🪳🐜🪰🦠🕷️)}. If cannot parse: {"error":"reason"}`, ai);
      const p = JSON.parse(t.replace(/```json|```/g, "").trim());
      if (p.error) throw new Error(p.error);
      setF(prev => ({ ...prev, ...p, repeatDays: p.repeatDays || prev.repeatDays })); setAi("");
    } catch { setAi('⚠️ Try: "dentist every Mon at 2pm for 45 min"'); }
    setAiL(false);
  };

  return (
    <div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: 11, marginBottom: 14 }}>
        <div style={{ color: C.amber, fontSize: 10, marginBottom: 6, fontFamily: "monospace", letterSpacing: 1 }}>🦋 QUICK-FILL FROM NATURAL LANGUAGE</div>
        <div style={{ display: "flex", gap: 7 }}>
          <input value={ai} onChange={e => setAi(e.target.value)} onKeyDown={e => e.key === "Enter" && parseAI()} placeholder='e.g. "standup Mon/Wed/Fri at 9am for 30 min"' style={{ ...iSt, flex: 1, fontSize: 12, padding: "7px 10px" }} />
          <Btn onClick={parseAI} small>{aiL ? "🔄" : "🐝"}</Btn>
        </div>
      </div>
      <FI label="EVENT TITLE" value={f.title} onChange={e => set("title", e.target.value)} placeholder="Butterfly migration watch..." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
        <FI label="DATE" type="date" value={f.date} onChange={e => set("date", e.target.value)} />
        <FI label="START TIME" type="time" value={f.time} onChange={e => { set("time", e.target.value); if (f.endTime && e.target.value) { const s = timeToMins(e.target.value), en = timeToMins(f.endTime); if (en > s) set("duration", String(en - s)); } }} />
        <FI label="END TIME" type="time" value={f.endTime || ""} onChange={e => { set("endTime", e.target.value); if (f.time && e.target.value) { const s = timeToMins(f.time), en = timeToMins(e.target.value); if (en > s) set("duration", String(en - s)); } }} />
      </div>
      <FS label="EVENT TIMEZONE" value={f.timezone} onChange={e => set("timezone", e.target.value)}>
        <option value="">— Use default —</option>
        {COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
      </FS>
      {ck && <div style={{ background: "#1e1408", border: `1px solid ${C.warn}44`, borderRadius: 7, padding: "6px 11px", marginBottom: 10, fontSize: 11, color: C.amberDim, fontFamily: "monospace" }}>🕷️ Checking for conflicts...</div>}
      {conflict && !ck && <div style={{ background: "#221406", border: `1px solid ${C.warn}`, borderRadius: 7, padding: "8px 11px", marginBottom: 10, fontSize: 12, color: "#f0a060", fontFamily: "monospace" }}>⚠️ {conflict}</div>}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>BUG MASCOT</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{BUGS.map(b => <button key={b} onClick={() => set("bug", b)} style={{ fontSize: 18, background: f.bug === b ? C.accentDim : "transparent", border: `1px solid ${f.bug === b ? C.accent : C.border}`, borderRadius: 6, padding: "2px 5px", cursor: "pointer" }}>{b}</button>)}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>COLOR</label>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{EVENT_COLORS.map(col => <div key={col} onClick={() => set("color", col)} style={{ width: 22, height: 22, borderRadius: "50%", background: col, cursor: "pointer", outline: f.color === col ? `3px solid ${C.white}` : "3px solid transparent", outlineOffset: 2 }} />)}</div>
      </div>
      <FS label="REPEAT" value={f.repeat} onChange={e => set("repeat", e.target.value)}>
        <option value="none">Does not repeat</option><option value="daily">Every day</option>
        <option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option>
        <option value="monthly">Every month</option><option value="yearly">Every year</option>
        <option value="custom_days">Custom days</option>
      </FS>
      {f.repeat === "custom_days" && <div style={{ marginBottom: 12 }}><label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 5, fontFamily: "monospace", letterSpacing: .6 }}>REPEAT ON</label><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{WEEKDAYS_SHORT.map((d, i) => <Pill key={d} active={f.repeatDays.includes(i)} onClick={() => togDay(i)}>{d}</Pill>)}</div></div>}
      {f.repeat !== "none" && <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 5, fontFamily: "monospace", letterSpacing: .6 }}>ENDS</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
          <Pill active={f.repeatEnd === "never"} onClick={() => set("repeatEnd", "never")}>♾️ Never</Pill>
          <Pill active={f.repeatEnd === "date"} onClick={() => set("repeatEnd", "date")}>📅 On date</Pill>
          <Pill active={f.repeatEnd === "count"} onClick={() => set("repeatEnd", "count")}>🔢 After N</Pill>
        </div>
        {f.repeatEnd === "date" && <FI label="END DATE" type="date" value={f.repeatEndDate} onChange={e => set("repeatEndDate", e.target.value)} />}
        {f.repeatEnd === "count" && <FI label="OCCURRENCES" type="number" min="1" value={f.repeatCount} onChange={e => set("repeatCount", e.target.value)} placeholder="e.g. 10" />}
        {f.repeatEnd === "never" && <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", padding: "5px 9px", background: C.surface, borderRadius: 5, border: `1px solid ${C.border}` }}>♾️ Repeats indefinitely</div>}
      </div>}
      <div style={{ marginBottom: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <label style={{ color: C.muted, fontSize: 11, fontFamily: "monospace", letterSpacing: .6 }}>🔔 REMINDER</label>
          <Toggle on={f.reminderEnabled !== false} onToggle={() => set("reminderEnabled", f.reminderEnabled === false)} />
        </div>
        {f.reminderEnabled !== false && <FS value={f.reminderMinutes || "15"} onChange={e => set("reminderMinutes", e.target.value)} style={{ marginBottom: 0 }}>
          <option value="5">5 min before</option><option value="10">10 min before</option>
          <option value="15">15 min before</option><option value="30">30 min before</option>
          <option value="60">1 hour before</option><option value="1440">1 day before</option>
        </FS>}
      </div>
      <FI label="NOTES" value={f.note} onChange={e => set("note", e.target.value)} placeholder="Extra details..." />
      <div style={{ display: "flex", gap: 9, marginTop: 6, flexWrap: "wrap" }}>
        <Btn onClick={() => { if (f.title && f.date) onSave(f); }}>🪲 Save</Btn>
        {onDelete && <Btn variant="danger" onClick={onDelete}>🗑 Delete</Btn>}
      </div>
      {(!f.title || !f.date) && <div style={{ fontSize: 11, color: C.muted, marginTop: 5, fontFamily: "monospace" }}>Title and date required.</div>}
    </div>
  );
}

// ── Calendar Views ─────────────────────────────────────────────────────────
function MonthView({ year, month, expanded, holidays, todayKey, onAdd, onClickEvent, onClickHoliday }) {
  const days = getDays(year, month), fdow = getFirstDow(year, month);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 3 }}>
        {WEEKDAYS_SHORT.map(d => <div key={d} style={{ textAlign: "center", color: C.muted, fontSize: 10, padding: "2px 0", letterSpacing: 2, fontWeight: "bold" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {Array.from({ length: fdow }).map((_, i) => <div key={`b${i}`} style={{ height: 96 }} />)}
        {Array.from({ length: days }).map((_, i) => {
          const d = i + 1, k = toKey(year, month, d), isT = k === todayKey, evs = expanded[k] || [], hol = holidays[k];
          return (
            <div key={k} onClick={() => onAdd(k)} style={{ height: 96, background: C.card, border: `${isT ? 2 : 1}px solid ${isT ? C.accent : C.border}`, borderRadius: 8, padding: "4px 6px", cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column", transition: "background .1s" }}
              onMouseEnter={e => e.currentTarget.style.background = C.surface} onMouseLeave={e => e.currentTarget.style.background = C.card}>
              <div style={{ fontFamily: "Georgia,serif", fontSize: 13, flexShrink: 0, color: isT ? C.accent : C.text, fontWeight: isT ? "700" : "400", marginBottom: 2, lineHeight: 1 }}>{d}</div>
              {hol && <div onClick={e => { e.stopPropagation(); onClickHoliday(hol, k); }} style={{ fontSize: 9, color: C.amber, fontFamily: "monospace", flexShrink: 0, marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", borderRadius: 3, padding: "1px 3px", background: C.amberDim + "22", border: `1px solid ${C.amberDim}44` }}>🎉 {hol.name.length > 13 ? hol.name.slice(0, 12) + "…" : hol.name}</div>}
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 2, minHeight: 0 }}>
                {evs.slice(0, 3).map((ev, i) => (
                  <div key={ev.id + i} onClick={e => { e.stopPropagation(); onClickEvent(ev, k); }} style={{ background: ev.color + "28", border: `1px solid ${ev.color}66`, borderRadius: 3, flexShrink: 0, padding: "1px 4px", fontSize: 10, color: C.white, height: 16, lineHeight: "14px", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 2, overflow: "hidden", whiteSpace: "nowrap", cursor: "pointer" }}>
                    <span style={{ flexShrink: 0 }}>{ev.bug}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{ev.time ? ev.time + " · " : ""}{ev.title}{ev.repeat && ev.repeat !== "none" ? <span style={{ opacity: .5 }}> ↻</span> : null}</span>
                  </div>
                ))}
                {evs.length > 3 && <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", lineHeight: 1 }}>+{evs.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function WeekView({ weekStart, events, todayKey, onAdd, onClickEvent }) {
  const CH = 44, days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "46px repeat(7,1fr)", borderBottom: `1px solid ${C.border}`, paddingBottom: 5, flexShrink: 0 }}>
        <div />
        {days.map(d => {
          const dt = new Date(d + "T00:00:00"), isT = d === todayKey; return (
            <div key={d} style={{ textAlign: "center", padding: "3px 0" }}>
              <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: 1 }}>{WEEKDAYS_SHORT[dt.getDay()]}</div>
              <div style={{ fontFamily: "Georgia,serif", fontSize: 16, color: isT ? C.accent : C.text, fontWeight: isT ? "700" : "400", background: isT ? C.accentDim + "44" : "transparent", borderRadius: "50%", width: 26, height: 26, lineHeight: "26px", margin: "1px auto 0" }}>{dt.getDate()}</div>
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "46px repeat(7,1fr)", minHeight: CH * 24 }}>
          <div style={{ position: "relative" }}>{HOUR_LABELS.map((l, i) => <div key={i} style={{ position: "absolute", top: i * CH - 6, right: 3, fontSize: 8, color: C.muted, fontFamily: "monospace", whiteSpace: "nowrap" }}>{l}</div>)}</div>
          {days.map(d => {
            const de = getEventsForDate(events, d).filter(e => e.time);
            return (
              <div key={d} onClick={() => onAdd(d)} style={{ position: "relative", borderLeft: `1px solid ${C.border}22`, cursor: "pointer", minHeight: CH * 24 }} onMouseEnter={e => e.currentTarget.style.background = C.surface + "33"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {Array.from({ length: 24 }, (_, i) => <div key={i} style={{ position: "absolute", top: i * CH, left: 0, right: 0, borderTop: `1px solid ${C.border}${i === 0 ? "" : "22"}`, pointerEvents: "none" }} />)}
                {de.map((ev, i) => {
                  const top = timeToMins(ev.time) / 60 * CH, h = Math.max((Number(ev.duration) || 60) / 60 * CH, 16); return (
                    <div key={ev.id + i} onClick={e => { e.stopPropagation(); onClickEvent(ev, d); }} style={{ position: "absolute", top, left: 1, right: 1, height: h, background: ev.color + "cc", borderLeft: `3px solid ${ev.color}`, borderRadius: 3, padding: "1px 3px", fontSize: 9, color: C.bg, fontFamily: "monospace", overflow: "hidden", cursor: "pointer", zIndex: 2, fontWeight: "bold" }}>{ev.bug} {ev.time} {ev.title}</div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayView({ dateKey, events, holidays, todayKey, onAdd, onClickEvent }) {
  const CH = 52, de = getEventsForDate(events, dateKey), timed = de.filter(e => e.time), allDay = de.filter(e => !e.time);
  const dt = new Date(dateKey + "T00:00:00"), hol = holidays[dateKey];
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ textAlign: "center", padding: "8px 0 7px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 22, color: dateKey === todayKey ? C.accent : C.white }}>{WEEKDAYS_FULL[dt.getDay()]}, {MONTHS[dt.getMonth()]} {dt.getDate()}, {dt.getFullYear()}</div>
        {hol && <div style={{ color: C.amber, fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>🎉 {hol.name}</div>}
        {allDay.length > 0 && <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap", marginTop: 7 }}>{allDay.map(ev => <div key={ev.id} onClick={() => onClickEvent(ev, dateKey)} style={{ background: ev.color + "33", border: `1px solid ${ev.color}`, borderRadius: 4, padding: "1px 8px", fontSize: 11, color: C.white, cursor: "pointer", fontFamily: "monospace" }}>{ev.bug} {ev.title}</div>)}</div>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", minHeight: CH * 24 }}>
          <div style={{ position: "relative" }}>{HOUR_LABELS.map((l, i) => <div key={i} style={{ position: "absolute", top: i * CH - 7, right: 6, fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{l}</div>)}</div>
          <div onClick={() => onAdd(dateKey)} style={{ position: "relative", cursor: "pointer", borderLeft: `1px solid ${C.border}` }}>
            {Array.from({ length: 24 }, (_, i) => <div key={i} style={{ position: "absolute", top: i * CH, left: 0, right: 0, borderTop: `1px solid ${C.border}${i === 0 ? "" : "33"}`, height: CH, pointerEvents: "none" }} />)}
            {timed.map((ev, i) => {
              const top = timeToMins(ev.time) / 60 * CH, h = Math.max((Number(ev.duration) || 60) / 60 * CH, 26); return (
                <div key={ev.id + i} onClick={e => { e.stopPropagation(); onClickEvent(ev, dateKey); }} style={{ position: "absolute", top, left: 6, right: 6, height: h, background: ev.color + "dd", borderLeft: `4px solid ${ev.color}`, borderRadius: 6, padding: "3px 9px", color: C.bg, fontFamily: "monospace", overflow: "hidden", cursor: "pointer", zIndex: 2 }}>
                  <div style={{ fontWeight: "bold", fontSize: 12 }}>{ev.bug} {ev.title}</div>
                  <div style={{ fontSize: 10, opacity: .8 }}>{ev.time}{ev.endTime ? ` – ${ev.endTime}` : ""}{ev.note ? ` · ${ev.note}` : ""}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgendaView({ events, holidays, todayKey, onAdd, onClickEvent, daysAhead = 90 }) {
  const today = new Date(todayKey + "T00:00:00"), items = [];
  for (let i = 0; i < daysAhead; i++) { const d = new Date(today); d.setDate(d.getDate() + i); const k = d.toISOString().split("T")[0]; const evs = getEventsForDate(events, k), hol = holidays[k]; if (evs.length || hol) items.push({ key: k, evs, hol, dt: d }); }
  if (!items.length) return (<div style={{ textAlign: "center", padding: 50, color: C.muted, fontFamily: "monospace" }}>🐛 No upcoming events.<div style={{ marginTop: 14 }}><Btn onClick={() => onAdd(todayKey)}>+ Add Event</Btn></div></div>);
  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: 3 }}>
      {items.map(({ key, evs, hol, dt }) => (
        <div key={key} style={{ display: "flex", gap: 14, marginBottom: 3 }}>
          <div style={{ minWidth: 64, textAlign: "right", paddingTop: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: .5 }}>{WEEKDAYS_SHORT[dt.getDay()]}</div>
            <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: key === todayKey ? C.accent : C.text, lineHeight: 1 }}>{dt.getDate()}</div>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{MONTHS[dt.getMonth()].slice(0, 3)}</div>
          </div>
          <div style={{ flex: 1, borderLeft: `2px solid ${C.border}`, paddingLeft: 12, paddingTop: 7, paddingBottom: 7 }}>
            {hol && <div style={{ fontSize: 11, color: C.amber, fontFamily: "monospace", marginBottom: 5 }}>🎉 {hol.name}</div>}
            {evs.map(ev => (
              <div key={ev.id} onClick={() => onClickEvent(ev, key)} style={{ background: ev.color + "18", border: `1px solid ${ev.color}44`, borderRadius: 7, padding: "7px 11px", marginBottom: 5, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = ev.color + "2e"} onMouseLeave={e => e.currentTarget.style.background = ev.color + "18"}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 17, flexShrink: 0 }}>{ev.bug}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "Georgia,serif", fontSize: 14, color: C.white }}>{ev.title}</div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginTop: 2 }}>{ev.time ? `${ev.time}${ev.endTime ? ` – ${ev.endTime}` : ""} · ` : "All day · "}{ev.repeat && ev.repeat !== "none" ? "↻ · " : ""}{ev.timezone || ""}</div>
                    {ev.note && <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginTop: 1, fontStyle: "italic" }}>{ev.note}</div>}
                  </div>
                  {ev.reminderEnabled !== false && <span style={{ fontSize: 11, opacity: .4, flexShrink: 0 }}>🔔</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimezonePanel({ onClose, defaultTz, onSetDefault }) {
  const [from, setFrom] = useState(defaultTz || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [to, setTo] = useState("America/New_York");
  const [t, setT] = useState("09:00"); const [res, setRes] = useState(null); const [ld, setLd] = useState(false);
  const convert = async () => { setLd(true); setRes(null); const r = await runTimezoneAgent(`Convert ${t} from ${from} to ${to}.`); setRes(r); setLd(false); };
  const native = () => { try { const d = new Date(); const [h, m] = t.split(":").map(Number); d.setHours(h, m, 0, 0); return { from: d.toLocaleTimeString("en-US", { timeZone: from, hour: "2-digit", minute: "2-digit" }), to: d.toLocaleTimeString("en-US", { timeZone: to, hour: "2-digit", minute: "2-digit" }) }; } catch { return null; } };
  const n = native();
  return (
    <Modal title="Timezone Converter" icon="🌐" onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 9, alignItems: "end", marginBottom: 14 }}>
        <FS label="FROM" value={from} onChange={e => setFrom(e.target.value)} style={{ marginBottom: 0 }}>{COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}</FS>
        <div style={{ textAlign: "center", color: C.muted, fontSize: 20, paddingBottom: 9 }}>→</div>
        <FS label="TO" value={to} onChange={e => setTo(e.target.value)} style={{ marginBottom: 0 }}>{COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}</FS>
      </div>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-end", marginBottom: 14 }}>
        <FI label="TIME" type="time" value={t} onChange={e => setT(e.target.value)} style={{ marginBottom: 0, flex: 1 }} />
        <Btn onClick={convert} style={{ flexShrink: 0 }}>{ld ? "🔄..." : "🌐 Convert"}</Btn>
      </div>
      {n && <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 11 }}>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginBottom: 7, letterSpacing: .5 }}>⚡ INSTANT</div>
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{from.split("/").pop().replace(/_/g, " ")}</div><div style={{ fontFamily: "Georgia,serif", fontSize: 24, color: C.text }}>{n.from}</div></div>
          <div style={{ color: C.muted, fontSize: 20 }}>→</div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{to.split("/").pop().replace(/_/g, " ")}</div><div style={{ fontFamily: "Georgia,serif", fontSize: 24, color: C.accent }}>{n.to}</div></div>
        </div>
      </div>}
      {res && !res.error && <div style={{ background: C.accentDim + "22", border: `1px solid ${C.accent}44`, borderRadius: 8, padding: 11, marginBottom: 11 }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: C.accent }}>{res.converted}</div>
        {res.summary && <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginTop: 3 }}>{res.summary}</div>}
        {res.dayNote && res.dayNote !== "same day" && <div style={{ fontSize: 10, color: C.warn, fontFamily: "monospace", marginTop: 3 }}>⚠️ {res.dayNote}</div>}
      </div>}
      {res?.error && <div style={{ color: C.danger, fontSize: 12, fontFamily: "monospace", marginBottom: 11 }}>{res.error}</div>}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11 }}>
        <FS label="SET MY DEFAULT TIMEZONE" value={defaultTz} onChange={e => onSetDefault(e.target.value)} style={{ marginBottom: 0 }}>{COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}</FS>
      </div>
    </Modal>
  );
}

function ReminderSettingsPanel({ settings, onChange, onClose, onReqPerm, permStatus }) {
  return (
    <Modal title="Reminders" icon="🔔" onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div><div style={{ color: C.text, fontFamily: "monospace", fontSize: 13 }}>Enable Reminders</div><div style={{ color: C.muted, fontFamily: "monospace", fontSize: 10, marginTop: 2 }}>Browser notifications for events</div></div>
        <Toggle on={settings.enabled} onToggle={() => onChange({ ...settings, enabled: !settings.enabled })} />
      </div>
      {settings.enabled && <>
        <FS label="DEFAULT LEAD TIME" value={settings.minutesBefore} onChange={e => onChange({ ...settings, minutesBefore: Number(e.target.value) })}>
          <option value={5}>5 min before</option><option value={10}>10 min before</option><option value={15}>15 min before</option><option value={30}>30 min before</option><option value={60}>1 hour before</option><option value={1440}>1 day before</option>
        </FS>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11, marginBottom: 11 }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginBottom: 7, letterSpacing: .5 }}>BROWSER PERMISSION</div>
          {permStatus === "granted" ? <div style={{ color: C.accent, fontSize: 12, fontFamily: "monospace" }}>✅ Notifications enabled</div> : permStatus === "denied" ? <div style={{ color: C.danger, fontSize: 12, fontFamily: "monospace" }}>❌ Blocked in browser settings</div> : <div><div style={{ color: C.muted, fontSize: 12, fontFamily: "monospace", marginBottom: 7 }}>Permission not yet granted.</div><Btn onClick={onReqPerm} small>🔔 Allow</Btn></div>}
        </div>
      </>}
      <div style={{ color: C.muted, fontSize: 11, fontFamily: "monospace", lineHeight: 1.6 }}>Per-event reminders can be set individually when creating each event.</div>
    </Modal>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function BugCalendar() {
  const today = new Date(), todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());
  const [view, setView] = useState("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [dayKey, setDayKey] = useState(todayKey);
  const [weekStart, setWeekStart] = useState(startOfWeek(todayKey));
  const [events, setEvents] = useState([]);
  const [holidays, setHolidays] = useState({});
  const [gStatus, setGStatus] = useState("idle"); const [gMsg, setGMsg] = useState("");
  const groundedYears = useRef(new Set());
  const [modal, setModal] = useState(null);
  const [holModal, setHolModal] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTz, setShowTz] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [reminderSettings, setReminderSettings] = useState({ enabled: false, minutesBefore: 15 });
  const [userTz, setUserTz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [notifPerm, setNotifPerm] = useState(() => "Notification" in window ? Notification.permission : "denied");
  const reminderCleanup = useRef(null);

  useEffect(() => {
    (async () => {
      try { const r = await storageGet("bugcal-v4"); if (r) { if (r.events) setEvents(r.events); if (r.reminderSettings) setReminderSettings(r.reminderSettings); if (r.userTz) setUserTz(r.userTz); } } catch (_) { }
      const h = {}; Object.entries(BASE_HOLIDAYS).forEach(([k, v]) => { h[k] = { name: v, verified: false }; }); setHolidays(h);
    })();
  }, []);

  const persist = useCallback((evs, rs, tz) => { storageSet("bugcal-v4", { events: evs, reminderSettings: rs, userTz: tz }); }, []);

  useEffect(() => {
    if (groundedYears.current.has(year)) return;
    groundedYears.current.add(year);
    setGStatus("loading"); setGMsg(`🔍 Verifying ${year} holidays...`);
    runGroundingAgent(year).then(({ data, verified }) => {
      setHolidays(prev => { const n = { ...prev }; Object.entries(data).forEach(([k, v]) => { n[k] = { name: v, verified }; }); return n; });
      setGStatus(verified ? "done" : "warn"); setGMsg(verified ? `✅ ${year} holidays verified` : `⚠️ Cached ${year} holidays`);
      setTimeout(() => setGStatus("idle"), 5000);
    });
  }, [year]);

  useEffect(() => {
    if (reminderCleanup.current) reminderCleanup.current();
    reminderCleanup.current = startReminderAgent(events, reminderSettings);
    return () => { if (reminderCleanup.current) reminderCleanup.current(); };
  }, [events, reminderSettings]);

  const saveEvents = useCallback(evs => { setEvents(evs); persist(evs, reminderSettings, userTz); }, [reminderSettings, userTz, persist]);
  const updateRS = rs => { setReminderSettings(rs); persist(events, rs, userTz); };
  const updateTz = tz => { setUserTz(tz); persist(events, reminderSettings, tz); };

  const handleSave = f => {
    if (!f.title || !f.date) return;
    const id = f.id || Date.now().toString(), ev = { ...f, id };
    saveEvents(f.id ? events.map(e => e.id === f.id ? ev : e) : [...events, ev]);
    setModal(null);
  };
  const handleDelete = id => { saveEvents(events.filter(e => e.id !== id)); setModal(null); };
  const reqPerm = async () => { if (!("Notification" in window)) return; setNotifPerm(await Notification.requestPermission()); };
  const expanded = expandForMonth(events, year, month);

  // ── Voice command handlers ───────────────────────────────────────────────
  const handleVoiceCreate = useCallback((eventData) => {
    // Open the event form pre-filled from the voice command
    const dateKey = eventData.date || todayKey;
    setModal({ mode: "new", dateKey, prefill: eventData });
  }, [todayKey]);

  const handleVoiceSearch = useCallback((query) => {
    setSearchQuery(query);
    setShowSearch(true);
  }, []);

  const handleVoiceNavigate = useCallback((newView, date) => {
    if (newView && ["month", "week", "day", "agenda", "year"].includes(newView)) setView(newView);
    if (date) { const d = new Date(date + "T00:00:00"); setDayKey(date); setMonth(d.getMonth()); setYear(d.getFullYear()); setWeekStart(startOfWeek(date)); }
  }, []);

  const goBack = () => { if (view === "year") { setYear(y => y - 1); } else if (view === "month") { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); } else if (view === "week") { const d = new Date(weekStart + "T00:00:00"); d.setDate(d.getDate() - 7); setWeekStart(d.toISOString().split("T")[0]); } else if (view === "day") { const d = new Date(dayKey + "T00:00:00"); d.setDate(d.getDate() - 1); const nk = d.toISOString().split("T")[0]; setDayKey(nk); setMonth(d.getMonth()); setYear(d.getFullYear()); } };
  const goFwd = () => { if (view === "year") { setYear(y => y + 1); } else if (view === "month") { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); } else if (view === "week") { const d = new Date(weekStart + "T00:00:00"); d.setDate(d.getDate() + 7); setWeekStart(d.toISOString().split("T")[0]); } else if (view === "day") { const d = new Date(dayKey + "T00:00:00"); d.setDate(d.getDate() + 1); const nk = d.toISOString().split("T")[0]; setDayKey(nk); setMonth(d.getMonth()); setYear(d.getFullYear()); } };
  const goToday = () => { setDayKey(todayKey); setMonth(today.getMonth()); setYear(today.getFullYear()); setWeekStart(startOfWeek(todayKey)); };
  const navLabel = () => { if (view === "year") return `${year}`; if (view === "month") return `${MONTHS[month]} ${year}`; if (view === "week") { const ws = new Date(weekStart + "T00:00:00"), we = new Date(weekStart + "T00:00:00"); we.setDate(we.getDate() + 6); return `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${ws.getMonth() !== we.getMonth() ? MONTHS[we.getMonth()] + " " : ""}${we.getDate()}`; } if (view === "day") { const d = new Date(dayKey + "T00:00:00"); return `${WEEKDAYS_FULL[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; } return "Upcoming"; };
  const openNew = dk => { setModal({ mode: "new", dateKey: dk }); if (view === "day") setDayKey(dk); };
  const openEdit = (ev, dk) => setModal({ mode: "edit", event: events.find(e => e.id === ev.id) || ev, dateKey: dk });
  const gColor = gStatus === "done" ? C.accent : gStatus === "warn" ? C.warn : C.muted;

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at 20% 10%, #1e3018 0%, ${C.bg} 55%)`, fontFamily: "monospace", padding: 14, position: "relative", display: "flex", flexDirection: "column" }}>
      <style>{`
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
        select option{background:${C.card};}
        input[type=date]::-webkit-calendar-picker-indicator,input[type=time]::-webkit-calendar-picker-indicator{filter:invert(.5);}
        @keyframes voiceRipple{0%{transform:scale(1);opacity:.7}100%{transform:scale(3);opacity:0}}
        @keyframes voiceBarA{0%,100%{height:5px}50%{height:22px}}
        @keyframes voiceBarB{0%,100%{height:8px}50%{height:14px}}
        @keyframes voiceBarC{0%,100%{height:4px}50%{height:20px}}
        @keyframes voiceBarD{0%,100%{height:10px}50%{height:6px}}
        @keyframes voiceBarE{0%,100%{height:6px}50%{height:18px}}
        @keyframes voiceBarF{0%,100%{height:4px}50%{height:24px}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .voice-bar:nth-child(1){animation:voiceBarA .7s ease-in-out infinite}
        .voice-bar:nth-child(2){animation:voiceBarF .9s ease-in-out infinite .1s}
        .voice-bar:nth-child(3){animation:voiceBarB .8s ease-in-out infinite .05s}
        .voice-bar:nth-child(4){animation:voiceBarC .6s ease-in-out infinite .15s}
        .voice-bar:nth-child(5){animation:voiceBarE .75s ease-in-out infinite .2s}
        .voice-bar:nth-child(6){animation:voiceBarD .85s ease-in-out infinite .08s}
        .voice-bar:nth-child(7){animation:voiceBarA .7s ease-in-out infinite .3s}
        .voice-bar:nth-child(8){animation:voiceBarF .9s ease-in-out infinite .12s}
        .voice-bar:nth-child(9){animation:voiceBarB .8s ease-in-out infinite .18s}
        .voice-bar:nth-child(10){animation:voiceBarC .6s ease-in-out infinite .06s}
        .voice-bar:nth-child(11){animation:voiceBarE .75s ease-in-out infinite .25s}
        .voice-bar:nth-child(12){animation:voiceBarD .85s ease-in-out infinite .04s}
      `}</style>

      {/* Background bugs */}
      {[{ e: "🦋", t: "3%", r: "1%", s: 55, o: .06 }, { e: "🕷️", t: "18%", l: "0%", s: 70, o: .04 }, { e: "🐛", b: "5%", r: "3%", s: 85, o: .05 }, { e: "🐝", b: "18%", l: "0.5%", s: 60, o: .05 }].map((b, i) => (
        <div key={i} style={{ position: "fixed", top: b.t, bottom: b.b, left: b.l, right: b.r, fontSize: b.s, opacity: b.o, pointerEvents: "none", userSelect: "none", transform: "rotate(-12deg)" }}>{b.e}</div>
      ))}

      <div style={{ maxWidth: 980, margin: "0 auto", width: "100%", flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 28, color: C.accent, lineHeight: 1, letterSpacing: -.5, fontWeight: "bold" }}>🪲 BugCal</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {gStatus !== "idle" && <div style={{ fontSize: 10, color: gColor, fontFamily: "monospace", padding: "4px 8px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5 }}>{gMsg}</div>}
            <Btn variant="ghost" small onClick={() => setShowTz(true)}>🌐 TZ</Btn>
            <Btn variant="ghost" small onClick={() => { setSearchQuery(""); setShowSearch(true); }}>🔍 Search</Btn>
            <Btn variant="ghost" small onClick={() => setShowReminder(true)} style={{ position: "relative" }}>🔔{reminderSettings.enabled && <span style={{ position: "absolute", top: 3, right: 3, width: 5, height: 5, background: C.accent, borderRadius: "50%" }} />}</Btn>
            <Btn onClick={() => openNew(dayKey)}>+ New Event</Btn>
          </div>
        </div>

        {/* Nav + view tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 11, flexWrap: "wrap" }}>
          <button onClick={goBack} style={{ background: "none", border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "4px 11px", cursor: "pointer", fontSize: 15 }}>‹</button>
          <div style={{ fontSize: 16, color: C.white, minWidth: 170, textAlign: "center", fontWeight: "bold" }}>{navLabel()}</div>
          <button onClick={goFwd} style={{ background: "none", border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "4px 11px", cursor: "pointer", fontSize: 15 }}>›</button>
          <button onClick={goToday} style={{ background: "none", border: `1px solid ${C.accentDim}`, color: C.accent, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 10, letterSpacing: .5 }}>TODAY</button>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", padding: "3px 6px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4 }}>🌐 {userTz.split("/").pop().replace(/_/g, " ")}</div>
          <div style={{ display: "flex", gap: 3 }}>
            {[["year", "Year"], ["month", "Month"], ["week", "Week"], ["day", "Day"], ["agenda", "Agenda"]].map(([v, l]) => (
              <VTab key={v} label={l} active={view === v} onClick={() => { setView(v); if (v === "week") setWeekStart(startOfWeek(dayKey)); }} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {view === "year" && <YearView year={year} events={events} holidays={holidays} todayKey={todayKey} onSelectMonth={mi => { setMonth(mi); setView("month"); }} />}
          {view === "month" && <MonthView year={year} month={month} expanded={expanded} holidays={holidays} todayKey={todayKey} onAdd={openNew} onClickEvent={openEdit} onClickHoliday={(h, dk) => setHolModal({ holiday: h, dateKey: dk })} />}
          {view === "week" && <WeekView weekStart={weekStart} events={events} todayKey={todayKey} onAdd={openNew} onClickEvent={openEdit} />}
          {view === "day" && <DayView dateKey={dayKey} events={events} holidays={holidays} todayKey={todayKey} onAdd={openNew} onClickEvent={openEdit} />}
          {view === "agenda" && <AgendaView events={events} holidays={holidays} todayKey={todayKey} onAdd={openNew} onClickEvent={(ev) => openEdit(ev, ev.date)} />}
        </div>

        <div style={{ textAlign: "center", color: C.border, fontSize: 9, marginTop: 9, letterSpacing: .4 }}>
          CLICK YEAR MONTH TO DRILL IN · CLICK DAY TO ADD · CLICK EVENT TO EDIT · ↻ RECURRING · 🎉 HOLIDAY · 🔔 REMINDER · 🎤 VOICE
        </div>
      </div>

      {/* Voice HUD — always rendered, floating bottom-right */}
      <VoiceHUD
        events={events}
        todayKey={todayKey}
        onCreateEvent={handleVoiceCreate}
        onSearch={handleVoiceSearch}
        onNavigate={handleVoiceNavigate}
      />

      {/* Modals */}
      {showSearch && <SearchPanel events={events} initialQuery={searchQuery} onClickEvent={ev => openEdit(ev, ev.date)} onClose={() => setShowSearch(false)} />}
      {showTz && <TimezonePanel onClose={() => setShowTz(false)} defaultTz={userTz} onSetDefault={updateTz} />}
      {showReminder && <ReminderSettingsPanel settings={reminderSettings} onChange={updateRS} onClose={() => setShowReminder(false)} onReqPerm={reqPerm} permStatus={notifPerm} />}
      {holModal && <Modal title="Holiday" icon="🎉" onClose={() => setHolModal(null)}><div style={{ fontSize: 20, color: C.amber, marginBottom: 8, fontWeight: "bold" }}>{holModal.holiday.name}</div><div style={{ fontFamily: "monospace", fontSize: 12, color: C.muted }}>{holModal.dateKey}</div></Modal>}
      {modal && (
        <Modal title={modal.mode === "edit" ? "Edit Event" : "New Event"} icon={modal.mode === "edit" ? "✏️" : "🌿"} wide onClose={() => setModal(null)}>
          <EventForm
            initial={modal.mode === "edit" ? modal.event : { date: modal.dateKey, ...(modal.prefill || {}) }}
            allEvents={events}
            onSave={handleSave}
            onDelete={modal.mode === "edit" ? () => handleDelete(modal.event.id) : null}
            defaultTz={userTz}
          />
        </Modal>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";

// ── Palette ────────────────────────────────────────────────────────────────
const C = { bg: "#0f1a0e", surface: "#162314", card: "#1e2f1b", border: "#2e4a28", accent: "#7ec85a", accentDim: "#4a7a34", amber: "#d4a843", amberDim: "#8a6620", text: "#d4e8c2", muted: "#7a9e6a", danger: "#c05050", warn: "#d4843a", white: "#f0f7ea" };
const BUGS = ["🐛", "🦋", "🐝", "🐞", "🦗", "🪲", "🦟", "🪳", "🐜", "🪰", "🦠", "🕷️"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EVENT_COLORS = ["#7ec85a", "#d4a843", "#c05050", "#5a9ec8", "#c85aaa", "#5ac8b4", "#c8875a", "#a0c85a"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i - 12}pm`);
const COMMON_TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow", "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland", "America/Sao_Paulo", "America/Toronto", "America/Vancouver"];
const BASE_HOLIDAYS = { "2025-01-01": "New Year's Day", "2025-01-20": "MLK Jr. Day", "2025-02-17": "Presidents' Day", "2025-05-26": "Memorial Day", "2025-06-19": "Juneteenth", "2025-07-04": "Independence Day", "2025-09-01": "Labor Day", "2025-10-13": "Columbus Day", "2025-11-11": "Veterans Day", "2025-11-27": "Thanksgiving", "2025-12-25": "Christmas Day", "2026-01-01": "New Year's Day", "2026-01-19": "MLK Jr. Day", "2026-02-16": "Presidents' Day", "2026-05-25": "Memorial Day", "2026-06-19": "Juneteenth", "2026-07-04": "Independence Day", "2026-09-07": "Labor Day", "2026-10-12": "Columbus Day", "2026-11-11": "Veterans Day", "2026-11-26": "Thanksgiving", "2026-12-25": "Christmas Day", "2027-01-01": "New Year's Day", "2027-01-18": "MLK Jr. Day", "2027-02-15": "Presidents' Day", "2027-05-31": "Memorial Day", "2027-06-19": "Juneteenth", "2027-07-04": "Independence Day", "2027-09-06": "Labor Day", "2027-10-11": "Columbus Day", "2027-11-11": "Veterans Day", "2027-11-25": "Thanksgiving", "2027-12-25": "Christmas Day" };

// ── Helpers ────────────────────────────────────────────────────────────────
const toKey = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const getDays = (y, m) => new Date(y, m + 1, 0).getDate();
const getFirstDow = (y, m) => new Date(y, m, 1).getDay();
const timeToMins = t => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmtDate = d => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };
const startOfWeek = s => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split("T")[0]; };

// ── Recurrence ─────────────────────────────────────────────────────────────
function doesOccurOn(ev, ds) {
  const s = new Date(ev.date + "T00:00:00"), c = new Date(ds + "T00:00:00");
  if (c < s) return false;
  if (ev.repeatEnd === "date" && ev.repeatEndDate && c > new Date(ev.repeatEndDate + "T00:00:00")) return false;
  if (!ev.repeat || ev.repeat === "none") return ev.date === ds;
  if (ev.repeat === "daily") return true;
  if (ev.repeat === "weekly") return c.getDay() === s.getDay();
  if (ev.repeat === "biweekly") { const d = Math.round((c - s) / 86400000); return d % 14 === 0; }
  if (ev.repeat === "custom_days") return (ev.repeatDays || []).includes(c.getDay());
  if (ev.repeat === "monthly") return c.getDate() === s.getDate();
  if (ev.repeat === "yearly") return c.getDate() === s.getDate() && c.getMonth() === s.getMonth();
  return false;
}
function countUpTo(ev, ds) {
  const s = new Date(ev.date + "T00:00:00"), e = new Date(ds + "T00:00:00"); let c = 0;
  for (let t = new Date(s); t <= e; t.setDate(t.getDate() + 1))if (doesOccurOn({ ...ev, repeatEnd: ev.repeatEnd === "count" ? "never" : ev.repeatEnd }, t.toISOString().split("T")[0])) c++;
  return c;
}
function getEventsForDate(evs, ds) { return evs.filter(ev => { if (!doesOccurOn(ev, ds)) return false; if (ev.repeatEnd === "count" && ev.repeatCount && countUpTo(ev, ds) > Number(ev.repeatCount)) return false; return true; }); }
function expandForMonth(evs, vy, vm) { const r = {}, days = getDays(vy, vm); for (let d = 1; d <= days; d++) { const k = toKey(vy, vm, d); r[k] = getEventsForDate(evs, k); } return r; }

// ✅ Fixed — routes through the backend proxy
async function aiCall(system, userMsg, extra = {}) {
  const res = await fetch("https://bugcal-513255025979.us-central1.run.app/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },  // ← no API key needed
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      system,
      ...extra,
      messages: [{ role: "user", content: userMsg }]
    })
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("API error:", res.status, JSON.stringify(data));
    throw new Error(`API error ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
  }

  return data.content?.map(c => c.text || "").join("").trim() || "";
}

// ── Existing Agents ────────────────────────────────────────────────────────
async function runConflictAgent(nev, all) {
  if (!nev.time || !nev.date) return null;
  const nm = timeToMins(nev.time), ne = nm + (Number(nev.duration) || 60);
  const cx = all.filter(ev => { if (ev.id === nev.id || !ev.time || !doesOccurOn(ev, nev.date)) return false; const em = timeToMins(ev.time), ee = em + (Number(ev.duration) || 60); return nm < ee && ne > em; });
  if (!cx.length) return null;
  try { const t = await aiCall("Bug-themed conflict detection agent. One charming warning under 20 words.", `"${nev.title}" at ${nev.time} conflicts with: ${cx.map(e => `"${e.title}" at ${e.time}`).join(", ")}`); return t || `⚠️ Overlaps with: ${cx.map(e => e.title).join(", ")}`; }
  catch { return `⚠️ Overlap with: ${cx.map(e => e.title).join(", ")}`; }
}
async function runGroundingAgent(year) {
  try {
    const t = await aiCall("Holiday verification agent. Return ONLY a valid JSON object mapping YYYY-MM-DD to US federal holiday names. No markdown, no explanation.", `US federal holidays for ${year} as JSON with exact dates.`, { tools: [{ type: "web_search_20250305", name: "web_search" }] });
    return { data: JSON.parse(t.replace(/```json|```/g, "").trim()), verified: true };
  } catch { const fb = {}; Object.entries(BASE_HOLIDAYS).forEach(([k, v]) => { if (k.startsWith(String(year))) fb[k] = v; }); return { data: fb, verified: false }; }
}
function startReminderAgent(evs, settings) {
  if (!settings.enabled || !("Notification" in window)) return () => { };
  const fired = new Set();
  const check = () => {
    const now = new Date();
    evs.forEach(ev => {
      if (!ev.time || ev.reminderEnabled === false) return;
      const mb = Number(ev.reminderMinutes || settings.minutesBefore || 15);
      for (let i = 0; i < 2; i++) {
        const d = new Date(now); d.setDate(d.getDate() + i);
        const ds = d.toISOString().split("T")[0];
        if (!doesOccurOn(ev, ds)) continue;
        const et = new Date(ds + "T" + ev.time + ":00"), ms = et - now;
        if (ms > 0 && ms <= mb * 60 * 1000) {
          const key = `${ev.id}-${ds}`;
          if (!fired.has(key)) { fired.add(key); const ml = Math.round(ms / 60000); if (Notification.permission === "granted") new Notification(`🪲 ${ev.bug} ${ev.title}`, { body: ml <= 1 ? "Starting now!" : `Starting in ${ml} min` }); }
        }
      }
    });
  };
  check(); const id = setInterval(check, 30000); return () => clearInterval(id);
}
async function runTimezoneAgent(q) {
  try { const t = await aiCall('Timezone converter. Return ONLY JSON: {"converted":"HH:MM","summary":"brief","dayNote":"same day|next day|previous day"}. No markdown.', q); return JSON.parse(t.replace(/```json|```/g, "").trim()); }
  catch { return { error: "Could not convert" }; }
}

// ── 🎤 Voice Command Agent ─────────────────────────────────────────────────
// Interprets spoken text and returns a structured action for the calendar.
async function runVoiceCommandAgent(transcript, events, todayKey) {
  const today = new Date(todayKey + "T00:00:00");
  const todayStr = todayKey;
  const upcomingContext = [];
  // Gather next 14 days of events as context
  for (let i = 0; i < 14; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const ds = d.toISOString().split("T")[0];
    const evs = getEventsForDate(events, ds);
    evs.forEach(ev => upcomingContext.push(`${ds}: ${ev.title}${ev.time ? " at " + ev.time : ""}`));
  }

  const system = `You are BugCal's voice command agent. Today is ${todayStr} (${WEEKDAYS_FULL[today.getDay()]}).

The user's upcoming events (next 14 days):
${upcomingContext.length ? upcomingContext.join("\n") : "(none scheduled)"}

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
- Return ONLY the JSON. No markdown, no explanation.`;

  try {
    const t = await aiCall(system, `Voice command: "${transcript}"`);
    return JSON.parse(t.replace(/```json|```/g, "").trim());
  } catch (e) {
    return { action: "unknown", speak: "My antennae couldn't quite pick that up. Try saying: add event, what's on today, or search for something." };
  }
}

// ── Text-to-Speech helper ──────────────────────────────────────────────────
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05; u.pitch = 1.0;
  // Prefer a natural-sounding voice
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.name.includes("Samantha") || v.name.includes("Google US English") || v.name.includes("Karen") || v.name.includes("Daniel")) || voices[0];
  if (preferred) u.voice = preferred;
  window.speechSynthesis.speak(u);
}

// ── Storage ────────────────────────────────────────────────────────────────
async function storageGet(key) {
  try { if (window.storage) { const r = await window.storage.get(key); return r?.value ? JSON.parse(r.value) : null; } const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
async function storageSet(key, val) {
  try { if (window.storage) { await window.storage.set(key, JSON.stringify(val)); return; } localStorage.setItem(key, JSON.stringify(val)); } catch { }
}

// ── UI Primitives ──────────────────────────────────────────────────────────
function Modal({ title, icon = "🐛", onClose, children, wide = false }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, maxWidth: wide ? 620 : 460, width: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontFamily: "Georgia,serif", fontSize: 19, color: C.accent }}>{icon} {title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
const iSt = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 11px", color: C.text, fontSize: 13, fontFamily: "monospace", outline: "none", boxSizing: "border-box" };
function FI({ label, ...p }) { return (<div style={{ marginBottom: 12 }}>{label && <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>{label}</label>}<input {...p} style={{ ...iSt, ...p.style }} /></div>); }
function FS({ label, children, ...p }) { return (<div style={{ marginBottom: 12 }}>{label && <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>{label}</label>}<select {...p} style={{ ...iSt, ...p.style }}>{children}</select></div>); }
function Btn({ children, variant = "primary", small = false, ...p }) {
  const bg = variant === "primary" ? C.accent : variant === "danger" ? C.danger : variant === "ghost" ? "transparent" : C.border;
  return (<button {...p} style={{ background: bg, color: variant === "primary" ? C.bg : C.white, border: variant === "ghost" ? `1px solid ${C.border}` : "none", borderRadius: 8, padding: small ? "5px 10px" : "8px 16px", fontSize: small ? 11 : 13, cursor: "pointer", fontFamily: "monospace", fontWeight: "bold", ...p.style }}>{children}</button>);
}
function Pill({ children, active, onClick }) { return (<button onClick={onClick} style={{ background: active ? C.accentDim : "transparent", border: `1px solid ${active ? C.accent : C.border}`, color: active ? C.white : C.muted, borderRadius: 6, padding: "3px 9px", fontSize: 12, cursor: "pointer", fontFamily: "monospace" }}>{children}</button>); }
function Toggle({ on, onToggle }) { return (<button onClick={onToggle} style={{ background: on ? C.accent : C.border, border: "none", borderRadius: 14, width: 42, height: 22, cursor: "pointer", position: "relative", transition: "background .2s", flexShrink: 0 }}><span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, background: C.white, borderRadius: "50%", transition: "left .2s", display: "block" }} /></button>); }
function VTab({ label, active, onClick }) { return (<button onClick={onClick} style={{ background: active ? C.accent : "transparent", color: active ? C.bg : C.muted, border: `1px solid ${active ? C.accent : C.border}`, borderRadius: 7, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "monospace", fontWeight: active ? "bold" : "normal", letterSpacing: .4 }}>{label}</button>); }
function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, below: false });
  const ref = useRef(null);
  const onEnter = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      const below = r.top < 60;
      setPos({ top: below ? r.bottom + 7 : r.top - 7, left: r.left + r.width / 2, below });
    }
    setShow(true);
  };
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }} onMouseEnter={onEnter} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{ position: "fixed", top: pos.top, left: pos.left, transform: pos.below ? "translateX(-50%)" : "translate(-50%, -100%)", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 9px", fontSize: 10, color: C.text, fontFamily: "monospace", whiteSpace: "nowrap", zIndex: 9999, letterSpacing: 0.3, pointerEvents: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
          {text}
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, ...(pos.below ? { bottom: "100%", borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: `5px solid ${C.border}` } : { top: "100%", borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `5px solid ${C.border}` }) }} />
        </div>
      )}
    </div>
  );
}

// ── 🎤 Voice HUD ───────────────────────────────────────────────────────────
// Floating voice button + status banner — the entire voice UX lives here
function VoiceHUD({ events, todayKey, onCreateEvent, onSearch, onNavigate }) {
  const [state, setState] = useState("idle"); // idle | listening | processing | speaking | error | unsupported
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [visible, setVisible] = useState(false);
  const recogRef = useRef(null);
  const timerRef = useRef(null);

  const supported = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
  const micStreamRef = useRef(null); // holds the getUserMedia stream so we can release it

  const isListening = state === "listening";
  const isProcessing = state === "processing";
  const isSpeaking = state === "speaking";
  const isError = state === "error";
  const isRequesting = state === "requesting";

  const micColor = isListening ? C.danger : isProcessing || isSpeaking ? C.amber : isRequesting ? C.amber : C.accent;

  // Release mic stream if we grabbed one via getUserMedia
  const releaseMicStream = () => {
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
  };

  const stopListening = () => {
    if (recogRef.current) { try { recogRef.current.stop(); } catch { } }
    clearTimeout(timerRef.current);
    releaseMicStream();
  };

  const processCommand = async (text) => {
    if (!text.trim()) { setState("idle"); setVisible(false); return; }
    setState("processing");
    setResponse("🕷️ Thinking...");
    try {
      const cmd = await runVoiceCommandAgent(text, events, todayKey);
      const spokenText = cmd.speak || "Done!";
      setResponse(spokenText);
      setState("speaking");
      speak(spokenText);
      if (cmd.action === "create" && cmd.event) setTimeout(() => onCreateEvent(cmd.event), 400);
      else if (cmd.action === "search" && cmd.query) setTimeout(() => onSearch(cmd.query), 400);
      else if (cmd.action === "navigate") setTimeout(() => onNavigate(cmd.view || "month", cmd.date || ""), 400);
      timerRef.current = setTimeout(() => { setState("idle"); setVisible(false); setTranscript(""); setResponse(""); }, 5500);
    } catch {
      setState("error");
      setResponse("Something went wrong. Please try again.");
      speak("Something went wrong. Please try again.");
      timerRef.current = setTimeout(() => { setState("idle"); setVisible(false); }, 4000);
    }
  };

  const startListening = async () => {
    if (!supported) {
      setState("error"); setVisible(true);
      setResponse("Speech recognition isn't available in this browser. Please try Chrome or Edge.");
      return;
    }

    // ── Step 1: explicitly request mic permission via getUserMedia ────────────
    // This is what triggers the OS/browser permission prompt in Firefox and
    // other browsers that don't auto-prompt on SpeechRecognition.start().
    setState("requesting"); setVisible(true); setResponse(""); setTranscript("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream; // we'll stop these tracks after recognition starts
    } catch (err) {
      // User denied, or hardware unavailable
      const denied = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
      setState("error");
      setResponse(denied
        ? "Microphone access was denied. Please allow mic access in your browser settings and try again."
        : "Could not access microphone: " + err.message);
      timerRef.current = setTimeout(() => { setState("idle"); setVisible(false); }, 5000);
      return;
    }

    // ── Step 2: now start speech recognition (permission is already granted) ──
    window.speechSynthesis?.cancel();
    setState("listening"); setTranscript(""); setResponse("");

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = "en-US"; r.interimResults = true; r.maxAlternatives = 1;
    recogRef.current = r;

    r.onresult = e => {
      const interim = Array.from(e.results).map(x => x[0].transcript).join("");
      setTranscript(interim);
      if (e.results[e.results.length - 1].isFinal) { stopListening(); processCommand(interim); }
    };
    r.onerror = e => {
      releaseMicStream();
      if (e.error === "no-speech") { setState("idle"); setVisible(false); }
      else if (e.error === "not-allowed") {
        setState("error"); setVisible(true);
        setResponse("Microphone access was denied. Please allow mic access in your browser settings and try again.");
        timerRef.current = setTimeout(() => { setState("idle"); setVisible(false); }, 5000);
      } else {
        setState("error"); setVisible(true);
        setResponse("Microphone error: " + e.error + ". Please try again.");
        timerRef.current = setTimeout(() => { setState("idle"); setVisible(false); }, 4000);
      }
    };
    r.onend = () => { releaseMicStream(); };
    r.start();

    // Release the getUserMedia stream now — SpeechRecognition has its own handle
    // We do this after a short delay to let the recognizer start cleanly
    setTimeout(() => releaseMicStream(), 300);

    // Auto-stop after 10s if no speech detected
    timerRef.current = setTimeout(() => { stopListening(); setState("idle"); setVisible(false); }, 10000);
  };

  const toggle = () => {
    if (isListening || isRequesting) { stopListening(); setState("idle"); setVisible(false); }
    else if (state === "idle") { startListening(); }
    else { setState("idle"); setVisible(false); setTranscript(""); setResponse(""); window.speechSynthesis?.cancel(); }
  };

  useEffect(() => () => { stopListening(); window.speechSynthesis?.cancel(); }, []);

  const statusIcon = isListening ? "🎙️" : isProcessing ? "🕷️" : isSpeaking ? "🔊" : (isError || state === "unsupported") ? "⚠️" : isRequesting ? "🔑" : "🎤";

  return (
    <>
      {/* Floating mic button */}
      <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 900, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {/* Ripple rings when listening */}
        {isListening && [1, 2, 3].map(i => (
          <div key={i} style={{
            position: "absolute", width: 56, height: 56, borderRadius: "50%", border: `2px solid ${C.danger}`,
            opacity: 0, animation: `voiceRipple ${1 + i * 0.3}s ease-out infinite`, animationDelay: `${i * 0.3}s`, pointerEvents: "none"
          }} />
        ))}
        <button onClick={toggle} title={isListening ? "Stop listening" : "Start voice command"}
          style={{
            width: 56, height: 56, borderRadius: "50%", border: `2px solid ${micColor}`,
            background: isListening ? "rgba(192,80,80,0.18)" : isRequesting || isProcessing || isSpeaking ? "rgba(212,168,67,0.15)" : "rgba(126,200,90,0.1)",
            cursor: "pointer", fontSize: 22, transition: "all .2s", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 ${isListening ? 20 : isRequesting ? 14 : 8}px ${micColor}55`, transform: isListening || isRequesting ? "scale(1.08)" : "scale(1)"
          }}>
          {statusIcon}
        </button>
        <div style={{
          fontSize: 9, color: micColor, fontFamily: "monospace", letterSpacing: .5, textAlign: "center",
          background: C.surface + "cc", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap"
        }}>
          {isListening ? "LISTENING" : isSpeaking ? "SPEAKING" : isProcessing ? "THINKING" : isRequesting ? "ALLOW MIC" : "VOICE"}
        </div>
      </div>

      {/* Voice HUD banner — appears above mic button */}
      {visible && (
        <div style={{
          position: "fixed", bottom: 110, right: 20, zIndex: 900,
          background: C.card, border: `1px solid ${micColor}66`, borderRadius: 14,
          padding: "14px 18px", maxWidth: 310, minWidth: 210,
          boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 20px ${micColor}22`
        }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 16 }}>{statusIcon}</span>
              <span style={{ color: micColor, fontSize: 11, fontFamily: "monospace", letterSpacing: .8, fontWeight: "bold" }}>
                {isRequesting ? "ALLOW MIC..." : isListening ? "LISTENING..." : isProcessing ? "THINKING..." : isSpeaking ? "SPEAKING..." : isError ? "ERROR" : "VOICE"}
              </span>
            </div>
            <button onClick={() => { stopListening(); setState("idle"); setVisible(false); setTranscript(""); setResponse(""); window.speechSynthesis?.cancel(); }}
              style={{ background: "none", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>

          {/* Permission request prompt */}
          {isRequesting && (
            <div style={{
              background: "rgba(212,168,67,0.1)", border: `1px solid ${C.amber}44`, borderRadius: 8,
              padding: "9px 11px", marginBottom: 8, fontSize: 12, color: C.amber, fontFamily: "monospace", lineHeight: 1.6
            }}>
              🔑 Your browser is asking for microphone permission.<br />
              <span style={{ fontSize: 11, color: C.muted }}>Click <strong style={{ color: C.white }}>Allow</strong> in the prompt to continue.</span>
            </div>
          )}

          {/* Waveform visualizer when listening */}
          {isListening && (
            <div style={{ display: "flex", alignItems: "center", gap: 3, height: 28, marginBottom: 10, justifyContent: "center" }}>
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} style={{
                  width: 3, background: C.danger, borderRadius: 2,
                  animation: `voiceBar 0.8s ease-in-out infinite`,
                  animationDelay: `${i * 0.07}s`,
                  minHeight: 4
                }} />
              ))}
            </div>
          )}

          {/* Transcript (live) */}
          {transcript && (
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "7px 10px", marginBottom: 8, fontSize: 12, color: C.text, fontFamily: "monospace",
              fontStyle: "italic", lineHeight: 1.5
            }}>
              "{transcript}"
            </div>
          )}

          {/* AI response / error */}
          {response && response !== "🕷️ Thinking..." && (
            <div style={{ fontSize: 12, color: isError ? C.danger : isSpeaking ? C.amber : C.text, fontFamily: "monospace", lineHeight: 1.6 }}>
              {isSpeaking && <span style={{ marginRight: 5 }}>🔊</span>}
              {isError && <span style={{ marginRight: 5 }}>⚠️</span>}
              {response}
            </div>
          )}
          {response === "🕷️ Thinking..." && (
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>🕷️</span> Thinking...
            </div>
          )}

          {/* Voice command hints */}
          {state === "idle" && !response && (
            <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", lineHeight: 1.7 }}>
              Try saying:<br />
              <span style={{ color: C.accent }}>"Add dentist appointment Friday at 3pm"</span><br />
              <span style={{ color: C.accent }}>"What's on my schedule today?"</span><br />
              <span style={{ color: C.accent }}>"Search for standup"</span><br />
              <span style={{ color: C.accent }}>"Switch to week view"</span>
            </div>
          )}
        </div>
      )}

      {/* Inject keyframe animations */}
      <style>{`
        @keyframes voiceRipple{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.8);opacity:0}}
        @keyframes voiceBar{0%,100%{height:4px}50%{height:${Math.random() * 16 + 8}px}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes voiceBarA{0%,100%{height:5px}50%{height:22px}}
        @keyframes voiceBarB{0%,100%{height:8px}50%{height:14px}}
        @keyframes voiceBarC{0%,100%{height:4px}50%{height:20px}}
        @keyframes voiceBarD{0%,100%{height:10px}50%{height:6px}}
        @keyframes voiceBarE{0%,100%{height:6px}50%{height:18px}}
        @keyframes voiceBarF{0%,100%{height:4px}50%{height:24px}}
      `}</style>
    </>
  );
}

// ── Search Panel (now also accepts a prefilled query) ──────────────────────
// ── Year View ──────────────────────────────────────────────────────────────
function YearView({ year, events, holidays, todayKey, onSelectMonth }) {
  const todayY = parseInt(todayKey.slice(0, 4)), todayM = parseInt(todayKey.slice(5, 7)) - 1, todayD = parseInt(todayKey.slice(8, 10));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, flex: 1, overflowY: "auto", paddingRight: 2 }}>
      {MONTHS.map((mName, mi) => {
        const days = getDays(year, mi), fdow = getFirstDow(year, mi);
        const isCurrentMonth = year === todayY && mi === todayM;
        // Gather a lightweight map: day→{hasEvent,hasHoliday,colors}
        const dayData = {};
        for (let d = 1; d <= days; d++) {
          const k = toKey(year, mi, d);
          const evs = getEventsForDate(events, k);
          const hol = holidays[k];
          if (evs.length || hol) dayData[d] = { evs, hol };
        }
        return (
          <div key={mi} onClick={() => onSelectMonth(mi)}
            style={{
              background: C.card, border: `1px solid ${isCurrentMonth ? C.accent : C.border}`, borderRadius: 10,
              padding: "8px 7px", cursor: "pointer", transition: "background .15s", userSelect: "none"
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.surface}
            onMouseLeave={e => e.currentTarget.style.background = C.card}>
            {/* Month name */}
            <div style={{
              fontFamily: "Georgia,serif", fontSize: 12, fontWeight: "bold",
              color: isCurrentMonth ? C.accent : C.white, marginBottom: 5, letterSpacing: .3
            }}>
              {mName}
            </div>
            {/* Day-of-week header */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 2 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} style={{ textAlign: "center", fontSize: 7, color: C.muted, fontFamily: "monospace" }}>{d}</div>
              ))}
            </div>
            {/* Day grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "1px 0" }}>
              {Array.from({ length: fdow }).map((_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: days }).map((_, i) => {
                const d = i + 1;
                const isToday = year === todayY && mi === todayM && d === todayD;
                const data = dayData[d];
                const hasEvent = data?.evs?.length > 0;
                const hasHoliday = !!data?.hol;
                const dotColor = data?.evs?.[0]?.color || C.accent;
                return (
                  <div key={d} style={{
                    position: "relative", textAlign: "center",
                    width: "100%", paddingBottom: "100%"/* square cells */
                  }}>
                    <div style={{
                      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 1
                    }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 8, fontFamily: "monospace", lineHeight: 1,
                        background: isToday ? C.accent : "transparent",
                        color: isToday ? C.bg : hasEvent ? C.white : C.muted,
                        fontWeight: isToday || hasEvent ? "bold" : "normal",
                      }}>{d}</div>
                      {/* dot row: event dot + holiday dot */}
                      <div style={{ display: "flex", gap: 1, height: 4, alignItems: "center" }}>
                        {hasEvent && <div style={{ width: 3, height: 3, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />}
                        {hasHoliday && <div style={{ width: 3, height: 3, borderRadius: "50%", background: C.amber, flexShrink: 0 }} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Monthly event count badge */}
            {Object.values(dayData).some(d => d.evs?.length) && (
              <div style={{ marginTop: 4, fontSize: 8, color: C.muted, fontFamily: "monospace", textAlign: "right" }}>
                {Object.values(dayData).reduce((s, d) => s + (d.evs?.length || 0), 0)} event{Object.values(dayData).reduce((s, d) => s + (d.evs?.length || 0), 0) !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SearchPanel({ events, onClickEvent, onClose, initialQuery = "" }) {
  const [q, setQ] = useState(initialQuery); const [fc, setFc] = useState(""); const [fr, setFr] = useState(""); const [fb, setFb] = useState("");
  const res = events.filter(ev => {
    if (q && !ev.title.toLowerCase().includes(q.toLowerCase()) && !ev.note?.toLowerCase().includes(q.toLowerCase())) return false;
    if (fc && ev.color !== fc) return false; if (fr && ev.repeat !== fr) return false; if (fb && ev.bug !== fb) return false; return true;
  }).sort((a, b) => a.date < b.date ? -1 : 1);
  return (
    <Modal title="Search & Filter" icon="🔍" onClose={onClose} wide>
      <div style={{ position: "relative", marginBottom: 12 }}><input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Search title or notes..." style={{ ...iSt, paddingLeft: 30 }} /><span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 13 }}>🔍</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginBottom: 12 }}>
        <div>
          <label style={{ display: "block", color: C.muted, fontSize: 10, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>COLOR</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <div onClick={() => setFc("")} style={{ width: 18, height: 18, borderRadius: "50%", background: C.border, cursor: "pointer", outline: !fc ? `2px solid ${C.white}` : "none", outlineOffset: 2 }} />
            {EVENT_COLORS.map(col => <div key={col} onClick={() => setFc(fc === col ? "" : col)} style={{ width: 18, height: 18, borderRadius: "50%", background: col, cursor: "pointer", outline: fc === col ? `2px solid ${C.white}` : "none", outlineOffset: 2 }} />)}
          </div>
        </div>
        <div>
          <label style={{ display: "block", color: C.muted, fontSize: 10, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>REPEAT</label>
          <select value={fr} onChange={e => setFr(e.target.value)} style={{ ...iSt, padding: "4px 7px", fontSize: 11 }}>
            <option value="">Any</option><option value="none">One-time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="custom_days">Custom</option>
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", color: C.muted, fontSize: 10, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>BUG</label>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          <button onClick={() => setFb("")} style={{ background: !fb ? C.accentDim : "transparent", border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 6px", cursor: "pointer", fontSize: 11, color: C.muted }}>All</button>
          {BUGS.map(b => <button key={b} onClick={() => setFb(fb === b ? "" : b)} style={{ fontSize: 13, background: fb === b ? C.accentDim : "transparent", border: `1px solid ${fb === b ? C.accent : C.border}`, borderRadius: 4, padding: "1px 3px", cursor: "pointer" }}>{b}</button>)}
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginBottom: 7, letterSpacing: .5 }}>{res.length} RESULT{res.length !== 1 ? "S" : ""}</div>
      <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
        {!res.length && <div style={{ textAlign: "center", padding: 24, color: C.muted, fontFamily: "monospace" }}>🦠 No matches</div>}
        {res.map(ev => (
          <div key={ev.id} onClick={() => { onClickEvent(ev); onClose(); }} style={{ background: ev.color + "18", border: `1px solid ${ev.color}44`, borderRadius: 7, padding: "7px 11px", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = ev.color + "2e"} onMouseLeave={e => e.currentTarget.style.background = ev.color + "18"}>
            <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <span style={{ fontSize: 17, flexShrink: 0 }}>{ev.bug}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "Georgia,serif", fontSize: 13, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginTop: 1 }}>{fmtDate(ev.date)}{ev.time ? ` · ${ev.time}` : ""}{ev.repeat && ev.repeat !== "none" ? " · ↻ " + ev.repeat : ""}</div>
              </div>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: ev.color, flexShrink: 0 }} />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Event Form ─────────────────────────────────────────────────────────────
const EMPTY = { title: "", date: "", time: "", endTime: "", duration: "60", bug: "🐛", color: "#7ec85a", repeat: "none", repeatDays: [], repeatEnd: "never", repeatEndDate: "", repeatCount: "", note: "", reminderEnabled: true, reminderMinutes: "15", timezone: "" };

function EventForm({ initial = {}, allEvents = [], onSave, onDelete, defaultTz = "" }) {
  const [f, setF] = useState({ ...EMPTY, timezone: defaultTz, ...initial, repeatDays: initial.repeatDays || [] });
  const [ai, setAi] = useState(""); const [aiL, setAiL] = useState(false);
  const [conflict, setConflict] = useState(null); const [ck, setCk] = useState(false);
  const tmr = useRef(null);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const togDay = d => set("repeatDays", f.repeatDays.includes(d) ? f.repeatDays.filter(x => x !== d) : [...f.repeatDays, d]);

  useEffect(() => {
    if (!f.time || !f.date) { setConflict(null); return; }
    clearTimeout(tmr.current); setCk(true);
    tmr.current = setTimeout(async () => { setConflict(await runConflictAgent(f, allEvents)); setCk(false); }, 700);
    return () => clearTimeout(tmr.current);
  }, [f.time, f.date, f.duration]);

  const parseAI = async () => {
    if (!ai.trim()) return; setAiL(true);
    const today = new Date().toISOString().split("T")[0];
    try {
      const t = await aiCall(`Scheduling parser. Today is ${today}. Return ONLY JSON: {title,date(YYYY-MM-DD),time(HH:MM or ""),duration(mins),repeat("none"|"daily"|"weekly"|"biweekly"|"monthly"|"yearly"|"custom_days"),repeatDays([0-6]),repeatEnd("never"|"date"|"count"),repeatEndDate(YYYY-MM-DD or ""),repeatCount(number or ""),note(""),bug(from:🐛🦋🐝🐞🦗🪲🦟🪳🐜🪰🦠🕷️)}. If cannot parse: {"error":"reason"}`, ai);
      const p = JSON.parse(t.replace(/```json|```/g, "").trim());
      if (p.error) throw new Error(p.error);
      setF(prev => ({ ...prev, ...p, repeatDays: p.repeatDays || prev.repeatDays })); setAi("");
    } catch { setAi('⚠️ Try: "dentist every Mon at 2pm for 45 min"'); }
    setAiL(false);
  };

  return (
    <div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: 11, marginBottom: 14 }}>
        <div style={{ color: C.amber, fontSize: 10, marginBottom: 6, fontFamily: "monospace", letterSpacing: 1 }}>🦋 DESCRIBE YOUR EVENT — AI CREATES IT</div>
        <div style={{ display: "flex", gap: 7 }}>
          <input value={ai} onChange={e => setAi(e.target.value)} onKeyDown={e => e.key === "Enter" && parseAI()} placeholder='e.g. "standup Mon/Wed/Fri at 9am for 30 min"' style={{ ...iSt, flex: 1, fontSize: 12, padding: "7px 10px" }} />
          <Tooltip text="Type your event in plain English and AI will fill in all the fields">
            <Btn onClick={parseAI} small>{aiL ? "🔄" : "🐝"}</Btn>
          </Tooltip>
        </div>
      </div>
      <FI label="EVENT TITLE" value={f.title} onChange={e => set("title", e.target.value)} placeholder="Butterfly migration watch..." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
        <FI label="DATE" type="date" value={f.date} onChange={e => set("date", e.target.value)} />
        <FI label="START TIME" type="time" value={f.time} onChange={e => { set("time", e.target.value); if (f.endTime && e.target.value) { const s = timeToMins(e.target.value), en = timeToMins(f.endTime); if (en > s) set("duration", String(en - s)); } }} />
        <FI label="END TIME" type="time" value={f.endTime || ""} onChange={e => { set("endTime", e.target.value); if (f.time && e.target.value) { const s = timeToMins(f.time), en = timeToMins(e.target.value); if (en > s) set("duration", String(en - s)); } }} />
      </div>
      <FS label="EVENT TIMEZONE" value={f.timezone} onChange={e => set("timezone", e.target.value)}>
        <option value="">— Use default —</option>
        {COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
      </FS>
      {ck && <div style={{ background: "#1e1408", border: `1px solid ${C.warn}44`, borderRadius: 7, padding: "6px 11px", marginBottom: 10, fontSize: 11, color: C.amberDim, fontFamily: "monospace" }}>🕷️ Checking for conflicts...</div>}
      {conflict && !ck && <div style={{ background: "#221406", border: `1px solid ${C.warn}`, borderRadius: 7, padding: "8px 11px", marginBottom: 10, fontSize: 12, color: "#f0a060", fontFamily: "monospace" }}>⚠️ {conflict}</div>}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>BUG MASCOT</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{BUGS.map(b => <button key={b} onClick={() => set("bug", b)} style={{ fontSize: 18, background: f.bug === b ? C.accentDim : "transparent", border: `1px solid ${f.bug === b ? C.accent : C.border}`, borderRadius: 6, padding: "2px 5px", cursor: "pointer" }}>{b}</button>)}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 4, fontFamily: "monospace", letterSpacing: .6 }}>COLOR</label>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{EVENT_COLORS.map(col => <div key={col} onClick={() => set("color", col)} style={{ width: 22, height: 22, borderRadius: "50%", background: col, cursor: "pointer", outline: f.color === col ? `3px solid ${C.white}` : "3px solid transparent", outlineOffset: 2 }} />)}</div>
      </div>
      <FS label="REPEAT" value={f.repeat} onChange={e => set("repeat", e.target.value)}>
        <option value="none">Does not repeat</option><option value="daily">Every day</option>
        <option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option>
        <option value="monthly">Every month</option><option value="yearly">Every year</option>
        <option value="custom_days">Custom days</option>
      </FS>
      {f.repeat === "custom_days" && <div style={{ marginBottom: 12 }}><label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 5, fontFamily: "monospace", letterSpacing: .6 }}>REPEAT ON</label><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{WEEKDAYS_SHORT.map((d, i) => <Pill key={d} active={f.repeatDays.includes(i)} onClick={() => togDay(i)}>{d}</Pill>)}</div></div>}
      {f.repeat !== "none" && <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 5, fontFamily: "monospace", letterSpacing: .6 }}>ENDS</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
          <Pill active={f.repeatEnd === "never"} onClick={() => set("repeatEnd", "never")}>♾️ Never</Pill>
          <Pill active={f.repeatEnd === "date"} onClick={() => set("repeatEnd", "date")}>📅 On date</Pill>
          <Pill active={f.repeatEnd === "count"} onClick={() => set("repeatEnd", "count")}>🔢 After N</Pill>
        </div>
        {f.repeatEnd === "date" && <FI label="END DATE" type="date" value={f.repeatEndDate} onChange={e => set("repeatEndDate", e.target.value)} />}
        {f.repeatEnd === "count" && <FI label="OCCURRENCES" type="number" min="1" value={f.repeatCount} onChange={e => set("repeatCount", e.target.value)} placeholder="e.g. 10" />}
        {f.repeatEnd === "never" && <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", padding: "5px 9px", background: C.surface, borderRadius: 5, border: `1px solid ${C.border}` }}>♾️ Repeats indefinitely</div>}
      </div>}
      <div style={{ marginBottom: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <label style={{ color: C.muted, fontSize: 11, fontFamily: "monospace", letterSpacing: .6 }}>🔔 REMINDER</label>
          <Toggle on={f.reminderEnabled !== false} onToggle={() => set("reminderEnabled", f.reminderEnabled === false)} />
        </div>
        {f.reminderEnabled !== false && <FS value={f.reminderMinutes || "15"} onChange={e => set("reminderMinutes", e.target.value)} style={{ marginBottom: 0 }}>
          <option value="5">5 min before</option><option value="10">10 min before</option>
          <option value="15">15 min before</option><option value="30">30 min before</option>
          <option value="60">1 hour before</option><option value="1440">1 day before</option>
        </FS>}
      </div>
      <FI label="NOTES" value={f.note} onChange={e => set("note", e.target.value)} placeholder="Extra details..." />
      <div style={{ display: "flex", gap: 9, marginTop: 6, flexWrap: "wrap" }}>
        <Btn onClick={() => { if (f.title && f.date) onSave(f); }}>🪲 Save</Btn>
        {onDelete && <Btn variant="danger" onClick={onDelete}>🗑 Delete</Btn>}
      </div>
      {(!f.title || !f.date) && <div style={{ fontSize: 11, color: C.muted, marginTop: 5, fontFamily: "monospace" }}>Title and date required.</div>}
    </div>
  );
}

// ── Calendar Views ─────────────────────────────────────────────────────────
function MonthView({ year, month, expanded, holidays, todayKey, onAdd, onClickEvent, onClickHoliday }) {
  const days = getDays(year, month), fdow = getFirstDow(year, month);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 3 }}>
        {WEEKDAYS_SHORT.map(d => <div key={d} style={{ textAlign: "center", color: C.muted, fontSize: 10, padding: "2px 0", letterSpacing: 2, fontWeight: "bold" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {Array.from({ length: fdow }).map((_, i) => <div key={`b${i}`} style={{ height: 96 }} />)}
        {Array.from({ length: days }).map((_, i) => {
          const d = i + 1, k = toKey(year, month, d), isT = k === todayKey, evs = expanded[k] || [], hol = holidays[k];
          return (
            <div key={k} onClick={() => onAdd(k)} style={{ height: 96, background: C.card, border: `${isT ? 2 : 1}px solid ${isT ? C.accent : C.border}`, borderRadius: 8, padding: "4px 6px", cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column", transition: "background .1s" }}
              onMouseEnter={e => e.currentTarget.style.background = C.surface} onMouseLeave={e => e.currentTarget.style.background = C.card}>
              <div style={{ fontFamily: "Georgia,serif", fontSize: 13, flexShrink: 0, color: isT ? C.accent : C.text, fontWeight: isT ? "700" : "400", marginBottom: 2, lineHeight: 1 }}>{d}</div>
              {hol && <div onClick={e => { e.stopPropagation(); onClickHoliday(hol, k); }} style={{ fontSize: 9, color: C.amber, fontFamily: "monospace", flexShrink: 0, marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", borderRadius: 3, padding: "1px 3px", background: C.amberDim + "22", border: `1px solid ${C.amberDim}44` }}>🎉 {hol.name.length > 13 ? hol.name.slice(0, 12) + "…" : hol.name}</div>}
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 2, minHeight: 0 }}>
                {evs.slice(0, 3).map((ev, i) => (
                  <div key={ev.id + i} onClick={e => { e.stopPropagation(); onClickEvent(ev, k); }} style={{ background: ev.color + "28", border: `1px solid ${ev.color}66`, borderRadius: 3, flexShrink: 0, padding: "1px 4px", fontSize: 10, color: C.white, height: 16, lineHeight: "14px", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 2, overflow: "hidden", whiteSpace: "nowrap", cursor: "pointer" }}>
                    <span style={{ flexShrink: 0 }}>{ev.bug}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{ev.time ? ev.time + " · " : ""}{ev.title}{ev.repeat && ev.repeat !== "none" ? <span style={{ opacity: .5 }}> ↻</span> : null}</span>
                  </div>
                ))}
                {evs.length > 3 && <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", lineHeight: 1 }}>+{evs.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function WeekView({ weekStart, events, todayKey, onAdd, onClickEvent }) {
  const CH = 44, days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "46px repeat(7,1fr)", borderBottom: `1px solid ${C.border}`, paddingBottom: 5, flexShrink: 0 }}>
        <div />
        {days.map(d => {
          const dt = new Date(d + "T00:00:00"), isT = d === todayKey; return (
            <div key={d} style={{ textAlign: "center", padding: "3px 0" }}>
              <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: 1 }}>{WEEKDAYS_SHORT[dt.getDay()]}</div>
              <div style={{ fontFamily: "Georgia,serif", fontSize: 16, color: isT ? C.accent : C.text, fontWeight: isT ? "700" : "400", background: isT ? C.accentDim + "44" : "transparent", borderRadius: "50%", width: 26, height: 26, lineHeight: "26px", margin: "1px auto 0" }}>{dt.getDate()}</div>
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "46px repeat(7,1fr)", minHeight: CH * 24 }}>
          <div style={{ position: "relative" }}>{HOUR_LABELS.map((l, i) => <div key={i} style={{ position: "absolute", top: i * CH - 6, right: 3, fontSize: 8, color: C.muted, fontFamily: "monospace", whiteSpace: "nowrap" }}>{l}</div>)}</div>
          {days.map(d => {
            const de = getEventsForDate(events, d).filter(e => e.time);
            return (
              <div key={d} onClick={() => onAdd(d)} style={{ position: "relative", borderLeft: `1px solid ${C.border}22`, cursor: "pointer", minHeight: CH * 24 }} onMouseEnter={e => e.currentTarget.style.background = C.surface + "33"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {Array.from({ length: 24 }, (_, i) => <div key={i} style={{ position: "absolute", top: i * CH, left: 0, right: 0, borderTop: `1px solid ${C.border}${i === 0 ? "" : "22"}`, pointerEvents: "none" }} />)}
                {de.map((ev, i) => {
                  const top = timeToMins(ev.time) / 60 * CH, h = Math.max((Number(ev.duration) || 60) / 60 * CH, 16); return (
                    <div key={ev.id + i} onClick={e => { e.stopPropagation(); onClickEvent(ev, d); }} style={{ position: "absolute", top, left: 1, right: 1, height: h, background: ev.color + "cc", borderLeft: `3px solid ${ev.color}`, borderRadius: 3, padding: "1px 3px", fontSize: 9, color: C.bg, fontFamily: "monospace", overflow: "hidden", cursor: "pointer", zIndex: 2, fontWeight: "bold" }}>{ev.bug} {ev.time} {ev.title}</div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayView({ dateKey, events, holidays, todayKey, onAdd, onClickEvent }) {
  const CH = 52, de = getEventsForDate(events, dateKey), timed = de.filter(e => e.time), allDay = de.filter(e => !e.time);
  const dt = new Date(dateKey + "T00:00:00"), hol = holidays[dateKey];
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ textAlign: "center", padding: "8px 0 7px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 22, color: dateKey === todayKey ? C.accent : C.white }}>{WEEKDAYS_FULL[dt.getDay()]}, {MONTHS[dt.getMonth()]} {dt.getDate()}, {dt.getFullYear()}</div>
        {hol && <div style={{ color: C.amber, fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>🎉 {hol.name}</div>}
        {allDay.length > 0 && <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap", marginTop: 7 }}>{allDay.map(ev => <div key={ev.id} onClick={() => onClickEvent(ev, dateKey)} style={{ background: ev.color + "33", border: `1px solid ${ev.color}`, borderRadius: 4, padding: "1px 8px", fontSize: 11, color: C.white, cursor: "pointer", fontFamily: "monospace" }}>{ev.bug} {ev.title}</div>)}</div>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", minHeight: CH * 24 }}>
          <div style={{ position: "relative" }}>{HOUR_LABELS.map((l, i) => <div key={i} style={{ position: "absolute", top: i * CH - 7, right: 6, fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{l}</div>)}</div>
          <div onClick={() => onAdd(dateKey)} style={{ position: "relative", cursor: "pointer", borderLeft: `1px solid ${C.border}` }}>
            {Array.from({ length: 24 }, (_, i) => <div key={i} style={{ position: "absolute", top: i * CH, left: 0, right: 0, borderTop: `1px solid ${C.border}${i === 0 ? "" : "33"}`, height: CH, pointerEvents: "none" }} />)}
            {timed.map((ev, i) => {
              const top = timeToMins(ev.time) / 60 * CH, h = Math.max((Number(ev.duration) || 60) / 60 * CH, 26); return (
                <div key={ev.id + i} onClick={e => { e.stopPropagation(); onClickEvent(ev, dateKey); }} style={{ position: "absolute", top, left: 6, right: 6, height: h, background: ev.color + "dd", borderLeft: `4px solid ${ev.color}`, borderRadius: 6, padding: "3px 9px", color: C.bg, fontFamily: "monospace", overflow: "hidden", cursor: "pointer", zIndex: 2 }}>
                  <div style={{ fontWeight: "bold", fontSize: 12 }}>{ev.bug} {ev.title}</div>
                  <div style={{ fontSize: 10, opacity: .8 }}>{ev.time}{ev.endTime ? ` – ${ev.endTime}` : ""}{ev.note ? ` · ${ev.note}` : ""}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgendaView({ events, holidays, todayKey, onAdd, onClickEvent, daysAhead = 90 }) {
  const today = new Date(todayKey + "T00:00:00"), items = [];
  for (let i = 0; i < daysAhead; i++) { const d = new Date(today); d.setDate(d.getDate() + i); const k = d.toISOString().split("T")[0]; const evs = getEventsForDate(events, k), hol = holidays[k]; if (evs.length || hol) items.push({ key: k, evs, hol, dt: d }); }
  if (!items.length) return (<div style={{ textAlign: "center", padding: 50, color: C.muted, fontFamily: "monospace" }}>🐛 No upcoming events.<div style={{ marginTop: 14 }}><Btn onClick={() => onAdd(todayKey)}>+ Add Event</Btn></div></div>);
  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: 3 }}>
      {items.map(({ key, evs, hol, dt }) => (
        <div key={key} style={{ display: "flex", gap: 14, marginBottom: 3 }}>
          <div style={{ minWidth: 64, textAlign: "right", paddingTop: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: .5 }}>{WEEKDAYS_SHORT[dt.getDay()]}</div>
            <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: key === todayKey ? C.accent : C.text, lineHeight: 1 }}>{dt.getDate()}</div>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{MONTHS[dt.getMonth()].slice(0, 3)}</div>
          </div>
          <div style={{ flex: 1, borderLeft: `2px solid ${C.border}`, paddingLeft: 12, paddingTop: 7, paddingBottom: 7 }}>
            {hol && <div style={{ fontSize: 11, color: C.amber, fontFamily: "monospace", marginBottom: 5 }}>🎉 {hol.name}</div>}
            {evs.map(ev => (
              <div key={ev.id} onClick={() => onClickEvent(ev, key)} style={{ background: ev.color + "18", border: `1px solid ${ev.color}44`, borderRadius: 7, padding: "7px 11px", marginBottom: 5, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = ev.color + "2e"} onMouseLeave={e => e.currentTarget.style.background = ev.color + "18"}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 17, flexShrink: 0 }}>{ev.bug}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "Georgia,serif", fontSize: 14, color: C.white }}>{ev.title}</div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginTop: 2 }}>{ev.time ? `${ev.time}${ev.endTime ? ` – ${ev.endTime}` : ""} · ` : "All day · "}{ev.repeat && ev.repeat !== "none" ? "↻ · " : ""}{ev.timezone || ""}</div>
                    {ev.note && <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginTop: 1, fontStyle: "italic" }}>{ev.note}</div>}
                  </div>
                  {ev.reminderEnabled !== false && <span style={{ fontSize: 11, opacity: .4, flexShrink: 0 }}>🔔</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimezonePanel({ onClose, defaultTz, onSetDefault }) {
  const [from, setFrom] = useState(defaultTz || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [to, setTo] = useState("America/New_York");
  const [t, setT] = useState("09:00"); const [res, setRes] = useState(null); const [ld, setLd] = useState(false);
  const convert = async () => { setLd(true); setRes(null); const r = await runTimezoneAgent(`Convert ${t} from ${from} to ${to}.`); setRes(r); setLd(false); };
  const native = () => { try { const d = new Date(); const [h, m] = t.split(":").map(Number); d.setHours(h, m, 0, 0); return { from: d.toLocaleTimeString("en-US", { timeZone: from, hour: "2-digit", minute: "2-digit" }), to: d.toLocaleTimeString("en-US", { timeZone: to, hour: "2-digit", minute: "2-digit" }) }; } catch { return null; } };
  const n = native();
  return (
    <Modal title="Timezone Converter" icon="🌐" onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 9, alignItems: "end", marginBottom: 14 }}>
        <FS label="FROM" value={from} onChange={e => setFrom(e.target.value)} style={{ marginBottom: 0 }}>{COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}</FS>
        <div style={{ textAlign: "center", color: C.muted, fontSize: 20, paddingBottom: 9 }}>→</div>
        <FS label="TO" value={to} onChange={e => setTo(e.target.value)} style={{ marginBottom: 0 }}>{COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}</FS>
      </div>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-end", marginBottom: 14 }}>
        <FI label="TIME" type="time" value={t} onChange={e => setT(e.target.value)} style={{ marginBottom: 0, flex: 1 }} />
        <Btn onClick={convert} style={{ flexShrink: 0 }}>{ld ? "🔄..." : "🌐 Convert"}</Btn>
      </div>
      {n && <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 11 }}>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginBottom: 7, letterSpacing: .5 }}>⚡ INSTANT</div>
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{from.split("/").pop().replace(/_/g, " ")}</div><div style={{ fontFamily: "Georgia,serif", fontSize: 24, color: C.text }}>{n.from}</div></div>
          <div style={{ color: C.muted, fontSize: 20 }}>→</div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{to.split("/").pop().replace(/_/g, " ")}</div><div style={{ fontFamily: "Georgia,serif", fontSize: 24, color: C.accent }}>{n.to}</div></div>
        </div>
      </div>}
      {res && !res.error && <div style={{ background: C.accentDim + "22", border: `1px solid ${C.accent}44`, borderRadius: 8, padding: 11, marginBottom: 11 }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: C.accent }}>{res.converted}</div>
        {res.summary && <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginTop: 3 }}>{res.summary}</div>}
        {res.dayNote && res.dayNote !== "same day" && <div style={{ fontSize: 10, color: C.warn, fontFamily: "monospace", marginTop: 3 }}>⚠️ {res.dayNote}</div>}
      </div>}
      {res?.error && <div style={{ color: C.danger, fontSize: 12, fontFamily: "monospace", marginBottom: 11 }}>{res.error}</div>}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11 }}>
        <FS label="SET MY DEFAULT TIMEZONE" value={defaultTz} onChange={e => onSetDefault(e.target.value)} style={{ marginBottom: 0 }}>{COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}</FS>
      </div>
    </Modal>
  );
}

function ReminderSettingsPanel({ settings, onChange, onClose, onReqPerm, permStatus }) {
  return (
    <Modal title="Reminders" icon="🔔" onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div><div style={{ color: C.text, fontFamily: "monospace", fontSize: 13 }}>Enable Reminders</div><div style={{ color: C.muted, fontFamily: "monospace", fontSize: 10, marginTop: 2 }}>Browser notifications for events</div></div>
        <Toggle on={settings.enabled} onToggle={() => onChange({ ...settings, enabled: !settings.enabled })} />
      </div>
      {settings.enabled && <>
        <FS label="DEFAULT LEAD TIME" value={settings.minutesBefore} onChange={e => onChange({ ...settings, minutesBefore: Number(e.target.value) })}>
          <option value={5}>5 min before</option><option value={10}>10 min before</option><option value={15}>15 min before</option><option value={30}>30 min before</option><option value={60}>1 hour before</option><option value={1440}>1 day before</option>
        </FS>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11, marginBottom: 11 }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginBottom: 7, letterSpacing: .5 }}>BROWSER PERMISSION</div>
          {permStatus === "granted" ? <div style={{ color: C.accent, fontSize: 12, fontFamily: "monospace" }}>✅ Notifications enabled</div> : permStatus === "denied" ? <div style={{ color: C.danger, fontSize: 12, fontFamily: "monospace" }}>❌ Blocked in browser settings</div> : <div><div style={{ color: C.muted, fontSize: 12, fontFamily: "monospace", marginBottom: 7 }}>Permission not yet granted.</div><Btn onClick={onReqPerm} small>🔔 Allow</Btn></div>}
        </div>
      </>}
      <div style={{ color: C.muted, fontSize: 11, fontFamily: "monospace", lineHeight: 1.6 }}>Per-event reminders can be set individually when creating each event.</div>
    </Modal>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function BugCalendar() {
  const today = new Date(), todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());
  const [view, setView] = useState("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [dayKey, setDayKey] = useState(todayKey);
  const [weekStart, setWeekStart] = useState(startOfWeek(todayKey));
  const [events, setEvents] = useState([]);
  const [holidays, setHolidays] = useState({});
  const [gStatus, setGStatus] = useState("idle"); const [gMsg, setGMsg] = useState("");
  const groundedYears = useRef(new Set());
  const [modal, setModal] = useState(null);
  const [holModal, setHolModal] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTz, setShowTz] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [reminderSettings, setReminderSettings] = useState({ enabled: false, minutesBefore: 15 });
  const [userTz, setUserTz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [notifPerm, setNotifPerm] = useState(() => "Notification" in window ? Notification.permission : "denied");
  const reminderCleanup = useRef(null);

  useEffect(() => {
    (async () => {
      try { const r = await storageGet("bugcal-v4"); if (r) { if (r.events) setEvents(r.events); if (r.reminderSettings) setReminderSettings(r.reminderSettings); if (r.userTz) setUserTz(r.userTz); } } catch (_) { }
      const h = {}; Object.entries(BASE_HOLIDAYS).forEach(([k, v]) => { h[k] = { name: v, verified: false }; }); setHolidays(h);
    })();
  }, []);

  const persist = useCallback((evs, rs, tz) => { storageSet("bugcal-v4", { events: evs, reminderSettings: rs, userTz: tz }); }, []);

  useEffect(() => {
    if (groundedYears.current.has(year)) return;
    groundedYears.current.add(year);
    setGStatus("loading"); setGMsg(`🔍 Verifying ${year} holidays...`);
    runGroundingAgent(year).then(({ data, verified }) => {
      setHolidays(prev => { const n = { ...prev }; Object.entries(data).forEach(([k, v]) => { n[k] = { name: v, verified }; }); return n; });
      setGStatus(verified ? "done" : "warn"); setGMsg(verified ? `✅ ${year} holidays verified` : `⚠️ Cached ${year} holidays`);
      setTimeout(() => setGStatus("idle"), 5000);
    });
  }, [year]);

  useEffect(() => {
    if (reminderCleanup.current) reminderCleanup.current();
    reminderCleanup.current = startReminderAgent(events, reminderSettings);
    return () => { if (reminderCleanup.current) reminderCleanup.current(); };
  }, [events, reminderSettings]);

  const saveEvents = useCallback(evs => { setEvents(evs); persist(evs, reminderSettings, userTz); }, [reminderSettings, userTz, persist]);
  const updateRS = rs => { setReminderSettings(rs); persist(events, rs, userTz); };
  const updateTz = tz => { setUserTz(tz); persist(events, reminderSettings, tz); };

  const handleSave = f => {
    if (!f.title || !f.date) return;
    const id = f.id || Date.now().toString(), ev = { ...f, id };
    saveEvents(f.id ? events.map(e => e.id === f.id ? ev : e) : [...events, ev]);
    setModal(null);
  };
  const handleDelete = id => { saveEvents(events.filter(e => e.id !== id)); setModal(null); };
  const reqPerm = async () => { if (!("Notification" in window)) return; setNotifPerm(await Notification.requestPermission()); };
  const expanded = expandForMonth(events, year, month);

  // ── Voice command handlers ───────────────────────────────────────────────
  const handleVoiceCreate = useCallback((eventData) => {
    // Open the event form pre-filled from the voice command
    const dateKey = eventData.date || todayKey;
    setModal({ mode: "new", dateKey, prefill: eventData });
  }, [todayKey]);

  const handleVoiceSearch = useCallback((query) => {
    setSearchQuery(query);
    setShowSearch(true);
  }, []);

  const handleVoiceNavigate = useCallback((newView, date) => {
    if (newView && ["month", "week", "day", "agenda", "year"].includes(newView)) setView(newView);
    if (date) { const d = new Date(date + "T00:00:00"); setDayKey(date); setMonth(d.getMonth()); setYear(d.getFullYear()); setWeekStart(startOfWeek(date)); }
  }, []);

  const goBack = () => { if (view === "year") { setYear(y => y - 1); } else if (view === "month") { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); } else if (view === "week") { const d = new Date(weekStart + "T00:00:00"); d.setDate(d.getDate() - 7); setWeekStart(d.toISOString().split("T")[0]); } else if (view === "day") { const d = new Date(dayKey + "T00:00:00"); d.setDate(d.getDate() - 1); const nk = d.toISOString().split("T")[0]; setDayKey(nk); setMonth(d.getMonth()); setYear(d.getFullYear()); } };
  const goFwd = () => { if (view === "year") { setYear(y => y + 1); } else if (view === "month") { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); } else if (view === "week") { const d = new Date(weekStart + "T00:00:00"); d.setDate(d.getDate() + 7); setWeekStart(d.toISOString().split("T")[0]); } else if (view === "day") { const d = new Date(dayKey + "T00:00:00"); d.setDate(d.getDate() + 1); const nk = d.toISOString().split("T")[0]; setDayKey(nk); setMonth(d.getMonth()); setYear(d.getFullYear()); } };
  const goToday = () => { setDayKey(todayKey); setMonth(today.getMonth()); setYear(today.getFullYear()); setWeekStart(startOfWeek(todayKey)); };
  const navLabel = () => { if (view === "year") return `${year}`; if (view === "month") return `${MONTHS[month]} ${year}`; if (view === "week") { const ws = new Date(weekStart + "T00:00:00"), we = new Date(weekStart + "T00:00:00"); we.setDate(we.getDate() + 6); return `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${ws.getMonth() !== we.getMonth() ? MONTHS[we.getMonth()] + " " : ""}${we.getDate()}`; } if (view === "day") { const d = new Date(dayKey + "T00:00:00"); return `${WEEKDAYS_FULL[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; } return "Upcoming"; };
  const openNew = dk => { setModal({ mode: "new", dateKey: dk }); if (view === "day") setDayKey(dk); };
  const openEdit = (ev, dk) => setModal({ mode: "edit", event: events.find(e => e.id === ev.id) || ev, dateKey: dk });
  const gColor = gStatus === "done" ? C.accent : gStatus === "warn" ? C.warn : C.muted;

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at 20% 10%, #1e3018 0%, ${C.bg} 55%)`, fontFamily: "monospace", padding: 14, position: "relative", display: "flex", flexDirection: "column" }}>
      <style>{`
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
        select option{background:${C.card};}
        input[type=date]::-webkit-calendar-picker-indicator,input[type=time]::-webkit-calendar-picker-indicator{filter:invert(.5);}
        @keyframes voiceRipple{0%{transform:scale(1);opacity:.7}100%{transform:scale(3);opacity:0}}
        @keyframes voiceBarA{0%,100%{height:5px}50%{height:22px}}
        @keyframes voiceBarB{0%,100%{height:8px}50%{height:14px}}
        @keyframes voiceBarC{0%,100%{height:4px}50%{height:20px}}
        @keyframes voiceBarD{0%,100%{height:10px}50%{height:6px}}
        @keyframes voiceBarE{0%,100%{height:6px}50%{height:18px}}
        @keyframes voiceBarF{0%,100%{height:4px}50%{height:24px}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .voice-bar:nth-child(1){animation:voiceBarA .7s ease-in-out infinite}
        .voice-bar:nth-child(2){animation:voiceBarF .9s ease-in-out infinite .1s}
        .voice-bar:nth-child(3){animation:voiceBarB .8s ease-in-out infinite .05s}
        .voice-bar:nth-child(4){animation:voiceBarC .6s ease-in-out infinite .15s}
        .voice-bar:nth-child(5){animation:voiceBarE .75s ease-in-out infinite .2s}
        .voice-bar:nth-child(6){animation:voiceBarD .85s ease-in-out infinite .08s}
        .voice-bar:nth-child(7){animation:voiceBarA .7s ease-in-out infinite .3s}
        .voice-bar:nth-child(8){animation:voiceBarF .9s ease-in-out infinite .12s}
        .voice-bar:nth-child(9){animation:voiceBarB .8s ease-in-out infinite .18s}
        .voice-bar:nth-child(10){animation:voiceBarC .6s ease-in-out infinite .06s}
        .voice-bar:nth-child(11){animation:voiceBarE .75s ease-in-out infinite .25s}
        .voice-bar:nth-child(12){animation:voiceBarD .85s ease-in-out infinite .04s}
      `}</style>

      {/* Background bugs */}
      {[{ e: "🦋", t: "3%", r: "1%", s: 55, o: .06 }, { e: "🕷️", t: "18%", l: "0%", s: 70, o: .04 }, { e: "🐛", b: "5%", r: "3%", s: 85, o: .05 }, { e: "🐝", b: "18%", l: "0.5%", s: 60, o: .05 }].map((b, i) => (
        <div key={i} style={{ position: "fixed", top: b.t, bottom: b.b, left: b.l, right: b.r, fontSize: b.s, opacity: b.o, pointerEvents: "none", userSelect: "none", transform: "rotate(-12deg)" }}>{b.e}</div>
      ))}

      <div style={{ maxWidth: 980, margin: "0 auto", width: "100%", flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 28, color: C.accent, lineHeight: 1, letterSpacing: -.5, fontWeight: "bold" }}>🪲 BugCal</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {gStatus !== "idle" && <div style={{ fontSize: 10, color: gColor, fontFamily: "monospace", padding: "4px 8px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5 }}>{gMsg}</div>}
            <Btn variant="ghost" small onClick={() => setShowTz(true)}>🌐 TZ</Btn>
            <Tooltip text="Search and filter events by title, notes, color, repeat type, or bug">
              <Btn variant="ghost" small onClick={() => { setSearchQuery(""); setShowSearch(true); }}>🔍 Search</Btn>
            </Tooltip>
            <Tooltip text="Set up browser notifications to remind you before events">
              <Btn variant="ghost" small onClick={() => setShowReminder(true)} style={{ position: "relative" }}>🔔{reminderSettings.enabled && <span style={{ position: "absolute", top: 3, right: 3, width: 5, height: 5, background: C.accent, borderRadius: "50%" }} />}</Btn>
            </Tooltip>
            <Btn onClick={() => openNew(dayKey)}>+ New Event</Btn>
          </div>
        </div>

        {/* Nav + view tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 11, flexWrap: "wrap" }}>
          <button onClick={goBack} style={{ background: "none", border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "4px 11px", cursor: "pointer", fontSize: 15 }}>‹</button>
          <div style={{ fontSize: 16, color: C.white, minWidth: 170, textAlign: "center", fontWeight: "bold" }}>{navLabel()}</div>
          <button onClick={goFwd} style={{ background: "none", border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "4px 11px", cursor: "pointer", fontSize: 15 }}>›</button>
          <button onClick={goToday} style={{ background: "none", border: `1px solid ${C.accentDim}`, color: C.accent, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 10, letterSpacing: .5 }}>TODAY</button>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", padding: "3px 6px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4 }}>🌐 {userTz.split("/").pop().replace(/_/g, " ")}</div>
          <div style={{ display: "flex", gap: 3 }}>
            {[["year", "Year", ""], ["month", "Month", ""], ["week", "Week", ""], ["day", "Day", ""], ["agenda", "Agenda", "Chronological list of all upcoming events for the next 90 days"]].map(([v, l, tip]) => (
              tip ? (
                <Tooltip key={v} text={tip}>
                  <VTab label={l} active={view === v} onClick={() => { setView(v); if (v === "week") setWeekStart(startOfWeek(dayKey)); }} />
                </Tooltip>
              ) : (
                <VTab key={v} label={l} active={view === v} onClick={() => { setView(v); if (v === "week") setWeekStart(startOfWeek(dayKey)); }} />
              )
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {view === "year" && <YearView year={year} events={events} holidays={holidays} todayKey={todayKey} onSelectMonth={mi => { setMonth(mi); setView("month"); }} />}
          {view === "month" && <MonthView year={year} month={month} expanded={expanded} holidays={holidays} todayKey={todayKey} onAdd={openNew} onClickEvent={openEdit} onClickHoliday={(h, dk) => setHolModal({ holiday: h, dateKey: dk })} />}
          {view === "week" && <WeekView weekStart={weekStart} events={events} todayKey={todayKey} onAdd={openNew} onClickEvent={openEdit} />}
          {view === "day" && <DayView dateKey={dayKey} events={events} holidays={holidays} todayKey={todayKey} onAdd={openNew} onClickEvent={openEdit} />}
          {view === "agenda" && <AgendaView events={events} holidays={holidays} todayKey={todayKey} onAdd={openNew} onClickEvent={(ev) => openEdit(ev, ev.date)} />}
        </div>

        <div style={{ textAlign: "center", color: C.border, fontSize: 9, marginTop: 9, letterSpacing: .4 }}>
          CLICK YEAR MONTH TO DRILL IN · CLICK DAY TO ADD · CLICK EVENT TO EDIT · ↻ RECURRING · 🎉 HOLIDAY · 🔔 REMINDER · 🎤 VOICE
        </div>
      </div>

      {/* Voice HUD — always rendered, floating bottom-right */}
      <VoiceHUD
        events={events}
        todayKey={todayKey}
        onCreateEvent={handleVoiceCreate}
        onSearch={handleVoiceSearch}
        onNavigate={handleVoiceNavigate}
      />

      {/* Modals */}
      {showSearch && <SearchPanel events={events} initialQuery={searchQuery} onClickEvent={ev => openEdit(ev, ev.date)} onClose={() => setShowSearch(false)} />}
      {showTz && <TimezonePanel onClose={() => setShowTz(false)} defaultTz={userTz} onSetDefault={updateTz} />}
      {showReminder && <ReminderSettingsPanel settings={reminderSettings} onChange={updateRS} onClose={() => setShowReminder(false)} onReqPerm={reqPerm} permStatus={notifPerm} />}
      {holModal && <Modal title="Holiday" icon="🎉" onClose={() => setHolModal(null)}><div style={{ fontSize: 20, color: C.amber, marginBottom: 8, fontWeight: "bold" }}>{holModal.holiday.name}</div><div style={{ fontFamily: "monospace", fontSize: 12, color: C.muted }}>{holModal.dateKey}</div></Modal>}
      {modal && (
        <Modal title={modal.mode === "edit" ? "Edit Event" : "New Event"} icon={modal.mode === "edit" ? "✏️" : "🌿"} wide onClose={() => setModal(null)}>
          <EventForm
            initial={modal.mode === "edit" ? modal.event : { date: modal.dateKey, ...(modal.prefill || {}) }}
            allEvents={events}
            onSave={handleSave}
            onDelete={modal.mode === "edit" ? () => handleDelete(modal.event.id) : null}
            defaultTz={userTz}
          />
        </Modal>
      )}
    </div>
  );
}
