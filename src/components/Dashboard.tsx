import { FormEvent, useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import {
  BarChart3,
  Bell,
  Compass,
  Heart,
  LogOut,
  MapPin,
  MessageCircle,
  Pencil,
  RefreshCw,
  Ruler,
  Settings,
  Smartphone,
  UserRound,
  UsersRound,
} from "lucide-react";
import { db } from "../lib/firebase";
import { ARCHETYPES, QUIZ_QUESTIONS, SEED_PROFILES } from "../data";
import { Match, Message, Profile } from "../types";
import { formatHeight } from "../productLogic";
import BlindArt from "./BlindArt";
import Chat from "./Chat";
import Discovery from "./Discovery";
import ProfileDetailsModal from "./ProfileDetailsModal";

interface DashboardProps {
  currentUser: Profile;
  onLogout: () => void;
  onProfileUpdate: (updatedProfile: Profile) => void;
  onResetProfile?: () => void;
}

type TabId = "discover" | "matches" | "profile" | "stats" | "settings";
type MatchPair = { match: Match; partner: Profile };

const DIMENSIONS = [
  ["q1", "Energy"],
  ["q2", "Social battery"],
  ["q3", "Planning"],
  ["q4", "Humor"],
  ["q5", "Conversation"],
  ["q6", "Ambition"],
] as const;

function profileForPartner(id: string): Profile | null {
  const seed = SEED_PROFILES.find((item) => `seed_${item.name.toLowerCase()}` === id);
  return seed ? ({ ...seed, id } as Profile) : null;
}

export default function Dashboard({ currentUser, onLogout, onProfileUpdate, onResetProfile }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>("discover");
  const [matches, setMatches] = useState<MatchPair[]>([]);
  const [activeChat, setActiveChat] = useState<MatchPair | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<{ partner: Profile; matchScore?: number; matchId: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(currentUser.name);
  const [editAge, setEditAge] = useState(String(currentUser.age));
  const [editHeight, setEditHeight] = useState(currentUser.heightCm ? String(currentUser.heightCm) : "");
  const [editLocation, setEditLocation] = useState(currentUser.location);
  const [editBio, setEditBio] = useState(currentUser.bio || "");
  const [maxDistance, setMaxDistance] = useState(() => Number(localStorage.getItem(`blindspark_max_distance_${currentUser.id}`) || "60"));
  const [minAge, setMinAge] = useState(() => Number(localStorage.getItem(`blindspark_min_age_${currentUser.id}`) || "18"));
  const [maxAge, setMaxAge] = useState(() => Number(localStorage.getItem(`blindspark_max_age_${currentUser.id}`) || "60"));
  const [blockedIds, setBlockedIds] = useState<string[]>(() => JSON.parse(localStorage.getItem(`blindspark_blocked_${currentUser.id}`) || "[]"));
  const [version, setVersion] = useState(0);

  const isLocalMode = currentUser.id.startsWith("local_");
  const archetype = ARCHETYPES[currentUser.archetype];

  const reloadLocalMatches = () => {
    const saved: Match[] = JSON.parse(localStorage.getItem(`blindspark_matches_${currentUser.id}`) || "[]");
    const pairs = saved
      .map((match) => {
        const partnerId = match.users.find((id) => id !== currentUser.id);
        if (!partnerId || blockedIds.includes(partnerId)) return null;
        const partner = profileForPartner(partnerId);
        return partner ? { match, partner } : null;
      })
      .filter((item): item is MatchPair => Boolean(item));
    setMatches(pairs.sort((a, b) => b.match.score - a.match.score));
  };

  useEffect(() => {
    if (isLocalMode) {
      reloadLocalMatches();
      return;
    }

    const q = query(collection(db, "matches"), where("users", "array-contains", currentUser.id));
    return onSnapshot(q, async (snapshot) => {
      const pairs = await Promise.all(snapshot.docs.map(async (item) => {
        const match = item.data() as Match;
        const partnerId = match.users.find((id) => id !== currentUser.id);
        if (!partnerId || blockedIds.includes(partnerId)) return null;
        try {
          const partnerDoc = await getDoc(doc(db, "profiles", partnerId));
          if (partnerDoc.exists()) return { match, partner: partnerDoc.data() as Profile };
        } catch {}
        const fallback = profileForPartner(partnerId);
        return fallback ? { match, partner: fallback } : null;
      }));
      setMatches(pairs.filter((item): item is MatchPair => Boolean(item)).sort((a, b) => b.match.score - a.match.score));
    });
  }, [currentUser.id, blockedIds.join("|")]);

  useEffect(() => {
    if (isLocalMode && (activeTab === "matches" || activeTab === "stats")) reloadLocalMatches();
  }, [activeTab, version, isLocalMode]);

  const handleMatchCreated = (match: Match, partner: Profile) => {
    setMatches((prev) => prev.some((item) => item.match.id === match.id) ? prev : [{ match, partner }, ...prev]);
    setActiveTab("matches");
    setVersion((n) => n + 1);
  };

  const handleUnmatch = async (matchId: string) => {
    const local: Match[] = JSON.parse(localStorage.getItem(`blindspark_matches_${currentUser.id}`) || "[]");
    localStorage.setItem(`blindspark_matches_${currentUser.id}`, JSON.stringify(local.filter((m) => m.id !== matchId)));
    localStorage.removeItem(`blindspark_messages_${matchId}`);
    setMatches((prev) => prev.filter((item) => item.match.id !== matchId));
    setActiveChat(null);
    setSelectedPartner(null);
    if (!isLocalMode) await deleteDoc(doc(db, "matches", matchId)).catch(() => undefined);
  };

  const handleBlock = async (partnerId: string, matchId: string) => {
    const next = Array.from(new Set([...blockedIds, partnerId]));
    setBlockedIds(next);
    localStorage.setItem(`blindspark_blocked_${currentUser.id}`, JSON.stringify(next));
    await handleUnmatch(matchId);
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    const updated: Profile = {
      ...currentUser,
      name: editName.trim() || currentUser.name,
      age: Math.max(18, Number(editAge) || currentUser.age),
      heightCm: Math.min(230, Math.max(120, Number(editHeight) || currentUser.heightCm || 170)),
      location: editLocation.trim() || currentUser.location,
      bio: editBio.trim(),
    };
    localStorage.setItem(`blindspark_profile_${currentUser.id}`, JSON.stringify(updated));
    if (!isLocalMode) await setDoc(doc(db, "profiles", currentUser.id), updated).catch(() => undefined);
    onProfileUpdate(updated);
    setEditing(false);
  };

  const stats = useMemo(() => {
    const sparks = Number(localStorage.getItem(`blindspark_sparks_sent_${currentUser.id}`) || "0");
    const skipped: string[] = JSON.parse(localStorage.getItem(`blindspark_skipped_${currentUser.id}`) || "[]");
    let messages = 0;
    for (const pair of matches) {
      const saved: Message[] = JSON.parse(localStorage.getItem(`blindspark_messages_${pair.match.id}`) || "[]");
      messages += saved.filter((message) => message.senderId === currentUser.id).length;
    }
    const average = matches.length ? Math.round(matches.reduce((sum, item) => sum + item.match.score, 0) / matches.length) : 0;
    return { sparks, skipped: skipped.length, messages, average };
  }, [matches, currentUser.id, version]);

  const resetSkipped = () => {
    localStorage.removeItem(`blindspark_skipped_${currentUser.id}`);
    setVersion((n) => n + 1);
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      alert("Notifications are not supported in this browser.");
      return;
    }
    const permission = await Notification.requestPermission();
    localStorage.setItem("blindspark_notifications", permission);
    alert(permission === "granted" ? "Notifications enabled." : "Notifications were not enabled.");
  };

  const handleReport = async (partnerId: string, matchId: string, reason: string) => {
    const report = {
      reporterId: currentUser.id,
      reportedUserId: partnerId,
      matchId,
      reason,
      createdAt: new Date().toISOString(),
    };
    const key = `blindspark_reports_${currentUser.id}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    localStorage.setItem(key, JSON.stringify([...existing, report]));

    if (!isLocalMode) {
      await addDoc(collection(db, "reports"), {
        reporterId: currentUser.id,
        reportedUserId: partnerId,
        matchId,
        reason,
        createdAt: serverTimestamp(),
      }).catch(() => undefined);
    }
    alert("Report submitted. You can also block or unmatch this profile.");
  };

  const personalityAnswers = DIMENSIONS.map(([id, label]) => {
    const question = QUIZ_QUESTIONS.find((q) => q.id === id);
    const selected = currentUser.quizAnswers?.[id];
    const answer = selected !== undefined ? question?.options[Number(selected)]?.text : undefined;
    return { label, answer: answer || "Not answered" };
  });

  if (activeChat) {
    return (
      <div className="bg-[#fffaf4] min-h-[100dvh] pt-[env(safe-area-inset-top,0px)]">
        <Chat
          match={activeChat.match}
          currentUser={currentUser}
          partnerProfile={activeChat.partner}
          onBack={() => setActiveChat(null)}
          onViewProfile={() => setSelectedPartner({ partner: activeChat.partner, matchScore: activeChat.match.score, matchId: activeChat.match.id })}
        />
        {selectedPartner && (
          <ProfileDetailsModal
            currentUser={currentUser}
            partner={selectedPartner.partner}
            matchScore={selectedPartner.matchScore}
            onClose={() => setSelectedPartner(null)}
            onUnmatch={() => void handleUnmatch(selectedPartner.matchId)}
            onBlock={() => void handleBlock(selectedPartner.partner.id, selectedPartner.matchId)}
            onReport={(reason) => void handleReport(selectedPartner.partner.id, selectedPartner.matchId, reason)}
          />
        )}
      </div>
    );
  }

  const skippedCount = JSON.parse(localStorage.getItem(`blindspark_skipped_${currentUser.id}`) || "[]").length;
  const overlapValues = [71, 43, 69, 69, 67, 64];

  return (
    <div className="app-safe-screen min-h-[100dvh] bg-[#fffaf4] text-[#2b1b18] font-sans">
      <main className="mobile-page-scroll max-w-md mx-auto w-full">
        {activeTab === "discover" && <Discovery currentUser={currentUser} onMatchCreated={handleMatchCreated} />}

        {activeTab === "matches" && (
          <div className="px-5 pt-10 pb-10">
            <h1 className="text-[34px] font-black tracking-[-0.045em]">Matches</h1>
            <p className="text-[19px] text-[#7b6c66] mt-1">{matches.length} {matches.length === 1 ? "spark" : "sparks"}</p>

            {matches.length === 0 ? (
              <div className="min-h-[64vh] flex flex-col items-center justify-center text-center px-6">
                <div className="w-[104px] h-[104px] rounded-[30px] bg-[#fde3e8] flex items-center justify-center">
                  <UsersRound className="w-14 h-14 text-[#d94a61]" />
                </div>
                <h2 className="mt-7 text-[27px] font-black">No matches yet</h2>
                <p className="mt-4 text-[18px] leading-[1.45] text-[#7b6c66]">Spark someone in discover. Demo Sparks match about 1 in 4 times.</p>
                <button onClick={() => setActiveTab("discover")} className="mt-7 rounded-[24px] bg-gradient-to-r from-[#df4a60] to-[#ef7938] px-8 py-4 text-white text-[19px] font-black shadow-[0_12px_25px_rgba(230,75,91,.18)]">Start discovering</button>
              </div>
            ) : (
              <div className="space-y-4 mt-6">
                {matches.map(({ match, partner }) => (
                  <button
                    key={match.id}
                    onClick={() => setActiveChat({ match, partner })}
                    className="w-full min-h-[124px] rounded-[28px] border-2 border-[#2b1b18] bg-white px-4 py-4 flex items-center text-left"
                  >
                    <BlindArt className="w-[86px] h-[86px] rounded-[22px] shrink-0" />
                    <div className="ml-4 min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h3 className="text-[23px] font-black">{partner.name}, {partner.age}</h3>
                        <span className="text-[#e84962] text-[17px] font-black">{match.score}%</span>
                      </div>
                      <p className="text-[19px] text-[#7b6c66] mt-2">{match.isDemo ? "Say hello (demo chat)" : "You both Sparked · say hello"}</p>
                    </div>
                    <MessageCircle className="w-9 h-9 text-[#d94a61] shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "profile" && (
          <div className="px-5 pt-8 pb-10">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h1 className="text-[32px] font-black tracking-[-0.045em]">You</h1>
                <p className="text-[16px] text-[#7b6c66] mt-1">{isLocalMode ? "Only stored on this device" : "Synced to your account"}</p>
              </div>
              <button onClick={() => setEditing((v) => !v)} className="rounded-[24px] border-2 border-[#2b1b18] bg-white px-5 py-3 flex items-center gap-2 font-extrabold text-[17px]"><Pencil className="w-5 h-5" /> Edit</button>
            </div>

            {editing ? (
              <form onSubmit={saveProfile} className="rounded-[30px] border-2 border-[#2b1b18] bg-white p-5 space-y-4 mb-6">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full h-14 rounded-2xl border-2 border-[#2b1b18] px-4 text-[17px]" placeholder="Name" />
                <div className="grid grid-cols-2 gap-3">
                  <input value={editAge} onChange={(e) => setEditAge(e.target.value.replace(/\D/g, ""))} className="w-full h-14 rounded-2xl border-2 border-[#2b1b18] px-4 text-[17px]" placeholder="Age" />
                  <input value={editHeight} onChange={(e) => setEditHeight(e.target.value.replace(/\D/g, ""))} className="w-full h-14 rounded-2xl border-2 border-[#2b1b18] px-4 text-[17px]" placeholder="Height cm" />
                </div>
                <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="w-full h-14 rounded-2xl border-2 border-[#2b1b18] px-4 text-[17px]" placeholder="City" />
                <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} className="w-full rounded-2xl border-2 border-[#2b1b18] px-4 py-3 text-[17px]" rows={3} placeholder="About you" />
                <button className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#e84962] to-[#ef7938] text-white font-black text-[18px]">Save</button>
              </form>
            ) : (
              <>
                <BlindArt className="w-full h-[205px] rounded-[34px]" />
                <h2 className="text-[38px] font-black tracking-[-0.045em] mt-6">{currentUser.name}, {currentUser.age}</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-[#776761] text-[19px]">
                  <span className="inline-flex items-center gap-2"><MapPin className="w-5 h-5" /> {currentUser.location}</span>
                  {currentUser.heightCm && <span className="inline-flex items-center gap-2"><Ruler className="w-5 h-5" /> {formatHeight(currentUser.heightCm)}</span>}
                </div>
                {currentUser.bio && <p className="text-[19px] mt-5 leading-relaxed">{currentUser.bio}</p>}
                <div className="mt-5 inline-flex rounded-full bg-[#fde3e8] px-4 py-2 text-[#d9445e] font-extrabold">Profile type: {archetype.name}</div>
              </>
            )}

            <h2 className="text-[25px] font-black mt-9 mb-5">Your personality</h2>
            <div className="space-y-3">
              {personalityAnswers.map((item) => (
                <div key={item.label} className="rounded-[25px] border-2 border-[#2b1b18] bg-white px-5 py-4">
                  <div className="text-[#e84962] text-[14px] uppercase font-black">{item.label}</div>
                  <div className="text-[18px] mt-1">{item.answer}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "stats" && (
          <div className="px-5 pt-10 pb-8">
            <h1 className="text-[34px] font-black tracking-[-0.045em]">Stats</h1>
            <p className="text-[18px] text-[#7b6c66] mt-1">{isLocalMode ? "Counted locally on this device" : "Synced from this device and your account"}</p>

            <div className="grid grid-cols-2 gap-4 mt-6">
              {[
                [stats.sparks, "Sparks sent"],
                [matches.length, "Matches"],
                [stats.messages, "Messages sent"],
                [stats.skipped, "Skipped"],
                [blockedIds.length, "Blocked"],
                [`${stats.average}%`, "Avg compatibility"],
              ].map(([value, label]) => (
                <div key={String(label)} className="rounded-[30px] border-2 border-[#2b1b18] bg-white px-5 py-6 min-h-[130px]">
                  <div className="text-[42px] leading-none text-[#d94452] font-black">{value}</div>
                  <div className="mt-4 text-[17px] text-[#7b6c66]">{label}</div>
                </div>
              ))}
            </div>

            <h2 className="text-[25px] leading-tight font-black mt-9 mb-6">{isLocalMode ? "Where you overlap with the demo pool" : "Your personality balance"}</h2>
            <div className="space-y-5">
              {DIMENSIONS.map(([, label], index) => (
                <div key={label}>
                  <div className="flex justify-between items-center text-[18px] font-extrabold mb-2"><span>{label}</span><span>{overlapValues[index]}%</span></div>
                  <div className="h-3 rounded-full bg-[#f4e9e3] overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#d9475c] to-[#ee7937]" style={{ width: `${overlapValues[index]}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="px-5 pt-6 pb-10">
            <div className="flex items-center justify-between gap-3 mb-6">
              <h1 className="text-[34px] font-black tracking-[-0.045em]">Settings</h1>
              <button
                onClick={onLogout}
                className="shrink-0 rounded-[20px] border-2 border-[#2b1b18] bg-white px-4 py-2.5 font-extrabold flex items-center gap-2 text-[15px]"
              >
                <LogOut className="w-4 h-4" />
                Log out
              </button>
            </div>

            <div className="rounded-[30px] border-2 border-[#2b1b18] bg-white p-5">
              <h2 className="text-[23px] font-black mb-6">Discovery preferences</h2>

              <div className="mb-7">
                <div className="flex justify-between text-[18px] font-extrabold mb-3"><span>Maximum distance</span><span className="text-[#df4860]">{maxDistance} km</span></div>
                <input type="range" min={5} max={100} value={maxDistance} onChange={(e) => { const next=Number(e.target.value); setMaxDistance(next); localStorage.setItem(`blindspark_max_distance_${currentUser.id}`, String(next)); }} className="w-full accent-[#df4860]" />
              </div>

              <div className="mb-7">
                <div className="flex justify-between text-[18px] font-extrabold mb-3"><span>Minimum age</span><span className="text-[#df4860]">{minAge} yrs</span></div>
                <input type="range" min={18} max={60} value={minAge} onChange={(e) => { const next=Number(e.target.value); setMinAge(next); localStorage.setItem(`blindspark_min_age_${currentUser.id}`, String(next)); }} className="w-full accent-[#df4860]" />
              </div>

              <div>
                <div className="flex justify-between text-[18px] font-extrabold mb-3"><span>Maximum age</span><span className="text-[#df4860]">{maxAge} yrs</span></div>
                <input type="range" min={18} max={80} value={maxAge} onChange={(e) => { const next=Number(e.target.value); setMaxAge(next); localStorage.setItem(`blindspark_max_age_${currentUser.id}`, String(next)); }} className="w-full accent-[#df4860]" />
              </div>

              <p className="text-[16px] text-[#7b6c66] mt-6 leading-relaxed">Distances are simulated unless you saved coordinates in your profile.</p>
            </div>

            <div className="rounded-[30px] border-2 border-[#2b1b18] bg-white p-5 mt-5">
              <h2 className="text-[23px] font-black mb-3">Notifications</h2>
              <p className="text-[15px] text-[#7b6c66] leading-relaxed mb-4">Get an alert when a delayed demo reply arrives while this web app is open or in the background. Full push delivery for a closed app still requires production push credentials.</p>
              <button onClick={requestNotifications} className="w-full h-14 rounded-[22px] border-2 border-[#2b1b18] bg-white font-extrabold flex items-center justify-center gap-2">
                <Bell className="w-5 h-5 text-[#e84962]" /> Enable notifications
              </button>
            </div>

            <div className="rounded-[30px] border-2 border-[#2b1b18] bg-white p-5 mt-5">
              <h2 className="text-[23px] font-black mb-5">Skipped profiles</h2>
              <button disabled={!skippedCount} onClick={resetSkipped} className="w-full h-16 rounded-[22px] border-2 border-[#9f9691] text-[#8e8580] disabled:opacity-55 text-[19px] font-bold">Reset {skippedCount} skipped</button>
            </div>

            <div className="rounded-[30px] border-2 border-[#2b1b18] bg-white p-5 mt-5">
              <h2 className="text-[23px] font-black">Blocked ({blockedIds.length})</h2>
              <p className="text-[18px] text-[#7b6c66] mt-5">{blockedIds.length ? `${blockedIds.length} profile${blockedIds.length === 1 ? " is" : "s are"} blocked.` : "No one is blocked."}</p>
            </div>

            <button onClick={() => alert("On iPhone Safari: tap Share, then Add to Home Screen.")} className="w-full h-16 rounded-[28px] border-2 border-[#2b1b18] bg-white mt-5 text-[19px] font-black flex items-center justify-center gap-3"><Smartphone className="w-5 h-5 text-[#e84962]" /> Install BlindSpark</button>

            <div className="grid grid-cols-2 gap-3 mt-5">
              {onResetProfile && <button onClick={onResetProfile} className="h-14 rounded-[22px] border-2 border-[#2b1b18] bg-white font-extrabold flex items-center justify-center gap-2"><RefreshCw className="w-5 h-5" /> Retake quiz</button>}
              <button onClick={onLogout} className="h-14 rounded-[22px] border-2 border-[#2b1b18] bg-white font-extrabold flex items-center justify-center gap-2"><LogOut className="w-5 h-5" /> Log out</button>
            </div>
          </div>
        )}
      </main>

      <nav className="bottom-safe-nav fixed bottom-0 inset-x-0 z-50 border-t-2 border-[#2b1b18] bg-[#fffaf4]/95 backdrop-blur">
        <div className="max-w-md mx-auto grid grid-cols-5 px-2 pt-3">
          {[
            { id: "discover" as TabId, Icon: Compass, label: "Discover" },
            { id: "matches" as TabId, Icon: Heart, label: "Matches" },
            { id: "profile" as TabId, Icon: UserRound, label: "You" },
            { id: "stats" as TabId, Icon: BarChart3, label: "Stats" },
            { id: "settings" as TabId, Icon: Settings, label: "Settings" },
          ].map(({ id, Icon, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`relative flex flex-col items-center gap-1.5 pb-2 text-[13px] font-extrabold ${active ? "text-[#db455e]" : "text-[#6f615b]"}`}
              >
                <span className={`w-[58px] h-[42px] rounded-full flex items-center justify-center ${active ? "bg-[#fde2e8]" : ""}`}><Icon className="w-7 h-7" /></span>
                <span>{label}</span>
                {id === "matches" && matches.length > 0 && <span className="absolute top-[-5px] right-[18px] min-w-5 h-5 rounded-full bg-[#e25a42] text-white text-[11px] flex items-center justify-center px-1">{matches.length}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {selectedPartner && (
        <ProfileDetailsModal
          currentUser={currentUser}
          partner={selectedPartner.partner}
          matchScore={selectedPartner.matchScore}
          onClose={() => setSelectedPartner(null)}
          onUnmatch={() => void handleUnmatch(selectedPartner.matchId)}
          onBlock={() => void handleBlock(selectedPartner.partner.id, selectedPartner.matchId)}
          onReport={(reason) => void handleReport(selectedPartner.partner.id, selectedPartner.matchId, reason)}
        />
      )}
    </div>
  );
}
