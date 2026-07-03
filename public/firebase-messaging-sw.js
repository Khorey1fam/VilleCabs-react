/* ═══════════════════════════════════════════════════════════════════════════
   VilleCabs — Firebase Cloud Messaging Service Worker
   FILE LOCATION: this MUST be saved at  public/firebase-messaging-sw.js
   (right next to your logo.png / index.html — NOT inside src/).

   Why hardcoded config? A service worker is served as a static file and cannot
   read process.env / your .env variables at runtime. These particular values
   (apiKey, projectId, senderId, appId) are CLIENT-SIDE identifiers, not secrets
   — Firebase intends them to ship in the browser, so it's safe to paste them
   here. Get them from Firebase Console → Project Settings → General →
   "Your apps" → SDK setup and configuration → Config.
   ═══════════════════════════════════════════════════════════════════════════ */

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyBVqEGP2thMlrwv381IJWjDasgfbY0qUi8',
  authDomain:        'villecabs.firebaseapp.com',
  projectId:         'villecabs',
  storageBucket:     'villecabs.firebasestorage.app',
  messagingSenderId: '889842675525',
  appId:             '1:889842675525:web:793b190fa0c06e0bb2d82c',
});

const messaging = firebase.messaging();

// Fires when a push arrives and the app is in the background / closed.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title)
    || (payload.data && payload.data.title)
    || '🚗 VilleCabs';
  const body = (payload.notification && payload.notification.body)
    || (payload.data && payload.data.body)
    || 'You have a ride update.';

  self.registration.showNotification(title, {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: (payload.data && payload.data.tag) || 'villecabs-ride',
    data: { url: (payload.data && payload.data.url) || '/' },
    vibrate: [200, 100, 200],
  });
});

// Tapping the notification focuses the app (or opens it).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
