/* BlindSpark optional Firebase Cloud Messaging service worker.
   Configure VITE_FIREBASE_VAPID_KEY in the web app and Firebase Cloud Messaging
   in the Firebase project to activate closed-app push delivery. */
importScripts("https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBMS-USITSEhOvtrOCCpGpMx-sijLn0_4g",
  authDomain: "blindspark-4ae0a.firebaseapp.com",
  projectId: "blindspark-4ae0a",
  storageBucket: "blindspark-4ae0a.firebasestorage.app",
  messagingSenderId: "430634364013",
  appId: "1:430634364013:web:4be1236fb190a931c890ef"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "BlindSpark";
  const options = {
    body: payload.notification?.body || "You have something new.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});
