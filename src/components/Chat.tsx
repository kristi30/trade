import { useState, useEffect, useRef, FormEvent, DragEvent } from "react";
import { collection, doc, query, orderBy, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db, storage } from "../lib/firebase";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { Capacitor } from "@capacitor/core";
import { Profile, Match, Message } from "../types";
import { ARCHETYPES } from "../data";
import { getConversationStages, getNextConversationStage, getConversationStarter } from "../productLogic";
import { countTextMessages, generateLocalHumanReply, getBotPhotoForConversation, getNextPhotoMilestone, getPhotoAllowance } from "../chatLogic";
import { Send, ArrowLeft, Sparkles, Info, Image, X, Lock, Unlock, Mic, Reply, Heart, CheckCheck, Square } from "lucide-react";

// Locally bundled demo images avoid third-party hotlink blocks in installed PWAs.
const PRESET_IMAGES = [
  { name: "Cozy Café ☕", url: "/demo-photos/cafe.svg" },
  { name: "Sunset Walk 🌅", url: "/demo-photos/sunset.svg" },
  { name: "Bookstore Find 📚", url: "/demo-photos/books.svg" },
  { name: "Vinyl Night 🎵", url: "/demo-photos/records.svg" },
];

interface PendingReply {
  id: string;
  sourceMessageId: string;
  dueAt: number;
  text: string;
  imageUrl?: string;
}

interface ChatProps {
  match: Match;
  currentUser: Profile;
  partnerProfile: Profile;
  onBack: () => void;
  onViewProfile?: () => void;
}

