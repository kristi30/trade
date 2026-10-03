const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");

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


exports.cleanupMatchMessages = onDocumentDeleted(
  "matches/{matchId}",
  async (event) => {
    const db = getFirestore();
    await db.recursiveDelete(event.data.ref).catch(() => undefined);
  }
);

exports.deleteMyAccountData = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

  const db = getFirestore();

  const [outgoingLikes, incomingLikes, matches] = await Promise.all([
    db.collection("likes").where("fromUserId", "==", uid).get(),
    db.collection("likes").where("toUserId", "==", uid).get(),
    db.collection("matches").where("users", "array-contains", uid).get(),
  ]);

  await Promise.all([
    ...outgoingLikes.docs.map((item) => item.ref.delete()),
    ...incomingLikes.docs.map((item) => item.ref.delete()),
    ...matches.docs.map((item) => db.recursiveDelete(item.ref)),
    db.recursiveDelete(db.doc(`profiles/${uid}`)),
  ]);

  await getAuth().deleteUser(uid);
  return { deleted: true };
});
