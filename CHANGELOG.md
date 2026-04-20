# BipolarBear Changelog

## v0.85
- ✨ Full dock (Chat, E2EE, Coffee, Feedback) now synced across index, journal, and survival kit — hiding a button on one page hides it everywhere
- ✨ Empty dock slots show a dotted `+` placeholder; tapping opens a picker to assign Stats 📊, Celebrity ⭐, Goals 🎯, or Quick Note 📝
- ✨ Journal and survival-kit FAB footer changed to white background, matching index
- ✨ Settings FAB (⚙️) replaces profile icon in journal dock when logged in; tapping it opens the settings modal
- 🐛 Fix: Duplicate 🔐 E2EE FAB no longer appears when Feedback is permanently hidden (removed securityFab fallback)
- 🐛 Fix: Settings-button tutorial hints auto-skipped since settings button moved to dock FAB

## v0.71
- Beta gate: skip redirect when running from local file (file: protocol) so app works when opened directly from disk
- Survival kit sticky nav: Home link moved out of scrollable strip into its own fixed left cell; arrow pointer angle recalculated from final rendered position (not screen centre)
- Journal: Home link and post-delete redirect use file-safe location.replace; arrow pointer angle fix matches survival kit
- Journal settings: advanced settings badge hint correctly shown/hidden when settings panel closes

