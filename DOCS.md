# Bipolar Bear — Technical Documentation

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Technical Specification](#2-technical-specification)
3. [Algorithm Flowcharts](#3-algorithm-flowcharts)
4. [Mood Suggestion — How It Works](#4-mood-suggestion--how-it-works)

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML/CSS/JavaScript — no framework, no build step |
| **Pages** | `journal.html`, `survival-kit.html`, `index.html`, `beta.html` |
| **Database** | Firebase Firestore (NoSQL, real-time sync) |
| **Authentication** | Firebase Auth (email/password + anonymous) |
| **Native wrapper** | Capacitor 8 (iOS + Android WebView) |
| **Health data** | iOS HealthKit via `@flomentumsolutions/capacitor-health-extended` |
| **Offline storage** | Firestore offline persistence + `localStorage` cache |
| **PDF export** | jsPDF (client-side, no server) |
| **Notifications** | Capacitor Local Notifications |
| **PWA** | Web App Manifest + service worker (offline-capable) |
| **Hosting** | ProtonDrive (static files) |

### Why no framework?

The app runs inside a Capacitor WebView where bundle size, cold start time and network access matter. A single self-contained HTML file loads instantly from disk, requires no bundler, and avoids the complexity of a SPA router operating inside a native shell.

---

## 2. Technical Specification

### 2.1 Pages & Responsibilities

```
index.html          Home screen — navigation hub, entry tick, logo easter egg
journal.html        Core journal: mood logging, stats, calendar, focused mode
survival-kit.html   Survival guide: definitions, coping, medications, memories
beta.html           Password gate for web preview (Capacitor bypasses this)
```

### 2.2 Data Architecture

#### Firestore Collections

```
entries/
  {docId}
    userId        string   — Firebase Auth UID
    date          string   — ISO 8601 e.g. "2025-03-22T00:00:00.000Z"
    mood          string   — "manic" | "elevated" | "stable" | "low" | "depressed"
    energy        number   — 0 | 3 | 5 | 7 | 10
    sleep         number   — 5 | 6.5 | 7.5 | 8.5 | 10
    medication    string?  — "taken" | "not-taken"
    goals         string?  — "completed" | "some" | "none"
    budget        string?  — "yes" | "no"
    exercise      string?  — "yes" | "no"
    outside       string?  — "yes" | "no"
    anxiety       string?  — "high" | "medium" | "low"
    stress        string?  — "high" | "medium" | "low"
    irritability  string?  — "yes" | "medium" | "no"
    alcohol       string?  — "yes" | "no"
    notes         string?  — free text journal entry
    steps         number?  — step count from HealthKit
    pdfHidden     bool     — exclude from PDF export
    favourite     bool     — starred entry
    customFields  object   — user-defined extra fields { [id]: "yes"|"no" }
    timestamp     number   — ms since epoch (for ordering)
    recordedAt    string   — ISO timestamp of when the form was submitted
    recordedTz    string   — IANA timezone e.g. "Europe/London"

userSettings/
  {uid}
    dailyGoals        string[]     — user's daily goal list
    currentMedList    {name,dosage}[] — medication list
    moodDefinitions   object       — per-mood personal definitions
    copingStrategies  object       — per-mood coping strategies
    logoVariant       number       — 0|1|2 (easter egg logo index)
    firstName         string?      — deprecated; name now from personalDetails

personalDetails/
  {uid}
    personalName               string
    personalDOB                string
    personalMedicalNum         string
    personalDiagnosis          string
    personalDiagnosisDate      string
    personalAddress            string
    personalMobile             string
    personalEmail              string
    personalEmergencyContact   string
    personalNotes              string

counters/
  peopleHelped
    count   number   — global increment counter
```

#### localStorage Keys (cache / offline / settings)

```
bb_entryStatus          {key, done}   — today's/yesterday's entry status cache
bb_draft                object        — autosaved form state
bbPinEnabled            "1"           — PIN lock enabled
bbPinHash               string        — SHA-256 of PIN
journalDefaultToday     "true"|null   — log today vs yesterday
focusedModeEnabled      "true"|null   — focused mode on/off
showMoodSuggestion      "1"|"0"       — mood suggestion toggle
moreDataOpenByDefault   "true"|null   — expand extra fields by default
achievementToastsEnabled "true"|null  — achievement toast toggle
unlockedAchievements    JSON array    — list of unlocked achievement IDs
personalName            string        — cached from Firestore
personalEmergencyContact string       — cached from Firestore
currentMedList          JSON array    — cached medication list
dailyGoals              JSON array    — cached goals
logoVariant             "0"|"1"|"2"   — cached logo variant
statsStartDate          string        — custom stats window start
pdfHideByDefault        "true"|null   — default PDF hide setting
bbWebUnlocked           "true"        — beta gate bypass
bbFirstName             string        — deprecated
```

### 2.3 Navigation Model

All inter-page navigation uses `location.replace()` rather than `href` links. This prevents the browser's back/forward cache (bfcache) from restoring a stale Firestore connection when navigating back — critical in Capacitor's WKWebView.

```
index.html  ──replace()──▶  journal.html
index.html  ──replace()──▶  survival-kit.html
journal.html  ──replace()──▶  /  (index)
survival-kit.html  ──replace()──▶  /  (index)
survival-kit.html  ──replace()──▶  journal.html
```

`pagehide` event on each page calls `db.terminate()` to release the IndexedDB lock before navigation, preventing lock contention on the destination page.

### 2.4 Firestore Reliability Pattern

```
Persistence:  enablePersistence({ synchronizeTabs: false })
              — single-tab exclusive lock, acquired instantly
              — synchronizeTabs:true adds 3-5s leader election (broken in Capacitor)

Cache read:   1s Promise.race timeout (guards IndexedDB lock contention)
Server read:  3s timeout on first attempt
              8s on retry (_isRetry flag)
              12s after forced reload (sessionStorage.bbReload = '1')

Retry flow:   Show "🔄 Reconnecting…" → wait 2s → retry with 8s timeout
              If retry also fails → set sessionStorage.bbReload → reload page
```

### 2.5 Authentication Flow

```
Anonymous auth  →  used for People Helped counter (Firestore rules require auth != null)
Email/password  →  full account with Firestore sync
Guest mode      →  entries stored in localStorage as entry:{timestamp}
Migration       →  on first sign-in, guest localStorage entries are batch-uploaded
                   to Firestore (only if account has 0 existing entries)
```

### 2.6 PIN Lock

- PIN stored as **SHA-256 hash** in `localStorage.bbPinHash` — plaintext never persisted
- Session unlock stored in `sessionStorage.bbPinUnlocked`
- `sessionStorage` is cleared on `pagehide`, so PIN is required every time the page is opened (not just on app restart)
- Enabled/disabled via `localStorage.bbPinEnabled = "1"`

### 2.7 Health Data Sync (iOS)

```
Plugin:   @flomentumsolutions/capacitor-health-extended
Data:     Sleep duration  →  selectedSleep bucket (5 / 6.5 / 7.5 / 8.5 / 10h)
          Step count      →  entry.steps (shown inline with energy)

Timing:   Sleep sync reads from last night's HealthKit records
          Valid if sleep ended within 36 hours (prevents stale data)
          Steps sync runs on page load for recent dates

Guard:    _healthSyncInProgress flag prevents form navigation during async sync
```

### 2.8 Focused Mode

A step-by-step entry wizard, built as an alternative to the full form.

```
Step sequence (default):
  mood → energy → sleep → medication → [optional extras] → notes → done

Extras (shown if enabled in More Data settings):
  goals, budget, exercise, outside, anxiety+stress+irritability, alcohol

Step rendering:   _renderFocusedStep()  ─▶  _fmRenderContent(step)
Step navigation:  _fmGoTo(index)  /  _fmNext()  /  _fmBack()  /  _fmSkip()
High-water mark:  _fmHighWater — furthest step reached (controls summary chips)
Edit mode:        _openEditInFocusedMode(entry) — starts at done step, all steps pre-filled
Change detection: _editOriginalState snapshot + _hasEditChanges() comparison
                  → "Close" (grey) if no changes, "Update entry" (orange) if changed
```

---

## 3. Algorithm Flowcharts

### 3.1 Entry Save Flow

```
User clicks Save
      │
      ▼
showSaveConfirmModal()
      │
      ├─ editingEntry && no changes? ──▶ cancelEdit() ──▶ loadEntries()  [DONE]
      │
      ▼
Render summary (mood, energy, sleep, extras, notes)
Show modal
      │
User clicks "Save ✨" / "Update entry ✏️"
      │
      ▼
saveAndOpenJournal()
      │
      ▼
saveEntry()  [async]
      ├─ Build entry object from selected* variables
      ├─ currentUser?  ──YES──▶  Firestore: add() or set() on existing doc
      │                ──NO───▶  localStorage: entry:{timestamp}
      ├─ clearDraft()
      ├─ resetEntryForm()
      ├─ loadEntries()  ←── refreshes stats + entries list
      └─ nativeHaptic('success')
      │
      ▼
Open journalCard (if closed)
Scroll to #stats after 150ms  ←── deferred so DOM settles after loadEntries
```

### 3.2 Page Load & Entry Status (index.html)

```
Page loads
      │
      ├── IIFE runs synchronously
      │     ├─ Check localStorage bb_entryStatus
      │     │     ├─ key matches today/yesterday AND done=true?  ──▶ show tick  [DONE]
      │     │     └─ no match → continue
      │     └─ Scan entry:* localStorage keys (guest mode)
      │           └─ match found?  ──▶ show tick  [DONE]
      │
      └── Firebase onAuthStateChanged fires  [async]
            │
            ├─ user signed in?
            │     ├─ bb_entryStatus cache done=true for today? ──▶ skip query  [DONE]
            │     └─ Query Firestore: all entries where userId == uid
            │           ├─ find entry matching target date?  ──▶ set tick + cache  [DONE]
            │           └─ no match  ──▶ clear tick
            │
            └─ not signed in → show Sign In button
```

### 3.3 Firestore Load with Retry (journal.html)

```
loadEntries()
      │
      ├─ Try cache (1s timeout)
      │     ├─ Success  ──▶ render with cached data  ──▶ also fetch server in bg
      │     └─ Timeout/fail  ──▶ show spinner, try server
      │
      ├─ Try server (3s timeout, or 8s if _isRetry, or 12s if isPostFailureReload)
      │     ├─ Success  ──▶ render, update cache
      │     └─ Fail
      │           │
      │           ▼
      │     _isRetry already set?
      │           ├─ YES  ──▶ set sessionStorage.bbReload = '1'
      │           │              window.location.reload()
      │           └─ NO   ──▶ retryLoadEntries()
      │                         show "🔄 Reconnecting…"
      │                         wait 2s, retry with _isRetry=true
      │
      └─ finally: hide spinners, show journal toggle button, _doInitialScroll()
```

### 3.4 Edit Entry Change Detection

```
openEditInForm(entry)  or  _openEditInFocusedMode(entry)
      │
      ├─ _captureEditState(entry)  ──▶  store JSON snapshot as _editOriginalState
      │
      └─ Populate form from entry values

User interacts with form
      │
      ▼
Event listener on entryFormCard (click / input / change)  [captured, bubbling]
      │
      ▼
_updateEditBtn()
      │
      ├─ _hasEditChanges()
      │     └─ JSON.stringify(_editCurrentState()) !== JSON.stringify(_editOriginalState)
      │
      ├─ Changes detected  ──▶ "Update entry ✏️"  (orange)
      └─ No changes        ──▶ "Close"             (grey)

User clicks button
      │
      ├─ "Close" (no changes)  ──▶  cancelEdit()  ──▶  loadEntries()
      └─ "Update entry"         ──▶  showSaveConfirmModal()  ──▶  saveEntry()
```

---

## 4. Mood Suggestion — How It Works

The mood suggestion is a **normalised weighted score** calculated from the fields the user has answered. Unanswered fields are excluded entirely — the possible range shrinks to match what was actually logged, so a missing field never pulls the result towards stable.

### 4.1 Scoring Table

Each answered field contributes a raw score within a defined range:

| Field | Response | Score | Range |
|---|---|---|---|
| **Energy** | Not enough (0) | −50 | −50 … +50 |
| | Less than usual (3) | −8 | |
| | Normal (5) | 0 | |
| | More than usual (7) | +8 | |
| | Too much (10) | +50 | |
| **Sleep** | ≤5h | +20 | −15 … +20 |
| | 6–7h | +5 | |
| | 7–8h | 0 | |
| | 8–9h | −8 | |
| | 9+h | −15 | |
| **Medication** | Taken | −8 | −8 … +8 |
| | Not taken | +8 | |
| **Irritability** | More than usual | +8 | −4 … +8 |
| | Normal | 0 | |
| | Less than usual | −4 | |
| **Anxiety** | High | −10 | −10 … +5 |
| | Normal | 0 | |
| | Low | +5 | |
| **Stress** | High | −8 | −8 … +4 |
| | Normal | 0 | |
| | Low | +4 | |
| **Alcohol** | Yes | +8 | 0 … +8 |
| | No | 0 | |
| **Goals** | Completed | +5 | −5 … +5 |
| | Some | 0 | |
| | None | −5 | |
| **Steps** | ≥15,000 | +10 | −10 … +10 |
| | 8,000–14,999 | +4 | |
| | 3,000–7,999 | 0 | |
| | 1,000–2,999 | −5 | |
| | <1,000 | −10 | |

> **Direction:** Positive scores indicate manic/elevated signals (high energy, poor sleep, irritability, alcohol). Negative scores indicate depressed signals (low energy, long sleep, high anxiety/stress).

### 4.2 Normalisation Formula

```
total    = sum of all answered field scores
maxPoss  = sum of all answered fields' maximum values
minPoss  = sum of all answered fields' minimum values
range    = maxPoss − minPoss

normalised = ((total − minPoss) / range) × 200 − 100
```

This maps the result to **−100 … +100**, relative to the fields that were actually answered.

### 4.3 Mood Thresholds

```
normalised ≥  60  →  Manic
normalised ≥  25  →  Elevated
normalised ≥ −25  →  Stable
normalised ≥ −60  →  Low
normalised  < −60  →  Depressed
```

### 4.4 Worked Example

**Scenario:** User logs the following responses:

| Field | Response | Score | Min | Max |
|---|---|---|---|---|
| Energy | Too much (10) | +50 | −50 | +50 |
| Sleep | ≤5h | +20 | −15 | +20 |
| Medication | Not taken | +8 | −8 | +8 |
| Irritability | More than usual | +8 | −4 | +8 |
| Anxiety | Low | +5 | −10 | +5 |

**Step 1 — Sum the scores:**
```
total = 50 + 20 + 8 + 8 + 5 = 91
```

**Step 2 — Sum the ranges:**
```
maxPoss = 50 + 20 + 8 + 8 + 5 = 91
minPoss = −50 + −15 + −8 + −4 + −10 = −87
range   = 91 − (−87) = 178
```

**Step 3 — Normalise:**
```
normalised = ((91 − (−87)) / 178) × 200 − 100
           = (178 / 178) × 200 − 100
           = 200 − 100
           = 100
```

**Result:** `100 ≥ 60` → **Manic**

---

**Scenario 2:** More moderate responses:

| Field | Response | Score | Min | Max |
|---|---|---|---|---|
| Energy | Normal (5) | 0 | −50 | +50 |
| Sleep | 7–8h | 0 | −15 | +20 |
| Medication | Taken | −8 | −8 | +8 |
| Anxiety | Normal | 0 | −10 | +5 |

**Step 1:**
```
total = 0 + 0 + −8 + 0 = −8
```

**Step 2:**
```
maxPoss = 50 + 20 + 8 + 5 = 83
minPoss = −50 + −15 + −8 + −10 = −83
range   = 83 − (−83) = 166
```

**Step 3:**
```
normalised = ((−8 − (−83)) / 166) × 200 − 100
           = (75 / 166) × 200 − 100
           = 90.4 − 100
           = −9.6  →  rounded to −10
```

**Result:** `−10` falls in `−25 … +25` → **Stable**

---

### 4.5 Design Decisions

**Why exclude unanswered fields rather than score them as 0?**
Scoring missing fields as 0 would treat them as "normal" responses and bias the result towards stable. A user who only answers energy and sleep gets a result based purely on those two signals — their possible range is just ±70, not ±100.

**Why are energy extremes (0/10) scored at ±50 but middle values (3/7) only ±8?**
Very high or very low energy are among the strongest clinical indicators of a mood episode. A mild deviation from normal energy is much less diagnostic. The non-linear scale ensures extremes dominate appropriately without middle-ground values overwhelming other signals.

**Why does medication taken score negative (−8)?**
The score axis is manic (+) / depressed (−). Medication adherence is a stabilising/grounding behaviour — it signals the depressed direction on this axis, not because medication causes depression, but because it counteracts the manic signals.

**Why is this labelled BETA?**
This is a pattern-recognition heuristic, not a clinical diagnostic tool. It is designed to prompt self-reflection and spark conversation, not to replace professional assessment.
