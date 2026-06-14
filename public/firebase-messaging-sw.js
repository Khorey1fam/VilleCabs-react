importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyBVqEGP2thMlrwv381IJWjDasgfbY0qUi8",
  authDomain:        "villecabs.firebaseapp.com",
  projectId:         "villecabs",
  storageBucket:     "villecabs.firebasestorage.app",
  messagingSenderId: "889842675525",
  appId:             "1:889842675525:web:793b190fa0c06e0bb2d82c"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
  });
}); 
