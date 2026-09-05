/**
 * Firebase Cloud Messaging service worker — web push for the Bipolar
 * Anonymous board.
 *
 * Separate from `service-worker.js` (the app's offline cache) and from
 * `worker.js` (the Cloudflare edge worker). The browser requires FCM's
 * background handler to live in its own worker file at the site root:
 * `js/shared/anon-push.js` registers this one by name when a member turns
 * notifications on.
 *
 * Everything here runs with the page closed, so it can't share code with the
 * app — the Firebase config below is duplicated from
 * `js/shared/firebase-config.js` on purpose. Keep the two in step; only
 * `messagingSenderId` and `projectId`/`apiKey`/`appId` matter for messaging.
 *
 * @file firebase-messaging-sw.js
 */
/* eslint-env serviceworker */
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBlF7DjbOvU4xgM47kAd6Ttx42_W1BPVUY',
  authDomain: 'bipolarbear-app.firebaseapp.com',
  projectId: 'bipolarbear-app',
  storageBucket: 'bipolarbear-app.firebasestorage.app',
  messagingSenderId: '566288727451',
  appId: '1:566288727451:web:8921f3242193df115df53e',
});

const messaging = firebase.messaging();

// Data-only messages (the Cloud Functions send `notification` too, but a
// browser that hands us the payload here rather than showing it itself needs
// this) — one visible notification per push, tagged so a burst of replies to
// the same thread collapses instead of stacking.
messaging.onBackgroundMessage(function (payload) {
  const data = payload.data || {};
  const note = payload.notification || {};
  const title = note.title || data.title || 'Bipolar Anonymous';
  self.registration.showNotification(title, {
    body: note.body || data.body || '',
    icon: '/icons/AppIcon_anonymous.png',
    badge: '/icons/AppIcon_anonymous.png',
    tag: data.kind === 'reply' ? 'reply-' + (data.postId || '') : (data.kind || 'anon'),
    data: { url: data.url || '/anonymous.html' },
  });
});

// Focus an open board rather than opening a second copy of it.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/anonymous.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const client of list) {
        if (client.url.includes('anonymous') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
