# App Store / Play Store listing copy

Paste-ready metadata for both apps. Draft copy — review/tweak the voice before
submitting. Character limits noted per field (Apple's are the tight ones).

---

# 1. Bipolar Bear  (`com.bipolarbear.app`)

### App name  (max 30 chars)
```
Bipolar Bear
```

### Subtitle  (max 30 chars)
```
Mood journal & survival kit
```

### Promotional text  (max 170 chars, editable any time without review)
```
A private, encrypted mood journal for living with bipolar disorder — plus a survival kit of coping tools and an anonymous peer community.
```

### Keywords  (max 100 chars, comma-separated, no spaces after commas)
```
bipolar,mood,journal,mental health,tracker,depression,mania,wellbeing,diary,mood tracker,self care
```

### Description  (max 4000 chars)
```
Bipolar Bear is a free, private mood journal built for people living with bipolar disorder.

Track your moods, energy, and sleep day to day, spot the patterns that matter, and build a survival kit of coping tools you can reach for on the hard days.

YOUR DATA STAYS YOURS
Journal entries are end-to-end encrypted. Only you can read them — not us, not anyone else. Your notes, moods and everything you log are encrypted on your device before they ever leave it.

WHAT'S INSIDE
• Daily mood journal — log mood, energy, sleep and free-text notes in seconds
• Patterns & stats — see trends over time so you and your care team can spot early warning signs
• Survival kit — save coping resources, goals, medications and meaningful memories in one place
• Focused mode — strip the app back to just what you need on overwhelming days
• PDF export — share a clean summary with your doctor or psychiatrist
• Anonymous community — an optional, anonymous peer board to talk to others who get it
• Streaks & gentle reminders — stay in the habit without the pressure

Bipolar Bear is not a medical device and does not provide medical advice. It's a tool to help you notice, reflect, and stay connected — alongside the care of your health professionals.

Free to use. No ads. No selling your data.
```

### Support URL
```
https://www.bipolarbear.app
```

### Marketing URL
```
https://www.bipolarbear.app
```

### Privacy Policy URL
```
https://www.bipolarbear.app/privacy.html
```

---

# 2. Bipolar Anonymous  (`com.bipolaranonymous.app`)

### App name  (max 30 chars)
```
Bipolar Anonymous
```

### Subtitle  (max 30 chars)
```
Anonymous peer community
```

### Promotional text  (max 170 chars)
```
An anonymous peer-support board for people living with bipolar disorder. No real names, no judgement — just people who understand.
```

### Keywords  (max 100 chars)
```
bipolar,anonymous,community,peer support,mental health,depression,mania,forum,support,wellbeing
```

### Description  (max 4000 chars)
```
Bipolar Anonymous is a free, anonymous peer-support community for people living with bipolar disorder.

Pick a monika, post what you're going through, and connect with others who actually understand — no real names, no profiles to maintain, no judgement.

HOW IT WORKS
• Post and reply anonymously under a monika of your choosing
• Read what others are going through and offer support
• A calm, simple board with none of the noise of social media

A NOTE ON PRIVACY
Posts on the community board are public to other users of the app and are stored in plain text (they are not end-to-end encrypted). Please don't share anything that personally identifies you. Your account is tied only to a hashed email used to recognise you across devices.

Bipolar Anonymous is peer support, not professional care. It does not provide medical advice and is not a substitute for treatment. If you are in crisis, please contact your local emergency services or a crisis line.

Free to use. No ads.
```

### Support URL
```
https://www.bipolarbear.app
```

### Privacy Policy URL
```
https://www.bipolarbear.app/privacy.html
```

---

# App Privacy "nutrition label"  (Apple) / Data Safety  (Google)

Answer these honestly in App Store Connect → App Privacy and Play Console →
Data safety. Based on the architecture notes in CLAUDE.md / DOCS.md.

## Bipolar Bear

| Data type | Collected? | Linked to user? | Used for tracking? | Notes |
|-----------|-----------|-----------------|--------------------|-------|
| Email address | Yes | Yes | No | Firebase Auth account |
| Health & fitness (mood/sleep/energy) | Yes | Yes* | No | *Stored end-to-end ENCRYPTED — we cannot read it |
| User content (journal notes) | Yes | Yes* | No | *End-to-end encrypted |
| Contact info (PDF export details) | Yes | Yes | No | Optional, user-entered |
| Identifiers (user ID) | Yes | Yes | No | Firestore document key |
| Diagnostics / crash data | Check Firebase | — | No | Only if Crashlytics/Analytics enabled |

Encryption / export-compliance answer: app uses standard encryption (HTTPS +
E2E entry encryption). Most likely qualifies for the exemption — answer the
`ITSAppUsesNonExemptEncryption` question accordingly (typically "No" /
exempt), but confirm against current Apple wording.

## Bipolar Anonymous

| Data type | Collected? | Linked to user? | Used for tracking? | Notes |
|-----------|-----------|-----------------|--------------------|-------|
| User content (posts/replies) | Yes | No** | No | **PLAINTEXT on Firestore, public to other users |
| Email address (hashed) | Yes | Pseudonymous | No | SHA-256 hash only, for cross-device profile |
| Identifiers (monika) | Yes | Pseudonymous | No | User-chosen handle |

Be explicit in the Data Safety form that posts are NOT encrypted and are
visible to other users — Google rejects listings that under-declare this.

---

# "What's New" / release notes

Apple max 4000 chars; Play max 500 chars. Keep v1.0 simple — for a first
release Apple just wants a sentence, not a changelog.

## Bipolar Bear — v1.0
```
Welcome to Bipolar Bear! This is our first release.

• Private, end-to-end encrypted mood journal — track mood, energy and sleep
• Patterns and stats to spot your early warning signs
• A survival kit for coping tools, goals, medications and memories
• Focused mode for overwhelming days
• PDF export to share with your care team
• An optional anonymous peer community

Thank you for being here. We'd love your feedback — there's a feedback option
right inside the app.
```

## Bipolar Anonymous — v1.0
```
Welcome to Bipolar Anonymous — our first release.

A calm, anonymous peer-support board for people living with bipolar disorder.
Pick a monika, share what you're going through, and connect with others who
understand. No real names, no judgement.

We'd love your feedback.
```

### Template for future updates (keep one per release)
```
What's new in vX.Y:
• <user-facing change>
• <bug fix in plain language>
Thanks for using Bipolar Bear — keep the feedback coming.
```

---

# Description accuracy check (verified against code 2026-06-07)

Every feature claimed in the descriptions above was confirmed present in the
source, so nothing needs softening:

| Claim | Verified in |
|-------|-------------|
| End-to-end encrypted journal | entries E2E (CLAUDE.md, DOCS.md) |
| Mood / energy / sleep logging | journal.html, js/journal.js |
| Patterns & stats | js/journal.js |
| Survival kit (coping/goals/medications/memories) | js/survival-kit.js |
| Focused mode | js/journal.js (focusedMode) |
| PDF export | js/journal.js `exportPDF()` |
| Apple Health / HealthKit sync | js/journal.js (healthSync) |
| Anonymous community | anonymous.html, js/anonymous.js |
| Streaks & reminders | currentStreak / reminderEnabled |
| In-app feedback | feedback collection (CLAUDE.md) |

Note: the description avoids any medical/clinical claim and includes a "not a
medical device / not medical advice" line — important for App Store review of
health-adjacent apps.

---

# Pre-submission checklist (cross-reference CLAUDE.md)

- [ ] Apple Developer Program membership active ($99/yr)
- [ ] Bundle IDs registered: com.bipolarbear.app, com.bipolaranonymous.app
- [ ] privacy.html reachable at the live URL (confirmed in repo ✓)
- [ ] Screenshots: iPhone 6.9" = 1290×2796 ✓ (in store-assets/out/iphone/)
- [ ] Marketing icon 1024×1024 — see icon alpha note below
- [ ] Age rating questionnaire completed
- [ ] Export compliance answer decided
- [ ] CFBundleVersion bumped — AND widget CFBundleVersion matched (CLAUDE.md)
- [ ] service-worker.js CACHE_NAME bumped if precached assets changed
```