export default function Chat({ match, currentUser, partnerProfile, onBack, onViewProfile }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [useLocalFallback, setUseLocalFallback] = useState(false);
  const messageContainerRef = useRef<HTMLDivElement | null>(null);

  // Image attach & drag-and-drop state variables
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<string | null>(null);
  const [partnerReadAt, setPartnerReadAt] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const typingTimerRef = useRef<number | null>(null);
  const lastNotifiedMessageRef = useRef<string | null>(null);
  const scheduledReplyIdsRef = useRef<Set<string>>(new Set());
  const pendingReplyKey = `blindspark_pending_replies_${match.id}`;
  const isLocalMode = !currentUser.id || currentUser.id.startsWith("local_") || match.id.startsWith("local_");
  const activeLocalMode = isLocalMode || useLocalFallback;
  const isDemoPartner = Boolean(partnerProfile.isAI || partnerProfile.id.startsWith("seed_"));

  // Subscribe to real-time messages in Firestore or localStorage
  useEffect(() => {
    if (isLocalMode || useLocalFallback) {
      // Load initial messages from localStorage
      const localMsgsStr = localStorage.getItem(`blindspark_messages_${match.id}`);
      let localMsgsList: Message[] = [];
      if (localMsgsStr) {
        localMsgsList = JSON.parse(localMsgsStr);
      } else {
        // Bots only text if user text first, so start completely empty
        localMsgsList = [];
        localStorage.setItem(`blindspark_messages_${match.id}`, JSON.stringify(localMsgsList));
      }
      setMessages(localMsgsList);
      return;
    }

    const msgRef = collection(db, "matches", match.id, "messages");
    const q = query(msgRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: Message[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        fetched.push({
          id: docSnap.id,
          senderId: data.senderId,
          text: data.text,
          imageUrl: data.imageUrl,
          audioUrl: data.audioUrl,
          replyToId: data.replyToId,
          replyToText: data.replyToText,
          reaction: data.reaction,
          createdAt: data.createdAt,
        });
      });
      setMessages(fetched);
    }, (error) => {
      console.warn("Firestore messages onSnapshot failed, falling back to local messages:", error);
      setUseLocalFallback(true);
      const localMsgsStr = localStorage.getItem(`blindspark_messages_${match.id}`) || "[]";
      setMessages(JSON.parse(localMsgsStr));
    });

    return () => unsubscribe();
  }, [match.id, currentUser.id, partnerProfile.id, useLocalFallback]);

  // Real-user chats use the match document for lightweight typing + read receipts.
  useEffect(() => {
    if (activeLocalMode) return;
    const unsubscribe = onSnapshot(doc(db, "matches", match.id), (snapshot) => {
      const data = snapshot.data() as Match | undefined;
      const typingMap = data?.typing || {};
      const readMap = data?.readBy || {};
      setPartnerTyping(Boolean(typingMap[partnerProfile.id]));
      const partnerRead = readMap[partnerProfile.id];
      const millis = partnerRead?.toMillis?.() || (partnerRead?.seconds ? partnerRead.seconds * 1000 : 0);
      setPartnerReadAt(millis);
    });
    return () => unsubscribe();
  }, [match.id, partnerProfile.id, activeLocalMode]);

  useEffect(() => {
    if (activeLocalMode || messages.length === 0) return;
    void updateDoc(doc(db, "matches", match.id), {
      [`readBy.${currentUser.id}`]: serverTimestamp(),
    }).catch(() => undefined);
  }, [messages.length, activeLocalMode, match.id, currentUser.id]);

  // Scroll message container to bottom whenever messages load or update (without moving document window)
  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTo({
        top: messageContainerRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, isTyping]);

  // Photo sharing is based only on TEXT messages: 30 => 1 each, 50 => 2 each, 80 => unlimited.
  const totalMessagesTexted = countTextMessages(messages);
  const sentPicturesCount = messages.filter((m) => m.senderId === currentUser.id && m.imageUrl).length;
  const partnerPicturesCount = messages.filter((m) => m.senderId === partnerProfile.id && m.imageUrl).length;
  const maxPictures = getPhotoAllowance(totalMessagesTexted);
  const slotsRemaining = maxPictures === Infinity ? Infinity : Math.max(0, maxPictures - sentPicturesCount);
  const nextPhotoMilestone = getNextPhotoMilestone(totalMessagesTexted);
  const messagesUntilNextPhoto = nextPhotoMilestone === null ? 0 : Math.max(0, nextPhotoMilestone - totalMessagesTexted);
  const conversationStages = getConversationStages(totalMessagesTexted);
  const nextConversationStage = getNextConversationStage(totalMessagesTexted);
  const voiceUnlocked = totalMessagesTexted >= 100;
  const unlockedPrompt = totalMessagesTexted >= 15 ? Object.entries(partnerProfile.sparkPrompts || {})[0] : undefined;
  const latestOutgoing = [...messages].reverse().find((message) => message.senderId === currentUser.id);
  const latestOutgoingMillis = latestOutgoing?.createdAt?.toMillis?.() || (latestOutgoing?.createdAt?.seconds ? latestOutgoing.createdAt.seconds * 1000 : 0);

  // Images are type/size checked first. Real-account uploads are also sent through
  // the server moderation hook before being stored in Firebase Storage.
  const moderateImage = async (dataUrl: string) => {
    if (activeLocalMode) return true;
    try {
      const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
      const response = await fetch(`${apiBaseUrl}/api/moderate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      if (!response.ok) return false;
      const data = await response.json();
      return Boolean(data.allowed);
    } catch {
      return false;
    }
  };

  const uploadBlob = async (blob: Blob, kind: "photos" | "voice", extension: string) => {
    const ref = storageRef(storage, `matches/${match.id}/${kind}/${currentUser.id}_${Date.now()}.${extension}`);
    await uploadBytes(ref, blob, { contentType: blob.type || undefined });
    return getDownloadURL(ref);
  };

  const handleFileChange = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Please choose an image under 5 MB.");
      return;
    }
    if (slotsRemaining <= 0) {
      alert("No picture slots available yet! Keep texting to unlock photo sharing.");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    if (!activeLocalMode) {
      const allowed = await moderateImage(dataUrl);
      if (!allowed) {
        alert("This image could not be approved for sharing. Please choose another one.");
        return;
      }
      try {
        const extension = file.name.split(".").pop() || "jpg";
        const url = await uploadBlob(file, "photos", extension);
        setAttachedImage(url);
      } catch (error) {
        console.warn("Photo upload failed:", error);
        alert("Photo upload is not configured yet for this Firebase project.");
        return;
      }
    } else {
      setAttachedImage(dataUrl);
    }

    setShowPresets(false);
  };

  const selectPresetImage = (url: string) => {
    if (slotsRemaining <= 0) {
      alert("No picture slots available yet! Keep texting to unlock photo sharing.");
      return;
    }
    setAttachedImage(url);
    setShowPresets(false);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (slotsRemaining > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (slotsRemaining > 0 && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const toggleVoiceRecording = async () => {
    if (!voiceUnlocked) {
      alert(`Voice notes unlock at 100 total text messages. You need ${Math.max(0, 100 - totalMessagesTexted)} more.`);
      return;
    }

    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        try {
          const url = activeLocalMode
            ? await blobToDataUrl(blob)
            : await uploadBlob(blob, "voice", "webm");
          setRecordedAudio(url);
        } catch (error) {
          console.warn("Voice upload failed:", error);
          alert("Voice upload is not configured yet for this Firebase project.");
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 30_000);
    } catch (error) {
      console.warn("Microphone unavailable:", error);
      alert("Microphone access is required for voice notes.");
    }
  };

  const toggleReaction = async (message: Message) => {
    const reaction = message.reaction === "❤️" ? "" : "❤️";
    const updated = messages.map((item) => item.id === message.id ? { ...item, reaction } : item);
    setMessages(updated);
    localStorage.setItem(`blindspark_messages_${match.id}`, JSON.stringify(updated));
    if (!activeLocalMode) {
      await setDoc(doc(db, "matches", match.id, "messages", message.id), { reaction }, { merge: true }).catch(() => undefined);
    }
  };

  const handleInputChange = (value: string) => {
    setInputText(value);
    if (activeLocalMode) return;
    void updateDoc(doc(db, "matches", match.id), {
      [`typing.${currentUser.id}`]: Boolean(value.trim()),
    }).catch(() => undefined);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      void updateDoc(doc(db, "matches", match.id), {
        [`typing.${currentUser.id}`]: false,
      }).catch(() => undefined);
    }, 1800);
  };

  const readPendingReplies = (): PendingReply[] => {
    try {
      return JSON.parse(localStorage.getItem(pendingReplyKey) || "[]");
    } catch {
      return [];
    }
  };

  const writePendingReplies = (items: PendingReply[]) => {
    localStorage.setItem(pendingReplyKey, JSON.stringify(items));
  };

  const deliverPendingReply = async (pending: PendingReply) => {
    const latestMessages: Message[] = JSON.parse(localStorage.getItem(`blindspark_messages_${match.id}`) || "[]");
    if (latestMessages.some((m) => m.id === pending.id)) {
      writePendingReplies(readPendingReplies().filter((item) => item.id !== pending.id));
      scheduledReplyIdsRef.current.delete(pending.id);
      return;
    }

    const partnerMsg: Message = {
      id: pending.id,
      senderId: partnerProfile.id,
      text: pending.text,
      ...(pending.imageUrl ? { imageUrl: pending.imageUrl } : {}),
      createdAt: { seconds: pending.dueAt / 1000, nanoseconds: 0 } as any,
    };

    const withReply = [...latestMessages, partnerMsg];
    localStorage.setItem(`blindspark_messages_${match.id}`, JSON.stringify(withReply));
    setMessages(withReply);
    setPartnerReadAt(Date.now());

    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
      new Notification(`New message from ${partnerProfile.name}`, {
        body: pending.text || "Sent you something new",
        icon: "/icons/icon-192.png",
      });
    }

    if (!activeLocalMode) {
      try {
        await setDoc(doc(db, "matches", match.id, "messages", pending.id), {
          senderId: partnerProfile.id,
          text: pending.text,
          ...(pending.imageUrl ? { imageUrl: pending.imageUrl } : {}),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn("Could not save delayed partner reply to Firestore; keeping local copy.", err);
        setUseLocalFallback(true);
      }
    }

    writePendingReplies(readPendingReplies().filter((item) => item.id !== pending.id));
    scheduledReplyIdsRef.current.delete(pending.id);
    setIsTyping(false);
  };

  const schedulePendingReply = (pending: PendingReply) => {
    if (scheduledReplyIdsRef.current.has(pending.id)) return;
    scheduledReplyIdsRef.current.add(pending.id);

    const remaining = Math.max(0, pending.dueAt - Date.now());
    const typingDelay = Math.max(0, remaining - 5000);
    window.setTimeout(() => setIsTyping(true), typingDelay);
    window.setTimeout(() => {
      void deliverPendingReply(pending);
    }, remaining);
  };

  const queueReplyForExactMinute = (sourceMessageId: string, text: string, imageUrl: string | undefined, dueAt: number) => {
    const pending: PendingReply = {
      id: `msg_reply_${sourceMessageId}`,
      sourceMessageId,
      dueAt,
      text,
      ...(imageUrl ? { imageUrl } : {}),
    };
    const queue = readPendingReplies().filter((item) => item.sourceMessageId !== sourceMessageId);
    queue.push(pending);
    writePendingReplies(queue);
    schedulePendingReply(pending);
  };

  // Resume delayed replies after navigating away/back or reopening the installed PWA.
  useEffect(() => {
    readPendingReplies().forEach(schedulePendingReply);
  }, [match.id]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !attachedImage && !recordedAudio) return;

    const sentAt = Date.now();
    const replyDueAt = sentAt + 60_000;
    const textToSend = inputText.trim();
    const imageToSend = attachedImage;
    const audioToSend = recordedAudio;

    if (imageToSend && slotsRemaining <= 0) {
      alert(nextPhotoMilestone
        ? `Your next photo unlock is at ${nextPhotoMilestone} total text messages.`
        : "Photo sharing is currently unavailable.");
      return;
    }

    setInputText("");
    setAttachedImage(null);
    setRecordedAudio(null);
    setReplyingTo(null);
    setShowPresets(false);

    const userMsg: Message = {
      id: `msg_${sentAt}_${Math.random().toString(36).substring(2, 6)}`,
      senderId: currentUser.id,
      text: textToSend,
      ...(imageToSend ? { imageUrl: imageToSend } : {}),
      ...(audioToSend ? { audioUrl: audioToSend } : {}),
      ...(replyingTo ? { replyToId: replyingTo.id, replyToText: replyingTo.text || (replyingTo.imageUrl ? "Photo" : "Message") } : {}),
      createdAt: { seconds: sentAt / 1000, nanoseconds: 0 } as any,
    };

    const currentLocalMsgs: Message[] = JSON.parse(localStorage.getItem(`blindspark_messages_${match.id}`) || "[]");
    const updatedLocalMsgs = [...currentLocalMsgs, userMsg];
    localStorage.setItem(`blindspark_messages_${match.id}`, JSON.stringify(updatedLocalMsgs));
    setMessages(updatedLocalMsgs);

    if (!activeLocalMode) {
      try {
        await setDoc(doc(db, "matches", match.id, "messages", userMsg.id), {
          senderId: currentUser.id,
          text: textToSend,
          ...(imageToSend ? { imageUrl: imageToSend } : {}),
          ...(audioToSend ? { audioUrl: audioToSend } : {}),
          ...(replyingTo ? { replyToId: replyingTo.id, replyToText: replyingTo.text || (replyingTo.imageUrl ? "Photo" : "Message") } : {}),
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, "matches", match.id), {
          [`typing.${currentUser.id}`]: false,
        }).catch(() => undefined);
      } catch (error) {
        console.warn("Could not save message to Firestore, switching to local fallback:", error);
        setUseLocalFallback(true);
      }
    }

    if (!isDemoPartner) {
      return;
    }

    const localReplyText = generateLocalHumanReply(textToSend, partnerProfile, currentUser, updatedLocalMsgs);
    const localReplyImage = getBotPhotoForConversation(updatedLocalMsgs, partnerProfile, true);

    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
    const nativeWithoutBackend = Capacitor.isNativePlatform() && !apiBaseUrl;

    if (nativeWithoutBackend) {
      queueReplyForExactMinute(userMsg.id, localReplyText, localReplyImage, replyDueAt);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api/chat-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchedUser: partnerProfile,
          currentUser,
          messages: updatedLocalMsgs.slice(-24),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        queueReplyForExactMinute(
          userMsg.id,
          (data.reply || localReplyText).trim(),
          data.imageUrl || localReplyImage,
          replyDueAt,
        );
      } else {
        console.warn("AI endpoint unavailable; using local conversational fallback.");
        queueReplyForExactMinute(userMsg.id, localReplyText, localReplyImage, replyDueAt);
      }
    } catch (error) {
      console.warn("AI endpoint failed; using local conversational fallback.", error);
      queueReplyForExactMinute(userMsg.id, localReplyText, localReplyImage, replyDueAt);
    }
  };

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.senderId !== partnerProfile.id || lastNotifiedMessageRef.current === last.id) return;
    lastNotifiedMessageRef.current = last.id;
    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
      new Notification(`New message from ${partnerProfile.name}`, {
        body: last.text || (last.imageUrl ? "Sent you a photo" : last.audioUrl ? "Sent you a voice note" : "New message"),
        icon: "/icons/icon-192.png",
      });
    }
  }, [messages, partnerProfile.id, partnerProfile.name]);

  const partnerArchetype = ARCHETYPES[partnerProfile.archetype];

  return (
    <div className="chat-screen-shell flex flex-col bg-white md:border md:border-stone-200/75 rounded-none md:rounded-3xl relative md:shadow-2xl">
      {/* Chat Header */}
      <div className={`p-4 bg-gradient-to-r ${partnerArchetype.gradient} border-b border-stone-200/60 flex items-center gap-3 z-10 shadow-xs`}>
        <button
          onClick={onBack}
          className="p-2.5 bg-white/60 hover:bg-white border border-stone-200/40 hover:border-stone-300 rounded-xl text-stone-600 hover:text-stone-900 transition-all cursor-pointer shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div
          onClick={onViewProfile}
          className="flex-1 cursor-pointer group"
          title="Click to view full bio details"
        >
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-black text-stone-900 group-hover:text-rose-950 transition-colors flex items-center gap-1">
              <span>{partnerProfile.name}, {partnerProfile.age}</span>
              <Info className="w-3.5 h-3.5 text-stone-500/60 group-hover:text-rose-600 transition-colors" />
            </h3>
            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${partnerArchetype.textColor.replace('-400', '-600')} bg-white/85 border border-stone-200 uppercase shadow-xs`}>
              {partnerArchetype.name}
            </span>
          </div>
          <span className="text-[10px] text-stone-500 font-medium group-hover:underline decoration-stone-300">
            View spark profile details
          </span>
        </div>

        <button
          onClick={onViewProfile}
          className="bg-white/90 hover:bg-white border border-stone-200/50 rounded-xl px-2.5 py-1 text-xs font-black text-rose-600 shadow-xs cursor-pointer transition-all hover:scale-105"
        >
          {match.score}% match
        </button>
      </div>

      {/* Conversation progression */}
      <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-200/40 z-10 select-none">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black text-stone-700">
              {nextConversationStage
                ? `${totalMessagesTexted}/${nextConversationStage.threshold} texts · next: ${nextConversationStage.label}`
                : "All conversation unlocks reached ✨"}
            </div>
            <div className="text-[9px] text-stone-500 mt-0.5">
              {nextConversationStage?.description || "Photos and voice notes are fully open."}
            </div>
          </div>
          <div className="text-[9px] bg-stone-200 text-stone-600 px-2 py-1 rounded-full font-bold shrink-0">
            {totalMessagesTexted} texts
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-stone-200 mt-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 transition-all"
            style={{ width: `${Math.min(100, (totalMessagesTexted / 100) * 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          {conversationStages.slice(1).map((stage) => (
            <span key={stage.threshold} className={`text-[8px] font-bold ${stage.unlocked ? "text-rose-600" : "text-stone-350"}`}>
              {stage.threshold}
            </span>
          ))}
        </div>
      </div>

      {/* Message Pane */}
      <div 
        ref={messageContainerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="chat-message-pane flex-1 p-4 flex flex-col gap-3.5 bg-[#fffaf4] scrollbar-none relative"
      >
        {/* Drag and Drop Overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-rose-50/90 backdrop-blur-xs border-2 border-dashed border-rose-300 m-2 rounded-2xl flex flex-col items-center justify-center gap-2 z-30 transition-all">
            <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center shadow-md border border-rose-250">
              <Unlock className="w-5 h-5 text-rose-500 animate-bounce" />
            </div>
            <p className="text-xs font-black text-rose-950">Drop your photo here! ✨</p>
            <p className="text-[10px] text-rose-700 font-semibold">Slots available: {slotsRemaining === Infinity ? "Unlimited" : slotsRemaining}</p>
          </div>
        )}

        {messages.length === 0 && !isTyping && (
          <div className="my-auto text-center flex flex-col items-center gap-3 px-4">
            <div className="w-10 h-10 bg-white border border-stone-200/60 rounded-xl flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5 text-rose-500 animate-pulse" />
            </div>
            <p className="text-xs text-stone-500 font-medium max-w-xs leading-relaxed">
              Spark ignited! Send a message to explore compatibility. Share things you wouldn't tell a stranger.
            </p>
          </div>
        )}

        {unlockedPrompt && (
          <div className="self-center w-full max-w-sm rounded-2xl border border-rose-200 bg-rose-50/70 p-3 text-center">
            <div className="text-[9px] uppercase tracking-widest font-black text-rose-600">15-text reveal unlocked</div>
            <div className="text-[11px] font-bold text-stone-700 mt-1">{unlockedPrompt[0]}</div>
            <div className="text-[11px] text-stone-600 mt-1">“{unlockedPrompt[1]}”</div>
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.senderId === currentUser.id;
          return (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[80%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
            >
              {/* Sender Name label */}
              <span className="text-[9px] text-stone-400 uppercase tracking-widest font-extrabold mb-1 px-1">
                {isMe ? "You" : partnerProfile.name}
              </span>
              <div
                className={`p-1.5 rounded-2xl text-xs font-medium leading-relaxed shadow-xs ${
                  isMe
                    ? "bg-stone-900 text-white rounded-tr-none"
                    : `bg-white border border-stone-200 ${partnerArchetype.textColor.replace('-400', '-600')} rounded-tl-none`
                }`}
              >
                {msg.replyToText && (
                  <div className="mx-1 mt-1 mb-1.5 rounded-lg bg-black/5 border-l-2 border-rose-400 px-2 py-1 text-[9px] opacity-80">
                    Replying to: {msg.replyToText}
                  </div>
                )}
                {msg.imageUrl && (
                  <div 
                    onClick={() => setFullScreenImage(msg.imageUrl || null)}
                    className="mb-1.5 rounded-xl overflow-hidden cursor-zoom-in max-w-[200px] border border-stone-200 shadow-2xs relative group"
                  >
                    <img
                      src={msg.imageUrl}
                      alt="Shared photo"
                      className="max-h-40 object-cover w-full transition-transform duration-200 group-hover:scale-102"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/15 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-[10px] bg-white/95 text-stone-900 px-2.5 py-1 rounded-lg font-bold shadow-xs">
                        View Photo
                      </span>
                    </div>
                  </div>
                )}
                {msg.audioUrl && (
                  <audio controls src={msg.audioUrl} className="max-w-[220px] h-9 mx-1 my-1" />
                )}
                {msg.text && (
                  <div className="px-2.5 py-1 text-xs">
                    {msg.text}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 px-1">
                <button type="button" onClick={() => setReplyingTo(msg)} className="text-[9px] text-stone-400 hover:text-stone-700 flex items-center gap-1">
                  <Reply className="w-3 h-3" /> Reply
                </button>
                <button type="button" onClick={() => void toggleReaction(msg)} className="text-[9px] text-stone-400 hover:text-rose-600 flex items-center gap-1">
                  <Heart className="w-3 h-3" /> {msg.reaction || "React"}
                </button>
                {isMe && latestOutgoing?.id === msg.id && partnerReadAt >= latestOutgoingMillis && partnerReadAt > 0 && (
                  <span className="text-[9px] text-emerald-600 flex items-center gap-1"><CheckCheck className="w-3 h-3" /> Seen</span>
                )}
              </div>
            </div>
          );
        })}

        {/* Typings / Thinking Indicator */}
        {(isTyping || partnerTyping) && (
          <div className="self-start flex flex-col max-w-[80%] items-start animate-pulse">
            <span className="text-[9px] text-stone-400 uppercase tracking-widest font-extrabold mb-1 px-1">
              {partnerProfile.name}
            </span>
            <div className={`px-4 py-3 bg-white border border-stone-200 rounded-2xl rounded-tl-none text-xs ${partnerArchetype.textColor.replace('-400', '-600')} flex gap-1 items-center shadow-xs`}>
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* Attachment Preview Drawer */}
      {attachedImage && (
        <div className="px-4 py-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-3 animate-fade-in z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-lg overflow-hidden border border-stone-300 relative bg-stone-200 shadow-2xs">
              <img src={attachedImage} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div>
              <p className="text-xs font-black text-stone-850">Photo Attached 📸</p>
              <p className="text-[10px] text-stone-500 font-semibold">Press Send to unlock deep connection.</p>
            </div>
          </div>
          <button
            onClick={() => setAttachedImage(null)}
            className="p-1.5 hover:bg-stone-200 rounded-full text-stone-500 hover:text-stone-800 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Presets Selection Drawer */}
      {showPresets && activeLocalMode && (
        <div className="p-3.5 bg-white border-t border-stone-200 space-y-3 animate-fade-in max-h-56 overflow-y-auto z-10 shadow-lg">
          <div className="flex items-center justify-between">
            <h5 className="text-[10px] uppercase font-black tracking-widest text-stone-500">Attach Simulated Lifestyle Photo</h5>
            <button 
              onClick={() => setShowPresets(false)}
              className="text-stone-400 hover:text-stone-600 cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_IMAGES.map((img) => (
              <button
                key={img.name}
                type="button"
                onClick={() => selectPresetImage(img.url)}
                className="flex items-center gap-2 p-1.5 bg-stone-50 hover:bg-rose-50 border border-stone-200 hover:border-rose-300 rounded-xl text-left transition-all cursor-pointer"
              >
                <img src={img.url} className="w-8 h-8 rounded-lg object-cover border border-stone-200" referrerPolicy="no-referrer" />
                <span className="text-[10px] font-bold text-stone-700">{img.name}</span>
              </button>
            ))}
          </div>
          <div className="text-center pt-1.5 border-t border-stone-100 flex items-center justify-center gap-1">
            <span className="text-[10px] text-stone-400 font-semibold">Or attach custom files:</span>
            <button
              type="button"
              onClick={() => {
                setShowPresets(false);
                fileInputRef.current?.click();
              }}
              className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
            >
              Browse device files
            </button>
          </div>
        </div>
      )}

      {replyingTo && (
        <div className="px-3 py-2 bg-rose-50 border-t border-rose-100 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="text-[9px] uppercase font-black text-rose-600">Replying</div>
            <div className="text-[10px] text-stone-600 truncate">{replyingTo.text || (replyingTo.imageUrl ? "Photo" : "Message")}</div>
          </div>
          <button type="button" onClick={() => setReplyingTo(null)}><X className="w-4 h-4 text-stone-500" /></button>
        </div>
      )}

      {recordedAudio && (
        <div className="px-3 py-2 bg-stone-50 border-t border-stone-100 flex items-center gap-2 shrink-0">
          <audio controls src={recordedAudio} className="h-8 flex-1" />
          <button type="button" onClick={() => setRecordedAudio(null)}><X className="w-4 h-4 text-stone-500" /></button>
        </div>
      )}

      {/* Input Box */}
      <form
        onSubmit={handleSendMessage}
        className="chat-composer-safe px-3 pt-3 bg-white border-t border-stone-200/80 flex items-center gap-2 z-10 relative shrink-0"
      >
        {/* Hidden native input file trigger */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              void handleFileChange(e.target.files[0]);
            }
          }}
          accept="image/*"
          className="hidden"
        />

        {/* Dynamic Photo Attachment Toggle */}
        <button
          type="button"
          onClick={() => {
            if (slotsRemaining <= 0) {
              alert(nextPhotoMilestone
                ? `Photo sharing: ${messagesUntilNextPhoto} more text messages until the next slot unlocks.`
                : "You have used your current photo slots.");
              return;
            }
            if (activeLocalMode) setShowPresets(!showPresets);
            else fileInputRef.current?.click();
          }}
          className={`p-3 rounded-xl border border-stone-200/80 transition-all cursor-pointer flex items-center justify-center relative shrink-0 ${
            slotsRemaining > 0 
              ? "bg-white hover:bg-rose-50/30 text-rose-500 hover:border-rose-200" 
              : "bg-stone-50 text-stone-350 cursor-not-allowed border-stone-100"
          }`}
          title={slotsRemaining > 0 ? "Attach photo" : "Photo sharing locked (send more letters to unlock)"}
        >
          <Image className="w-4 h-4" />
          {slotsRemaining > 0 && slotsRemaining !== Infinity && (
            <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white font-extrabold text-[8px] h-4.5 w-4.5 rounded-full flex items-center justify-center shadow-3xs">
              {slotsRemaining}
            </span>
          )}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={
            slotsRemaining > 0
              ? `Drop photo or text ${partnerProfile.name}...`
              : `Spark a letter to ${partnerProfile.name}...`
          }
          maxLength={300}
          className="flex-1 bg-stone-50 border border-stone-200 focus:border-rose-400 text-xs rounded-xl px-3.5 py-3 focus:outline-none transition-all text-stone-900 placeholder-stone-400 font-medium"
        />

        <button
          type="button"
          onClick={() => void toggleVoiceRecording()}
          className={`p-3 rounded-xl border shrink-0 transition-all ${voiceUnlocked ? "bg-white border-stone-200 text-rose-500" : "bg-stone-50 border-stone-100 text-stone-300"}`}
          title={voiceUnlocked ? "Record a voice note (max 30s)" : `Voice notes unlock at 100 texts`}
        >
          {recording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
        </button>

        <button
          type="submit"
          disabled={!inputText.trim() && !attachedImage && !recordedAudio}
          className="p-3 bg-stone-900 hover:bg-stone-850 disabled:bg-stone-100 text-white disabled:text-stone-400 rounded-xl transition-all cursor-pointer shadow-md shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Full-screen Lightbox Zoom Modal */}
      {fullScreenImage && (
        <div 
          onClick={() => setFullScreenImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 cursor-zoom-out animate-fade-in"
        >
          <div className="relative max-w-md w-full max-h-[85vh] flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setFullScreenImage(null)}
              className="absolute -top-11 right-2 p-2.5 text-white/90 hover:text-white transition-colors text-[11px] font-black bg-white/10 hover:bg-white/20 rounded-xl cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
            <img 
              src={fullScreenImage} 
              alt="Zoomed shared photo" 
              className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl border border-white/10" 
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
