import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { app, auth, db } from "./firebase";

export async function enablePushNotifications() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { enabled: false, message: "Notifications are not supported in this browser." };
  }

  const permission = await Notification.requestPermission();
  localStorage.setItem("blindspark_notifications", permission);
  if (permission !== "granted") {
    return { enabled: false, message: "Notification permission was not granted." };
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  const supported = await isSupported().catch(() => false);

  if (!supported || !vapidKey || !auth.currentUser) {
    return {
      enabled: true,
      message: auth.currentUser
        ? "Browser notifications are enabled. Add VITE_FIREBASE_VAPID_KEY to enable true push when the app is closed."
        : "Browser notifications are enabled for this demo session.",
    };
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    return { enabled: true, message: "Notifications are enabled, but no push token was returned." };
  }

  const deviceId = encodeURIComponent(token);
  await setDoc(
    doc(db, "profiles", auth.currentUser.uid, "devices", deviceId),
    {
      token,
      platform: navigator.userAgent,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return { enabled: true, message: "Push notifications are enabled for this device." };
}
