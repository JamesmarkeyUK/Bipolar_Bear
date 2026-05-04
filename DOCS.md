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
| **Pages** | `index.html`, `journal.html`, `survival-kit.html`, `anonymous.html`, `beta.html` |
| **Shared JS** | `fab.js` — FAB dock system loaded on every app page |
| **Database** | Firebase Firestore (NoSQL, real-time sync) |
| **Authentication** | Firebase Auth (email/password) |
| **Backend** | Firebase Cloud Functions v2 (`functions/index.js`) — Node 22, deployed to `europe-west1` |
| **Email** | Resend API (`resend` npm package) — transactional email for anonymous verification codes |
| **Firebase plan** | **Blaze (pay-as-you-go)** required — Cloud Functions and Secret Manager need it |
| **Native wrapper** | Capacitor 8 (iOS + Android WebView) |
| **Health data** | iOS HealthKit via `@flomentumsolutions/capacitor-health-extended` |
| **Offline storage** | Firestore offline persistence + `localStorage` cache |
| **PDF export** | jsPDF (client-side, no server) |
| **Notifications** | Capacitor Local Notifications |
| **PWA** | Web App Manifest + service worker (offline-capable) |
| **Hosting** | Static files served from repository (GitHub Pages / ProtonDrive) |

### Why no framework?

The app runs inside a Capacitor WebView where bundle size, cold start time and network access matter. A single self-contained HTML file loads instantly from disk, requires no bundler, and avoids the complexity of a SPA router operating inside a native shell.

### Local development

```bash
# Serve from the www/ directory on port 8765
cd www
python -m http.server 8765
# Open http://localhost:8765
```

The beta gate (`beta.html`) is bypassed for `localhost` and `file://` origins. The app also requires Firebase to be configured — `firebaseConfig` is inlined in each HTML page.

### Cloud Functions setup

```bash
cd functions
npm install
# Set Resend API key as a Firebase secret
firebase functions:secrets:set RESEND_API_KEY
# Deploy functions
firebase deploy --only functions
```

After deploying, go to **Google Cloud Console → Cloud Run** and set each function's security to **Allow unauthenticated invocations** (the `invoker: 'public'` option in code is correct but org policy may require the console override).

---

## 2. Technical Specification

### 2.1 Pages & Responsibilities

```
index.html          Home screen — navigation hub, entry tick, day streak, anonymous badge,
                    tutorial onboarding, logo easter egg, sign in/out
journal.html        Core journal — mood logging, stats, calendar, focused mode, HealthKit sync
survival-kit.html   Survival guide — mood definitions, coping strategies, medications,
                    goals, memories, commitments, quotes, remember-this
anonymous.html      Bipolar Anonymous board — email-verified anonymous chat;
                    requires BipolarBear account (Firebase Auth) + email verification code
beta.html           Password gate for web preview (Capacitor bypasses this entirely)
privacy.html        Privacy policy (static)
```

### 2.2 Shared JavaScript — fab.js

`fab.js` is loaded on `index.html`, `journal.html`, and `survival-kit.html`. It provides:

- **FAB dock** — up to 4 configurable floating action buttons (Chat, E2EE, Coffee, Feedback, Stats, Celebrity, Goals, Quick Note)
- **Account modal** — sign in, sign up, change password, change email, personal information, delete account
- **Stats modal** — mood distribution, correlations, AI feedback
- Dock layout persisted in `localStorage` (`bbFabSlot_1` … `bbFabSlot_4`); hidden buttons tracked per-key (e.g. `bbWaFabHidden`)

### 2.3 Data Architecture

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
    dailyGoals          string[]        — user's daily goal list
    currentMedList      {name,dosage}[] — medication list
    moodDefinitions     object          — per-mood personal definitions
    copingStrategies    object          — per-mood coping strategies
    logoVariant         number          — 0|1|2 (easter egg logo index)
    onboardingStep      number          — highest tutorial step reached (0–12)
    tutorialToastShown  bool            — "tutorial complete" popup has been shown
    personalHintDone    bool            — personal info hint dismissed
    survivalKitVisited  bool            — user has visited the survival kit (deprecated — now localStorage only)
    firstName           string?         — deprecated; name now from personalDetails

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

