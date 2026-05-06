/**
 * Shared Firebase Web SDK configuration for every BipolarBear page.
 *
 * Exposes `window.BB_FIREBASE_CONFIG` so the inline `<script>` blocks in
 * index.html, journal.html, survival-kit.html, beta.html and anonymous.html
 * can call `firebase.initializeApp(window.BB_FIREBASE_CONFIG)` instead of
 * each redeclaring the same literal.
 *
 * Note on the API key: the Firebase Web SDK API key is intentionally public.
 * It identifies the project but does not grant access — read/write permissions
 * are enforced by Firestore Security Rules and Cloud Functions IAM. See:
 * https://firebase.google.com/docs/projects/api-keys
 *
 * @file js/shared/firebase-config.js
 */
window.BB_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBlF7DjbOvU4xgM47kAd6Ttx42_W1BPVUY",
  authDomain: "bipolarbear-app.firebaseapp.com",
  projectId: "bipolarbear-app",
  storageBucket: "bipolarbear-app.firebasestorage.app",
  messagingSenderId: "566288727451",
  appId: "1:566288727451:web:8921f3242193df115df53e",
  measurementId: "G-7TX0FRWEF1"
};