## v0.60
- Customise form: toggle individual steps on/off (energy, sleep, sleep quality, meds, additional, notes) via Journal Options; master switch; default is all active except sleep quality
- Reset settings now restores customise form defaults (all active except sleep quality)
- Energy step disabled → saves null instead of default "Normal"; done step summary hides energy row when not selected
- Sleep sync UX: resync button hidden while a synced value is active (reappears after Undo); banner colour matches the sleep range bucket; mobile hover effects disabled (tap flash only); editing sleep from summary bar visits sleep quality step before returning to done
- Focus mode notes: preserved when navigating between steps (synced to #notes textarea before content swap)
- Elaborate Responses: step notes element re-appended correctly in confirm-step mode; step notes and intention loaded from saved entry when editing in focused mode
- Medication step: correctly included when opening focused mode via + Log today
- Survival kit: rounded header bottom (border-radius 0 0 32px 32px) for smooth transition into nav bar

## v0.59
- 📝 Elaborate Responses setting: per-step notes in focused mode, combined into tomorrow's intention field on save
- Budget "Additional Info" inline note when over budget (Elaborate Responses mode)
- Stats timeframe picker: 30d / 60d / 90d / custom days (with pencil to re-edit) / All time — replaces tap-cycle
- Year calendar legend moved above streak card; uniform 12×12 squares ordered by frequency
- Monthly calendar mood key filtered to current month only
- Sleep sync: actual float hours saved from HealthKit; synced banner + undo button in focused sleep step
- Edit / add tomorrow's intention directly from past entry popup
- Survival kit: section completion ticks (✅/⬜) on medications, goals, mind, coping, memories, steps
- Survival kit: karma ← → navigation with back-history (mirrors celebrity carousel)
- Survival kit: safe-area notch colour matches orange header
- Stable mood entry: secondary mood no longer shown in Bear thought
- Double-click save guard prevents duplicate entries on rapid taps
- Personalised feedback: correlations with |r| < 0.1 filtered out
- Custom field name conflict: duplicate default hidden if user already has identically-named field
- More data: clicking a selected response button now deselects it
- Built-in reverse fields (Alcohol, Added Sugar) support emoji picker in field editor

## v0.58
- Focused mode colour scheme changes with selected mood (card background, progress dots, Next button)
- Hover colours on energy level, sleep hours, medication and more data buttons; text goes black & bold on hover
- ✕ Close button always shown on step 0 of focused mode (exits to overview)
- Greyed-out Save button on done step navigates to mood step instead of saving
- Samaritans (116 123) and user's emergency contact shown on depressed care popup
- Auto advance toggle on more data step; (+) button recentred
- Form centering fixed when opening focused mode or starting a new entry
- Sleep quality hover colours in both focused and regular forms
- Goal progress buttons in more data now have correct orange/green hover colours

## v0.57
- Advanced settings split: Journal Options on main advanced page; Stats start date, PDF export, Delete data moved to "More" sub-page
- Intention for tomorrow disabled by default; enable via Advanced → Journal Options
- 💾 save shortcut moved from top bar into summary icon bar (appears after notes chip)
- Delete confirmation z-index fixed — no longer hidden behind field picker modal
- Alcohol & Added Sugar names editable from Track Data / Additional Data popups
- Gone Outside and all built-in deletable fields now show delete confirmation dialog
- Bipolar Bear shows two adjacent mood suggestions with separate "Use" buttons
- Celebrity carousel back button; Strategies & Memories hide content until mood is selected

## v0.56
- Sleep quality (Bad / Unsure / Good) step added to both focused and regular forms; sleep chip in focused summary bar colours red/grey/green to match
- Focused mode notes page: live word counter updates as you type; Intention for tomorrow added as a collapsible section
- Added Sugar default tracking field (off by default); styled orange, No = positive/green direction
- Exercise, Outside, Emotions (was Anxiety), Alcohol now deletable from the field picker
- Deactivating a field while editing an entry now removes its data on save
- Emotions toggle in regular form correctly shows/hides stress and irritability rows
- Done step: entry date shown above the summary; long rows now wrap (no overflow)
- "Open by default" switch fixed; all focused mode response buttons uniformly orange
- Energy suggestion thresholds: 3k–9,999 = Normal, 10k–19,999 = More than usual, 20k+ = Too much

## v0.55
- Day overview shows Bipolar Bear's suggested mood (collapsible)
- Goals question simplified to Yes / No
- Steps & sleep import auto-highlights suggested option (focused mode doesn't auto-advance)
- Year calendar key squares sized by frequency; click to open mood breakdown
- Most common mood popup shows count and percentage (e.g. 212d | 78%)
- Achievements: "Full Spectrum" and "Stable Week" now use correct mood labels
- Offline banner moved to bottom to avoid phone notch
- Focused mode: delete stays in focused mode; mood long-press works on desktop too
- Bear suggested mood setting now persists across app restarts
- One-time tip shown first time mood selector appears (tap again / long press)
- Entry log: achievements shown on their own line (no stray pipe)
- Field picker scrolls to custom emoji section when opened
- Survival kit: mood section no longer changes page height during auto-cycle
- Survival kit: memories section cycles through moods with fixed height
- Survival kit: reminder edit/delete buttons stay inline with title

## v0.54
- Tap & hold on images no longer shows iOS native popup (-webkit-touch-callout: none on all pages)
- "Switch back to full form" link moved to below the focused mode card, above Open Journal button
- Survival kit sticky nav repositioned above the header title — sticks at top with notch padding as you scroll, name scrolls below it
- Mood suggestion ℹ️ info button added — explains how the score is calculated (energy, sleep, medication, etc.)
- All hover effects now guarded by `@media (hover: hover) and (pointer: fine)` — fixes iOS sticky-hover after closing popups
- PIN and focused mode settings (focusedModeEnabled, moreDataOpenByDefault, showMoodSuggestion) now reset on delete-all, logout, and new-user login
- "Gone outside" tracking field defaults to on for new users; all other extras default to off
- Focused mode: toggling an extra field on the "Anything else?" step live-updates the step count; 🗑️ delete button now always shown on done step (exits/resets for new entries, deletes for edits)
- Personalised guide title (James' / Jude's Bipolar Survival Kit) sourced from Personal Details name field

## v0.53
- Completed entry banner now shows "✅ View today's/yesterday's entry" button that opens the full entry overview popup
- Entry overview popup (calendar day detail) and favourites detail popup now show steps inline with energy (e.g. 7/10 | 🏃 5k)
- Focused mode budget step: shows current budget value with a Change button; if no budget set, shows a Set daily budget prompt
- Focused mode goals step: adds a "View / Edit Goals" link below the options
- Focused mode mood step: tap & hold (600ms) any mood icon to show its full definition popup; hint text shown below selector
- Depressed mood in focused mode: tapping it shows a supportive ♥️ message before proceeding to the next step
- Focused mode done step: 🗑️ delete button shown to the left of Save Entry when editing an existing entry
- PIN now cleared on pagehide — asked every time the journal is opened, not just once per session
- Bug: import steps in focused mode no longer auto-closes the form during health sync (_healthSyncInProgress guard on _fmNext)
- Login now clears bb_entryStatus cache so home screen journal/survival ticks refresh immediately
- Pagination ‹ › (prev/next single page) buttons removed; « » (first/last) remain
- Survival guide sticky nav background matches header gradient (seamless orange)
- Journal entries section silently closes when the user interacts with the entry form

## v0.52
- Sleep sync now shows "← suggested" on closest range button without auto-selecting (matches steps behaviour)
- Focused mode sleep: visible success/fail/no-data feedback on the sync button itself
- Delete all entries now resets focused mode, bear suggestion, and more-data-open-by-default settings to defaults
- Journal page scrollbar hidden; survival guide retains its scrollbar
- Focused mode "anything else?" + button is now a proper circle (min-width/height + flex-shrink fix)
- WhatsApp FAB close no longer causes the survival button to flash white (tap-highlight fix)

## v0.51
- Anxiety, stress & irritability now use relative labels: Less than usual / Normal / More than usual
- Corrected mood scoring direction: more anxiety/stress = depressed direction; less = stable/manic
- Irritability expanded from yes/no to three options matching relative scale
- Bear suggested mood (BETA): collapsible suggestion panel on save screen, opt-in toggle in Advanced settings
- Bear suggestion: Update mood button switches to Undo after tapping; X button to permanently hide with confirmation
- Focused mode: mood step now renders full mood-selector grid matching the regular form
- Focused mode: heading dynamically shows "How was yesterday?" / "How is today going?" etc.
- Focused mode: form closes correctly after saving; no longer re-opens focused card post-save
- Focused mode: smooth scroll to card top on every step advance
- Advanced settings: delete all entries replaced with bin icon in header (matching form style)
- Advanced settings: Journal Options section with Bear mood, Focus mode, More data toggles; logging button at bottom
- Tick caches cleared on delete all entries so home screen journal/survival buttons reset correctly

## v0.50
- Focused mode: energy and sleep have no preselection — nothing highlighted until you tap
- Focused mode energy step: "Sync Steps from Health" button with step count and suggested energy level
- Energy label "High" renamed to "Energetic" throughout the app
- Focused mode medication step: more robust display; falls back to "Your medications" if names can't be read
- Switching back to full form from focused mode now turns off the focused mode preference (🎯 goes grey)
- Regular form: tapping Save now shows a summary confirmation before committing the entry
- PIN lock button added to main settings panel (not just Advanced)

## v0.49
- PIN lock syncs to Firestore — set once and it works across all your devices
- PIN cleared from device on logout so the next user/account isn't locked out
- Session auto-unlock after email sign-in (no double-auth on fresh login)

## v0.48
- First-time hint toasts for 🕵️ (private mode) and ★ (favourite) — shown only on first use
- Alcohol buttons reordered (Yes left, No right); Yes highlighted red when selected
- Calendar header is now tappable — opens month/year picker with two dropdowns (supports future months)
- Sleep hours label shown in button when editing a saved entry or restoring a draft with sleep data
- "Recommendations" sub-header added above action tags in all mood detail panels in survival guide
- "Bipolar UK Definition" collapsible now labelled "— click here" when collapsed
- "Open section by default" toggle moved from form into Settings
- Survival guide goals input converted to fixed-overlay popup (fixes iOS scroll-behind issue)
- Fixed: WhatsApp hint now shows before Feedback hint after hint reset; pagehide no longer marks WA hint done before user sees it
- Fixed: Entry tick on home screen no longer deactivates after Firestore cache returns empty snapshot
- Fixed: PIN and unlock state cleared on logout (PIN no longer persists across account switches)

## v0.47
- Journal button on home screen shows 🔒 / 🔓 based on PIN lock state
- PIN lock: set a 4-digit PIN in Settings → Advanced to lock the journal on open; AppIcon shown on PIN entry screen
- Generate Wall Tracker now works on native iOS (Filesystem + Share sheet instead of doc.save)

## v0.46
- WhatsApp Group button added to home screen (native only) with a label hint; feedback hint shown sequentially after WhatsApp hint dismissed
- Survival guide sticky nav scrolling improved (GPU-accelerated); personal details link added to survival guide
- Alternate app icon switching fixed on iOS (storyboard BridgeViewController class corrected)

## v0.45
- Energy button shows imported steps inline (⚡ Energy | 5k); entry cards show energy label (None/Low/Fine/High/Full) and sleep range (≤5h/6-7h/7-8h/8-9h/9+h) instead of raw numbers
- Mood popups: bipolar UK definition collapses behind a toggle when a personal definition exists
- Tapping 🗓️ calendar icon now immediately opens the native date picker (no intermediate hidden row)
- Notes textarea is taller; "More data" section has "Open by default?" toggle
- Goals renamed to "5 Yr Goals" throughout the form
- Personal details link moved below the login footer in the entries list; Logging Yesterday/Today toggle moved to its spot in Advanced Settings
- Fixed: clicking + to log the other date now shows draft correctly (editingEntry was not being cleared)
- Fixed: "Review" button now opens the entry in edit mode even when date was stored as ISO string

## v0.44
- Favourite entries — tap ☆ on the form to star an entry; browse starred entries from the All-Time Stats "Favourite Entries" card
- Hover effects fully removed from all inline onmouseover/onmouseout handlers across all pages — no more sticky hover states on iPhone for any button or card

## v0.43
- Entry cards in the journal list now show 🔋 for energy and 😴 for sleep; more-data fields grouped into an "Achievements:" emoji section
- Steps shown next to the sleep label when editing an entry that already has step data saved
- Settings button now reliably tappable on mobile (iOS pointer-events fix)
- All hover effects disabled on touch screens throughout the app (no more sticky-hover on mood buttons etc.)
- Form stays open when app is minimised mid-entry (resume guard now checks form visibility)
- Survival guide navigation bar centred horizontally on desktop web

## v0.42
- Budget tracking field — enable "💰 Budget" via the More Data field picker, tap the label to set a daily limit (e.g. £50 daily), then log Yes/No each day
- Budget synced between journal and survival guide (Goals section)
- "How was..." heading now updates correctly when selecting a date from the month calendar

## v0.41
- Favourite entries — tap ☆ on the form to star an entry; browse starred entries from All-Time Stats card
- Missing entries popup no longer counts today as missing when the app is set to log yesterday
- All-Time Stats toggle button only appears after 30 entries are logged
- Backup download now works on iPhone — uses native share sheet instead of unsupported anchor download

## v0.40
- More data panel Done button no longer scrolls out of view
- Goals field correctly resets when opening a new entry after editing another
- Delete (🗑️) button no longer appears before a mood is selected when editing
- Fixed: visiting the beta page then journal no longer causes empty entries or broken UI (anonymous auth no longer treated as signed-in account)
- Survival Kit — coping strategies and memories sections pre-select "Good" mood on load
- Survival Kit — memory entries now have an ✏️ edit button

## v0.39
- Mood cycle animation now restarts correctly when opening a new entry after a previous edit or mood tap
- Home screen confetti fires on every visit when both ticks are complete (not throttled)

## v0.38
- Mood popup in journal now shows the last recorded memory for that mood from the Survival Kit
- New achievements: 💭 Memory Keeper (first mood memory recorded) and 🤝 Committed (first commitment added)

## v0.37
- Settings modal — close button saves and dismisses (no separate Save button)
- Survival Kit nav — Home button pinned to left, Help button pinned to right; other tabs scroll behind both

## v0.36
- Favourite entries — star any entry from the form; browse all favourites from All-Time Stats card
- Favourite anniversary notification — when a favourite entry is saved, a local notification is scheduled for the same date next year; tapping it shows all favourite entries from that date across all years; "Show again next year" reschedules for the following year
- Survival Kit "You're in good company" and random quote card backgrounds changed to white

## v0.35
- Sleep import fix — iOS HealthKit plugin now respects the query date window; correctly picks previous night's sleep
- Survival Kit page no longer jumps to top after saving a definition/strategy (requestAnimationFrame scroll restore)
- Goals management moved inline into the section (no popup modal)
- Home screen button ticks remain visible on hover (orange invert)
- Home screen tick checks Firestore on launch when local cache is missing or stale

## v0.34
- Mood memories — record personal memories linked to each mood in Survival Kit; shown in journal mood popup
- Survival Kit modal scroll fix on iPhone (body-lock prevents keyboard pushing content)
- 12 Steps section replaced with cycling card (Step X of 12) with Prev / Next navigation
- Your Commitments — personal slide deck below 12 Steps with add, edit and delete
- Custom reminders in Struggling? section — add your own title + message accordions
- More data button smooth scrolls to notes when expanded

## v0.33
- Delete current entry now immediately closes the form and clears the home screen tick
- Survival Kit tick on home screen — requires at least one entry in all 4 sections (mood definition, coping strategy, medication, goal)
- Achievements for each individual Survival Kit section, plus combined "Fully Prepared" achievement; toasts fire on the Survival Kit page directly
- Most common mood stat card shows 🥇 / 🥈 podium (with = marker when 2nd place is tied)
- Stats cards vertically centred
- Field picker scroll fade at bottom to indicate more options below

## v0.32
- Favourite entries — star any entry from the form, browse all favourites from All-Time Stats
- Clear draft button on the entry form (bin icon, appears after mood selected)
- "Back" button from edit mode now shows loading spinner while entries reload
- Missing entries pill always visible when complete banner shown; muted style when none missing
- Survival Kit button (🧰) in journal header, inline with ← Home
- Mood definitions in Survival Guide — add your own personal definition per mood, synced to journal
- Mood popup (double-tap mood) shows your definition and Bipolar UK description with link
- Health sleep sync window extended to noon next day (captures overnight sleep ending next morning)
- Total days popup now colour-coded per mood with label

## v0.31
- Coping strategies in Survival Guide — add strategies per mood, synced to journal
- Mood popup in journal shows your coping strategies for that mood
- Draft auto-save: entries in progress are saved locally and restored on return
- PDF export: per-entry hide checkbox + global default setting in Settings
- Delete button when editing an entry in the form
- "Log today's entry" shortcut when yesterday's entry is already complete
- Form heading adapts to date: "How is today going?" / "How was yesterday?"
- Health import now uses the form date (fixes sleep/steps import for today's entry)
- Complete banner and action pills use muted styling; Open Journal button more prominent
- Back button when editing an entry

## v0.30
- Yesterday, today and tomorrow marked in the monthly calendar

## v0.29
- "You're in good company" card in Survival Guide showing famous people with bipolar
- Fixed people helped counter showing wrong number after un-voting then re-voting

## v0.28
- Streak in All-Time Stats now accounts for yesterday mode

## v0.27
- Prevented flash of previous content when opening the journal

## v0.26
- Fixed issues relating to sign in / sign out

## v0.25
- Submit button says "Log Yesterday's Entry ✨" when in yesterday mode
- Stats chart (year/month calendar) now switches immediately when toggling 30d / All-Time
- Missing entries count no longer flags yesterday as missing before you've logged it
- "What is r?" in personalised feedback scrolls into view when expanded
- Widget logo enlarged

## v0.24
- Reduced header space on journal page, especially in landscape orientation
- All-Time Stats button no longer causes page scroll on first tap
- Opening a new entry from the calendar now always starts with a blank form
- Advanced Settings layout reordered: Delete All at top, log yesterday/today toggle above stats date
- Stats Start Date Save button moved inline with Clear

## v0.23
- Journal defaults to logging yesterday's entry (better for reviewing steps/goals objectively)
- "Yesterday's entry complete | Edit" banner when yesterday is already filled in
- Delete button added to calendar day popup
- Toggle in Advanced Settings to switch between yesterday / today default mode
- Yesterday/today preference syncs across devices via Firestore

## v0.22
- Tap a selected mood a second time to see its definition
- App icon changes with the logo when using the 5-tap easter egg
- Mood definitions and icon cycle work across all three pages

## v0.21
- "Outside" renamed to "Gone outside" in the field picker
- Steps in entry history now shown to the nearest thousand (e.g. 3k)
- Custom tracking fields in entry history show emoji only (not label text)
- Separator line between Personal Details and Delete All Entries in Advanced Settings

## v0.2 — Major Release
- Add your own custom yes/no tracking fields with emoji labels
- Field picker to choose which data fields appear when logging
- Field picker is context-aware when editing past entries
- Edit and delete custom fields inline
- Calendar days with no entry show an Add entry button
- Custom fields included in statistics, PDF export, and entry history
- Separate people helped counter for the native app (starts at 1)
- Substances renamed to Drugs in field picker

## v0.12
- Field picker shows entry's active fields when editing a past entry (not global prefs)
- Custom tracking fields support emoji labels (emoji picker in add form)
- Custom field name limit reduced to 20 characters

## v0.11
- "More data" fields are now all optional — none active by default
- Orange ⊕ button inside "More data" opens a field picker to toggle tracking on/off
- Tracking preferences sync across devices via Firestore
- Tracking toggles removed from Personal Details

## v0.10
- Calendar day popup now has an ✏️ edit button to open the entry directly in the form

## v0.09
- Emotional tracking split into separate anxiety, stress & irritability toggles
- No / Yes buttons now fill the same width as three-option rows (50/50)
- "What does r mean?" moved to below personalised insights
- Karma & Spirit section: rotating quote card with 50 sourced quotes
- Quotes cycle across different traditions (no two consecutive from same source)

## v0.08
- Tap any selected choice a second time to deselect it
- Fixed: alcohol & tracking fields now show correctly when editing today's entry
- Fixed: health sync no longer auto-closes the edit form
- Editing past entries now shows only the fields you recorded (plus any newly enabled)
- Version number opens changelog modal
- "Bipolar Disorder" section renamed to "Bipolar"
- Mood icons scroll to section on first tap only

## v0.07
- Calendar day popup with ghost-tap fix
- Fixed journal loading after home → journal → home → journal navigation
- Single loading animation covering both form and journal sections
- Achievements gallery in settings