bbAnonPosts/
  {docId}
    userId      string    — hashed or anonymous identifier
    message     string    — post content
    timestamp   Timestamp — Firestore server timestamp
    deleted     bool?     — soft-delete flag (admin only)
    isAdmin     bool?     — true if posted by admin account
    reactions   object?   — emoji reaction counts { [emoji]: number }
    userReactions object? — per-user reaction tracking { [userId]: emoji }
    reports     string[]? — UIDs that have reported this post
    reported    bool?     — flagged as reported

anonVerify/
  {sessionId}             — created by sendAnonCode Cloud Function
    email       string    — email address the code was sent to
    code        string    — 4-digit verification code (plaintext, TTL 10 min)
    createdAt   Timestamp — used for rate limiting and expiry
    verified    bool?     — set to true by verifyAnonCode on success
    uid         string?   — Firebase Auth UID, set on verification

  Security rules: allow read, write: if false;
  Only accessible via Cloud Functions using the Admin SDK.

counters/
  peopleHelped
    count   number   — global increment counter
```

#### localStorage Keys

```
── Entry / Journal ──────────────────────────────────────────────────────────
bb_entryStatus          {key, done}   — today's/yesterday's entry status cache
bb_draft                object        — autosaved form state
bbHasEntries            "1"           — user has at least one saved entry
bbCurrentStreak         string        — current day streak count (set by journal.html)

── Settings ─────────────────────────────────────────────────────────────────
journalDefaultToday     "true"|null   — log today vs yesterday
focusedModeEnabled      "true"|null   — focused mode on/off
showMoodSuggestion      "1"|"0"       — mood suggestion toggle
moreDataOpenByDefault   "true"|null   — expand extra fields by default
achievementToastsEnabled "true"|null  — achievement toast toggle
pdfHideByDefault        "true"|null   — default PDF hide setting
logoVariant             "0"|"1"|"2"   — cached logo variant

── Cached Firestore data ────────────────────────────────────────────────────
moodDefinitions         JSON object   — per-mood personal definitions
copingStrategies        JSON object   — per-mood coping strategies
currentMedList          JSON array    — cached medication list
dailyGoals              JSON array    — cached goals
personalName            string        — cached from personalDetails
personalEmergencyContact string       — cached from personalDetails

── Achievements ─────────────────────────────────────────────────────────────
unlockedAchievements    JSON array    — list of unlocked achievement IDs

── Onboarding / Tutorial ────────────────────────────────────────────────────
bbOnboardingStep        string        — highest tutorial step (0–12); synced to Firestore
bbTutorialToastShown    "1"           — "tutorial complete" popup shown; synced to Firestore
bbFabsUnlocked          "1"           — FAB dock fully unlocked (set at step 12)
bbWelcomeShown          "1"           — first-ever welcome popup shown
bbSurvivalKitVisited    "1"           — user has opened the survival kit
bbSurvivalCelebDone     "1"           — "survival kit filled in" celebration toast shown (once)
bbPersonalHintDone      "1"           — personal info hint dismissed; synced to Firestore
bbMedHintDone           "1"           — medications hint dismissed
bbMoodDefHintDone       "1"           — mood definitions hint dismissed
bb_fmChooseMoodHintDone "1"           — focused-mode choose-mood hint dismissed
bb_fmMoodInfoCloseHintDone "1"        — focused-mode mood info close hint dismissed
bb_fmMoodTipShown       "1"           — focused-mode mood tip shown
bbSettingsHintDone      "1"           — settings hint dismissed (settings removed; auto-set)
bbCustomiseFormHintDone "1"           — customise form hint dismissed
bbCustomiseAdditionalHintDone "1"     — customise additional hint dismissed
bbCloseSettingsHintDone "1"           — close-settings hint dismissed
bbAdvancedTutorialToastShown "1"      — advanced tutorial complete toast shown

── PIN Lock ─────────────────────────────────────────────────────────────────
bbPinEnabled            "1"           — PIN lock is active
bbPinCode               string        — SHA-256 hash of the PIN (never plaintext)
bbGuestPinSalt          string        — legacy key (replaced by bbPinCode)
bbPinLinkedUID          string        — Firebase Auth UID that this PIN belongs to
                                        Cleared on sign-in if UID doesn't match,
                                        preventing lock-out when switching accounts

── Bipolar Anonymous ────────────────────────────────────────────────────────
bbAnon_verified         "true"        — user has completed email verification for the board
bbAnonLastVisit         string        — ms timestamp of last visit to anonymous.html;
                                        used to compute "new messages since last visit" badge

