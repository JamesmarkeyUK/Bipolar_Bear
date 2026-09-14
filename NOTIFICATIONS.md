# Bipolar Anonymous notifications — setup

Everything in the app is written and shipped. What is left is the account and
native configuration that only you can do: FCM credentials, one plugin install
per native project, and a Web Push key. Until each step below is done the
corresponding platform reports notifications as unavailable in the settings
sheet — nothing breaks, it just says so.

Work through it in any order; the three platforms are independent.

**Status (2026-09-14): all done.** Firestore rules (§1) published, Cloud
Functions (§2) deployed, web push key (§5) set in v219, Android (§4) set up in
both apps, and iOS (§3) set up in both apps with the APNs key (Universal
Simulation Ltd team, `ZH9C5TS86A`) uploaded to Firebase. Verified end to end on
2026-09-14: a reply notification (`onAnonCommentCreated`, logged `reply → …:
1/1`) reached a development build of Bipolar Anonymous on an iPhone. None of it reaches store users until the next App Store
and Play releases of both apps.

iOS bundle ids differ from Android for the main app: **`com.app.bipolarbear`**
(iOS) vs `com.bipolarbear.app` (Android). Both native projects need
`@capacitor/cli` ≥ 8.4 for the plugin's SPM `packageOptions` symlink (they're on
8.5.2), and `bipolarbear-native/ios/App/App.xcodeproj` is a symlink to
`BipolarBear.xcodeproj` so `cap sync` can find the renamed project.

## What gets sent

| Setting | Trigger | Cloud Function |
|---|---|---|
| Replies to your posts | a comment on a post you wrote | `onAnonCommentCreated` |
| New announcements | anything published to the Announcements tab (posted by you, or a member's suggestion you approved) | `onAnonAnnouncementCreated` |
| New posts | any member post in General Chat — not to the author's own devices, not for the daily topic. Off by default | `onAnonPostCreated` |
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
firebase deploy --only functions:onAnonCommentCreated,functions:onAnonAnnouncementCreated,functions:onAnonPostCreated,functions:weeklyAnonDigest,functions:onAnonSuggestionCreated
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

Per app — `bipolarbear-native` (iOS bundle `com.app.bipolarbear`) and
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

1. `google-services.json` must be in `android/app/google-services.json`. Both
   apps have one (downloaded 2026-09-13 with `firebase apps:sdkconfig ANDROID
   <appId>` — the file lists every Android app in the project, so the same
   content serves both package ids). Status-bar icon:
   `res/drawable/ic_stat_notify.xml` in each app — a white silhouette, since
   Android paints every opaque pixel white — named by the functions'
   `android.notification.icon` and set as FCM's default in the manifest.
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
  prefs: { replies, announcements, posts, weekly }
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
