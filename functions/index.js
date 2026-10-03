const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.notifyNewMessage = onDocumentCreated(
  "matches/{matchId}/messages/{messageId}",
  async (event) => {
    const message = event.data?.data();
    if (!message?.senderId) return;

    const db = getFirestore();
    const matchSnap = await db.doc(`matches/${event.params.matchId}`).get();
    if (!matchSnap.exists) return;

    const match = matchSnap.data();
    const recipients = (match.users || []).filter((uid) => uid !== message.senderId);
    if (!recipients.length) return;

    const senderSnap = await db.doc(`profiles/${message.senderId}`).get();
    const senderName = senderSnap.exists ? senderSnap.data().name || "Someone" : "Someone";

    for (const recipientId of recipients) {
      const devices = await db.collection(`profiles/${recipientId}/devices`).get();
      const tokens = devices.docs.map((doc) => doc.data().token).filter(Boolean);
      if (!tokens.length) continue;

      const body = message.text
        ? String(message.text).slice(0, 120)
        : message.imageUrl
          ? "Sent you a photo"
          : message.audioUrl
            ? "Sent you a voice note"
            : "New message";

      const response = await getMessaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `New message from ${senderName}`,
          body,
        },
        data: {
          matchId: event.params.matchId,
        },
        webpush: {
          notification: {
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png"
          },
          fcmOptions: {
            link: "/"
          }
        }
      });

      const invalid = [];
      response.responses.forEach((item, index) => {
        if (!item.success) {
          const code = item.error?.code || "";
          if (
            code.includes("registration-token-not-registered") ||
            code.includes("invalid-registration-token")
          ) {
            invalid.push(devices.docs[index].ref);
          }
        }
      });

      await Promise.all(invalid.map((ref) => ref.delete()));
    }
  }
);
