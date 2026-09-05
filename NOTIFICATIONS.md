# Bipolar Anonymous notifications — setup

Everything in the app is written and shipped. What is left is the account and
native configuration that only you can do: FCM credentials, one plugin install
per native project, and a Web Push key. Until each step below is done the
corresponding platform reports notifications as unavailable in the settings
sheet — nothing breaks, it just says so.

Work through it in any order; the three platforms are independent.

## What gets sent

| Setting | Trigger | Cloud Function |
|---|---|---|
| Replies to your posts | a comment on a post you wrote | `onAnonCommentCreated` |
| New announcements | anything published to the Announcements tab (posted by you, or a member's suggestion you approved) | `onAnonAnnouncementCreated` |
| Weekly summary | Sundays 18:00 Europe/London, skipped in a week with no posts | `weeklyAnonDigest` |

Plus `onAnonSuggestionCreated`, which emails you (via Resend, like feedback and
beta signups) whenever a member suggests an announcement.

**Notifications never carry post or comment text.** "Someone replied to your
post on Bipolar Anonymous" is the whole body. A notification lands on a lock
screen where anyone nearby can read it, and this is a mental-health community —
the prompt to open the app is worth sending; the content is not.

## 1. Firestore rules

Two new collections. Paste alongside the existing rules (console → Firestore →
Rules). The full set, with the announcements gate, is in `DOCS.md` §2.11.

```js
// Push registrations. One doc per FCM token, id = the token itself.
// Never readable: a client only ever writes its own, and the token id is
// unguessable. Cloud Functions read them with the admin SDK, which bypasses
// rules.
match /bbAnonPush/{token} {
  allow read:   if false;
  allow create, update, delete: if request.auth != null;
}

// Member-suggested announcements (see DOCS.md §2.11).
match /bbAnonAnnSuggestions/{id} {
  allow read:   if request.auth != null;
  allow create: if request.auth != null && request.resource.data.status == 'pending';
  allow update: if request.auth != null
    && request.auth.token.email == 'inbox@jamesmarkey.co.uk';
  allow delete: if request.auth != null;
}
```

And the announcements gate on posts, which is what makes announcements
admin-only server-side rather than only in the UI:

```js
match /bbAnonPosts/{postId} {
  // …existing rules…
  allow create: if request.auth != null
    && (request.resource.data.tab != 'announcements'
        || request.auth.token.email == 'inbox@jamesmarkey.co.uk');
}
```

## 2. Deploy the functions

```bash
cd functions
npm install
firebase deploy --only functions:onAnonCommentCreated,functions:onAnonAnnouncementCreated,functions:weeklyAnonDigest,functions:onAnonSuggestionCreated
```

`weeklyAnonDigest` is a scheduled function, so the first deploy also creates a
Cloud Scheduler job — the project needs the Blaze plan and the Cloud Scheduler
API enabled (the deploy prompts if not).

Check it works without waiting a week:

```bash
# fire the digest by hand
gcloud scheduler jobs run firebase-schedule-weeklyAnonDigest-europe-west1 \
  --location=europe-west1
# then read the logs
firebase functions:log --only weeklyAnonDigest
```

## 3. iOS (both apps)

Per app — `bipolarbear-native` (`com.bipolarbear.app`) and
`bipolaranonymous-native` (`com.bipolaranonymous.app`):

1. **APNs key** (once for the whole Apple team, not per app):
   Apple Developer → Certificates, Identifiers & Profiles → Keys → **+** →
   tick *Apple Push Notifications service* → download the `.p8` (you get one
   download, ever — keep it somewhere durable).
2. Firebase Console → Project settings → **Cloud Messaging** → under each iOS
   app → **APNs Authentication Key** → upload the `.p8` with its Key ID and
   your Team ID.
3. Firebase Console → Project settings → **Add app → iOS** if the bundle id
   isn't registered yet, then download `GoogleService-Info.plist` and drag it
   into the Xcode project (`App/App/`, "Copy items if needed", target App).
   Each bundle id gets its own plist — do not share one between the two apps.
4. In the native project:
   ```bash
   npm install          # picks up @capacitor-firebase/messaging
   npx cap sync ios
   ```
5. Xcode → target **App** → Signing & Capabilities → **+ Capability**:
   - **Push Notifications**
   - **Background Modes** → tick *Remote notifications*
6. Build to a real device (the simulator can't register for push) and check the
   settings sheet offers the switches.

## 4. Android (both apps)

1. `google-services.json` for each package id must be in
   `android/app/google-services.json`. Both apps already have one; if you
   regenerate it, use the file for that exact package id.
2. ```bash
   npm install
   npx cap sync android
   ```
3. Android 13+ asks for the `POST_NOTIFICATIONS` permission at runtime — the
   plugin declares it and the opt-in sheet triggers the prompt. Nothing to add
   to the manifest.

## 5. Web push (bipolarbear.app / bipolaranonymous.app)

1. Firebase Console → Project settings → **Cloud Messaging** → *Web
   configuration* → **Web Push certificates** → Generate key pair.
2. Paste the public key into `js/shared/firebase-config.js`:
   ```js
   window.BB_PUSH_VAPID_KEY = 'B…';   // the key from the console
   ```
   It is public by design — it identifies the sender to the browser's push
   service; the private half stays with Google.
3. `firebase-messaging-sw.js` is already in the repo root and deploys with
   Cloud Pages. It must stay at the root: a service worker can only control
   pages at or below its own path.
4. Bump `CACHE_NAME` in `service-worker.js` with the config change so returning
   browsers pick up the new `firebase-config.js`.

Safari only delivers web push to an **installed** PWA (Add to Home Screen), and
never in a private window. Chrome and Firefox deliver to an ordinary tab.

## Checking a registration by hand

Every subscribed device writes one document:

```
bbAnonPush/{fcmToken}
  prefs: { replies, announcements, weekly }
  monikaLower     — who to notify about replies (a post carries a monika, not an account)
  emailHash       — sha256 of the member's email, same key anonProfiles uses
  platform        — 'ios' | 'android' | 'web'
  bundle          — 'main' | 'anonymous'
  lang            — which of the ten locales to send in
  updatedAt
```

Dead tokens clean themselves up: FCM reports
`registration-token-not-registered` and the sender deletes the document. Signing
out, deleting the account, or turning the last switch off deletes it from the
client side.