── FAB dock ─────────────────────────────────────────────────────────────────
bbFabSlot_1 … bbFabSlot_4  string    — FAB ID assigned to each dock slot
bbWaFabHidden           "1"           — WhatsApp FAB permanently hidden
bbQuickNoteFabHidden    "1"           — Quick Note FAB permanently hidden
bbCoffeeFabHidden       "1"           — Buy Me a Coffee FAB permanently hidden
bbFeedbackFabHidden     "1"           — Feedback FAB permanently hidden

── Misc ─────────────────────────────────────────────────────────────────────
bbWebUnlocked           "true"        — beta gate bypass (web preview)
statsStartDate          string        — custom stats window start date
bbLogoEasterEggFound    "1"           — logo easter egg discovered
bbLastSeenVersion       string        — last app version shown in "What's New" popup
bbPrivacyNoteDismissed  "1"           — privacy note on home screen dismissed
```

#### sessionStorage Keys

```
bbPinUnlocked           "1"    — PIN verified for this session; cleared on pagehide
bbReload                "1"    — set before forced reload after Firestore failure
```

### 2.4 Navigation Model

All inter-page navigation uses `location.replace()` rather than `href` links. This prevents the browser's back/forward cache (bfcache) from restoring a stale Firestore connection when navigating back — critical in Capacitor's WKWebView.

```
index.html  ──replace()──▶  journal.html
index.html  ──replace()──▶  survival-kit.html
index.html  ──replace()──▶  anonymous.html
journal.html  ──replace()──▶  / (index)
survival-kit.html  ──replace()──▶  / (index)
survival-kit.html  ──replace()──▶  journal.html
anonymous.html  ──replace()──▶  / (index)  [on sign-out]
```

`pagehide` event on each page calls `db.terminate()` to release the IndexedDB lock before navigation, preventing lock contention on the destination page.

### 2.5 Firestore Reliability Pattern

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

### 2.6 Authentication Flow

```
Email/password  →  full account with Firestore sync
Guest mode      →  entries stored in localStorage as entry:{timestamp}
Migration       →  on first sign-in, guest localStorage entries are batch-uploaded
                   to Firestore (only if account has 0 existing entries)

Change email    →  re-auth required (current password), then firebase updateEmail()
                   Available via the account modal in fab.js
```

**Anonymous board** uses a separate email verification layer on top of Firebase Auth — see section 2.11.

### 2.7 PIN Lock

- PIN stored as **SHA-256 hash** in `localStorage.bbPinCode` — plaintext never persisted
- Session unlock stored in `sessionStorage.bbPinUnlocked`
- `sessionStorage` is cleared on `pagehide`, so PIN is required every time the page is opened
- `bbPinLinkedUID` stores the Firebase Auth UID of the account that created the PIN
- On `onAuthStateChanged`, if the signed-in UID doesn't match `bbPinLinkedUID`, all PIN keys are cleared and the overlay is hidden — prevents a different account from being locked out by another user's PIN

### 2.8 Health Data Sync (iOS)

```
Plugin:   @flomentumsolutions/capacitor-health-extended
Data:     Sleep duration  →  selectedSleep bucket (5 / 6.5 / 7.5 / 8.5 / 10h)
          Step count      →  entry.steps (shown inline with energy)

Timing:   Sleep sync reads from last night's HealthKit records
          Valid if sleep ended within 36 hours (prevents stale data)
          Steps sync runs on page load for recent dates

Guard:    _healthSyncInProgress flag prevents form navigation during async sync
```

### 2.9 Focused Mode

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

### 2.10 Onboarding / Tutorial System

A 12-step guided onboarding for new users. Step progress is synced to Firestore (`userSettings/{uid}.onboardingStep`) so it resumes on any device.

```
Step  0   — First launch; welcome popup shown
Step  1   — "Click here to get started" hint on journal button
Step  2   — First journal entry opened
Step  3   — First entry saved; home button revealed
Step  4   — Sign-in hint (auth FAB revealed)
Step  5   — Logo hint shown
Step  6   — Survival kit button revealed (5-click logo easter egg)
Step  7   — (reserved)
Step  8   — Journal navigated from home
Step  9   — (removed; WhatsApp hint; skipped automatically → step 10)
Step 10   — WhatsApp / WA modal shown
Step 11   — (reserved)
Step 12   — Tutorial complete; FABs unlocked; "Tutorial Complete 🎓" popup shown
```

**Completion flags set at step 12** (silently on login if already completed):
`bbTutorialToastShown`, `bbFabsUnlocked`, `bbSurvivalCelebDone`, and all hint keys.

**Key functions:**
```
_getOnboardingStep()          — reads bbOnboardingStep from localStorage
_advanceOnboardingStep(n)     — advances to step n if n > current; syncs to Firestore;
                                 shows "Tutorial Complete" popup on first reach of 12
