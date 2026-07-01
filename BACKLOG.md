# Product Backlog

Feature ideas not yet scheduled. Each entry is a rough spec — enough to pick up
cold, not a final design. Move an item into a branch + commit when it's built,
and delete it from here (the CHANGELOG records what shipped).

For Android-vs-iOS parity gaps specifically, see `ANDROID_TODO.md`.

---

## Save a community post to the shared wiki (admin-validated)

**Status:** Not started · **Area:** Anonymous board (`anonymous.html` / `js/anonymous.js`)

Let users nominate a great community post to be added to the shared wiki. The
nomination doesn't publish anything directly — it goes to an admin, who
validates it before it appears in the wiki as a community post. This replaces the
current manual process (an admin hand-copies posts into `data/wiki-posts.json`).

### User flow

1. Add a **"Save to wiki"** button to each post's action row in `renderPost()`
   (alongside 💛 like / 💬 comment / 🚨 report). Suggested affordance: 📖 or a
   bookmark icon. Hide it on seed posts, system cards, and the user's own posts
   (optional — decide whether self-nomination is allowed).
2. On tap, open a confirmation overlay (reuse the existing overlay pattern —
   `openOv`/`closeOv`, e.g. a new `ov-wiki-save`) with copy along the lines of:
   > **Send this to the wiki?**
   > This post will be sent to an admin to review and, if approved, added to the
   > shared community wiki so others can find it. The original poster stays
   > anonymous. 💛
   with **Cancel** / **Send** buttons.
3. On confirm, write a nomination doc to Firestore (see data model) and show a
   hint: "Sent to an admin for review — thank you 🙏". Guard against duplicate
   nominations of the same post (disable/checkmark the button once submitted;
   optionally track submitted ids in `localStorage` under `bbAnon_*`).

### Admin flow

1. Admins (`profile.isAdmin`) get a review queue of pending nominations. Options:
   - A new **"Wiki review"** section/pill in the Wiki tab, admin-only; or
   - Inline **Approve / Reject** controls surfaced on the nominated post itself
     when the viewer is an admin.
2. **Approve** → the post becomes a community wiki entry (see below) and the
   nomination is marked `approved`. **Reject** → marked `rejected` (with an
   optional reason), no wiki entry created.
3. Reuse the existing admin gating pattern already used for delete/ban/pin so a
   non-admin can never approve.

### Wiki integration

Today the community highlights live in `data/wiki-posts.json` (static, bundled,
hand-populated — schema: `text`, `monika`, `topic`, `addedAt`) and render via the
Wiki tab's "Wisdom"/community section. Two ways to wire approvals in:

- **Firestore-backed (preferred):** approved entries write to a new
  `bbAnonWiki/{auto}` collection; the Wiki tab reads `data/wiki-posts.json` for
  the seed set **and** merges live docs from `bbAnonWiki`. No redeploy needed to
  publish — approval is instant across devices. Requires a security rule that
  only lets admins write to `bbAnonWiki` while anyone authenticated can read.
- **Static (simpler, no rules change):** approval just surfaces the text for the
  admin to paste into `data/wiki-posts.json` and redeploy. Lower effort, but
  publishing is manual and needs a Cloudflare deploy each time.

Whichever path, keep an entry's `topic` so it slots into the right wiki section,
and carry the original poster's `monika` (the board is already pseudonymous —
confirm this is acceptable, or anonymise to "a community member").

### Data model (nomination)

```
bbAnonWikiNominations/{auto}
  postId        string     — id of the nominated bbAnonPosts doc
  postText      string     — snapshot of the text at nomination time
  postMonika    string     — original poster's monika (snapshot)
  topic         string?    — suggested wiki section (optional; admin can set on approve)
  nominatedBy   string     — nominator's monika
  status        string     — 'pending' | 'approved' | 'rejected'
  createdAt     Timestamp
  reviewedBy    string?    — admin monika, set on approve/reject
  reviewedAt    Timestamp?
  rejectReason  string?    — optional
```

Snapshot `postText`/`postMonika` at nomination time so the wiki entry survives
the original post's 7-day auto-deletion (`cleanOldPosts`).

### Notes / open questions

- **Both apps** get this automatically (shared `js/anonymous.js`) — the wiki tab
  exists in both the main BipolarBear app and the standalone Bipolar Anonymous
  app.
- **Content safety:** run the nominated text through the existing content filter
  (`findBlockedTerm`) at nomination time as a first pass; the admin validation is
  the real gate (Apple/Play UGC expectations).
- **Notification to admin:** MVP can just show the queue in-app. A later
  enhancement could email the admin (a Cloud Function, like the anon
  verification-code flow) when a nomination lands.
- Add any new Firestore collection/rules to `DOCS.md` (§2.3 Data Architecture)
  and, if new CSS/JS assets are introduced, to `STATIC_ASSETS` + bump
  `CACHE_NAME` per `CLAUDE.md`.
