import { useState, useEffect, useRef, FormEvent, DragEvent } from "react";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Capacitor } from "@capacitor/core";
import { Profile, Match, Message } from "../types";
import { ARCHETYPES } from "../data";
import { countTextMessages, generateLocalHumanReply, getBotPhotoForConversation, getNextPhotoMilestone, getPhotoAllowance } from "../chatLogic";
import { Send, ArrowLeft, ShieldAlert, Sparkles, Info, Image, X, Lock, Unlock } from "lucide-react";

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
  const [useLocalFallback, setUseLocalFallback] = useState(false);
  const messageContainerRef = useRef<HTMLDivElement | null>(null);

  // Image attach & drag-and-drop state variables
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scheduledReplyIdsRef = useRef<Set<string>>(new Set());
  const pendingReplyKey = `blindspark_pending_replies_${match.id}`;
  const isLocalMode = !currentUser.id || currentUser.id.startsWith("local_") || match.id.startsWith("local_");
  const activeLocalMode = isLocalMode || useLocalFallback;

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

  // File selected conversion
  const handleFileChange = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }
    if (slotsRemaining <= 0) {
      alert("No picture slots available yet! Keep texting to unlock photo sharing.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setAttachedImage(result);
        setShowPresets(false);
      }
    };
    reader.readAsDataURL(file);
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

    if (!activeLocalMode) {
      try {
        const msgRef = collection(db, "matches", match.id, "messages");
        await addDoc(msgRef, {
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
    if (!inputText.trim() && !attachedImage) return;

    const sentAt = Date.now();
    const replyDueAt = sentAt + 60_000;
    const textToSend = inputText.trim();
    const imageToSend = attachedImage;

    if (imageToSend && slotsRemaining <= 0) {
      alert(nextPhotoMilestone
        ? `Your next photo unlock is at ${nextPhotoMilestone} total text messages.`
        : "Photo sharing is currently unavailable.");
      return;
    }

    setInputText("");
    setAttachedImage(null);
    setShowPresets(false);

    const userMsg: Message = {
      id: `msg_${sentAt}_${Math.random().toString(36).substring(2, 6)}`,
      senderId: currentUser.id,
      text: textToSend,
      ...(imageToSend ? { imageUrl: imageToSend } : {}),
      createdAt: { seconds: sentAt / 1000, nanoseconds: 0 } as any,
    };

    const currentLocalMsgs: Message[] = JSON.parse(localStorage.getItem(`blindspark_messages_${match.id}`) || "[]");
    const updatedLocalMsgs = [...currentLocalMsgs, userMsg];
    localStorage.setItem(`blindspark_messages_${match.id}`, JSON.stringify(updatedLocalMsgs));
    setMessages(updatedLocalMsgs);

    if (!activeLocalMode) {
      try {
        const msgRef = collection(db, "matches", match.id, "messages");
        await addDoc(msgRef, {
          senderId: currentUser.id,
          text: textToSend,
          ...(imageToSend ? { imageUrl: imageToSend } : {}),
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn("Could not save message to Firestore, switching to local fallback:", error);
        setUseLocalFallback(true);
      }
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

  const partnerArchetype = ARCHETYPES[partnerProfile.archetype];

  return (
    <div className="flex-1 flex flex-col bg-white border border-stone-200/75 rounded-3xl overflow-hidden h-[540px] md:h-[580px] max-w-md w-full mx-auto relative shadow-2xl">
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

      {/* Dynamic Chemistry Photo Milestone Banner */}
      <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-200/40 flex items-center justify-between gap-2 z-10 select-none">
        <div className="flex items-center gap-2">
          {slotsRemaining > 0 || maxPictures === Infinity ? (
            <Unlock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          )}
          <span className="text-[10px] text-stone-600 font-semibold leading-snug">
            {maxPictures === 0 ? (
              <span>Photo sharing is locked. Send <strong>{messagesUntilNextPhoto} more text messages</strong> to unlock 1 photo each.</span>
            ) : maxPictures === Infinity ? (
              <span className="text-emerald-700">✨ Unlimited photo sharing unlocked!</span>
            ) : (
              <span>
                You: {sentPicturesCount}/{maxPictures} photos • {partnerProfile.name}: {partnerPicturesCount}/{maxPictures}.{" "}
                {nextPhotoMilestone ? (
                  <span><strong>{messagesUntilNextPhoto}</strong> more text messages until the next unlock.</span>
                ) : null}
              </span>
            )}
          </span>
        </div>
        <div className="text-[9px] bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full font-bold">
          {totalMessagesTexted} text msgs
        </div>
      </div>

      {/* Message Pane */}
      <div 
        ref={messageContainerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex-1 p-4 overflow-y-auto flex flex-col gap-3.5 bg-[#FCFAF7] scrollbar-none relative"
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
                {msg.text && (
                  <div className="px-2.5 py-1 text-xs">
                    {msg.text}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typings / Thinking Indicator */}
        {isTyping && (
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
      {showPresets && (
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

      {/* Input Box */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 bg-white border-t border-stone-200/80 flex items-center gap-2 z-10 relative"
      >
        {/* Hidden native input file trigger */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileChange(e.target.files[0]);
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
            setShowPresets(!showPresets);
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
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            slotsRemaining > 0
              ? `Drop photo or text ${partnerProfile.name}...`
              : `Spark a letter to ${partnerProfile.name}...`
          }
          maxLength={300}
          className="flex-1 bg-stone-50 border border-stone-200 focus:border-rose-400 text-xs rounded-xl px-3.5 py-3 focus:outline-none transition-all text-stone-900 placeholder-stone-400 font-medium"
        />

        <button
          type="submit"
          disabled={!inputText.trim() && !attachedImage}
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