_applyOnboardingGating()      — shows/hides elements based on current step
                                 (auth FAB, survival kit button, hints, footer)
```

**On login** (`onAuthStateChanged`): the server step is compared with the local step; the maximum is used. If the combined step is ≥ 12, all completion flags are silently set in localStorage before `_applyOnboardingGating()` runs — this prevents the tutorial popup from appearing on every login and ensures the FAB dock is always accessible for existing users.

**Tutorial skip**: available via the logo easter egg (5 taps). Instantly sets step to 12 and marks all flags, with a "✅ Tutorial skipped" toast.

### 2.11 Bipolar Anonymous Board

`anonymous.html` provides a verified-anonymous community chat board. Users must:
1. Be signed in to BipolarBear (Firebase Auth)
2. Verify their account email address via a one-time 4-digit code

The email address is locked to the Firebase account email and cannot be changed in this flow. If a user needs to change email, they do so via the account modal in the main app.

#### Verification flow

```
User opens anonymous.html
      │
      ├─ Not signed in? → show error with link to sign in; block access
      ├─ Already verified (bbAnon_verified = 'true')? → skip to board
      │
      └─ Show verify UI
            Email field pre-filled and read-only (locked to account email)
            │
            User taps "Send code"
            │
            ▼
      sendAnonCode Cloud Function
            ├─ Rate limit: max 3 codes per email per 10 minutes
            ├─ Generate 4-digit code
            ├─ Write to anonVerify/{sessionId} (TTL: 10 min)
            └─ Send email via Resend API
            │
            ▼
      User enters 4-digit code (paste-to-fill supported)
            │
            ▼
      verifyAnonCode Cloud Function
            ├─ Look up sessionId in anonVerify collection
            ├─ Check code matches, not expired (10 min), not already verified
            ├─ Set anonVerify/{sessionId}.verified = true
            └─ Return success
            │
            ▼
      localStorage.setItem('bbAnon_verified', 'true')
      → Boot the board (initBoard)
```

#### Error codes from Cloud Functions

| Code | Meaning |
|---|---|
| `functions/unauthenticated` | Wrong verification code |
| `functions/deadline-exceeded` | Code expired — auto-resend triggered |
| `functions/resource-exhausted` | Rate limit hit — redirect back to email step |
| `functions/not-found` | Session not found — redirect back to email step |

#### Board features

- Posts listed newest-first, real-time Firestore listener
- Reactions (emoji) per post
- Report post (flags for admin review)
- Admin accounts (`profile.isAdmin`) can soft-delete posts
- `bbAnonLastVisit` timestamp written to localStorage when the board loads; used by `index.html` to show "X new messages" badge under the Anonymous button

### 2.12 Home Screen Badges (index.html)

Three sub-labels appear under the navigation buttons:

| Button | Element | Content |
|---|---|---|
| Mood Journal | `#journalStreakBadge` | `🔥 N days` — current streak from `bbCurrentStreak` |
| Your Survival Kit | `#survivalProgress` | `N / 13 sections complete` — counts filled localStorage sections |
| Bipolar Anonymous | `#anonMessagesBadge` | `💬 N new messages` or `✓ No new messages` (Firestore query since `bbAnonLastVisit`) |

All three use the shared CSS class `.btn-subnote` (bold, white, `font-size: 0.78em`). The Anonymous sign-in fallback note uses `.btn-subnote-muted` (same size but dimmed + italic).

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
            │     ├─ Load userSettings from Firestore
            │     │     ├─ Compute _finalStep (max of server + local onboardingStep)
            │     │     ├─ If _finalStep >= 12: set all completion flags before tick update
            │     │     ├─ Restore survival kit data to localStorage
            │     │     └─ Update survival tick; call _applyOnboardingGating()
            │     ├─ bb_entryStatus cache done=true for today? ──▶ skip query  [DONE]
            │     └─ Query Firestore: all entries where userId == uid
            │           ├─ find entry matching target date?  ──▶ set tick + cache  [DONE]
            │           └─ no match  ──▶ clear tick
            │
            └─ not signed in → show Sign In button, lock Anonymous button
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
| <1,000 | −10 | |

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
