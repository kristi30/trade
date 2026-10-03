import { useState, useEffect, FormEvent } from "react";
import { collection, doc, setDoc, getDocs, onSnapshot, query, where, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { SEED_PROFILES, ARCHETYPES } from "../data";
import { Profile, Match } from "../types";
import { Compass, MessageSquare, Sparkles, User, RefreshCw, LogOut, Check, Heart, MapPin, ChevronRight, Activity, Shield, Info } from "lucide-react";
import Discovery from "./Discovery";
import Chat from "./Chat";
import ProfileDetailsModal from "./ProfileDetailsModal";

interface DashboardProps {
  currentUser: Profile;
  onLogout: () => void;
  onProfileUpdate: (updatedProfile: Profile) => void;
  onResetProfile?: () => void;
}

export default function Dashboard({ currentUser, onLogout, onProfileUpdate, onResetProfile }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<"discover" | "matches" | "stats" | "profile">("discover");
  const [matches, setMatches] = useState<{ match: Match; partner: Profile }[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [activeChat, setActiveChat] = useState<{ match: Match; partner: Profile } | null>(null);

  // Profile details modal/sheet state
  const [selectedPartner, setSelectedPartner] = useState<{ partner: Profile; matchScore?: number; matchId: string } | null>(null);

  // Blocked user profile IDs state
  const [blockedIds, setBlockedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`blindspark_blocked_${currentUser.id}`) || "[]");
    } catch (_) {
      return [];
    }
  });

  // Profile Editor state
  const [editLocation, setEditLocation] = useState(currentUser.location);
  const [editLookingFor, setEditLookingFor] = useState(currentUser.lookingFor);
  const [editAge, setEditAge] = useState<string>(String(currentUser.age || 24));
  const [editBio, setEditBio] = useState(currentUser.bio);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [showUpdateSuccess, setShowUpdateSuccess] = useState(false);

  // Block a matched profile and permanently hide/unmatch
  const handleBlockUser = async (partnerId: string, matchId: string) => {
    const updated = [...blockedIds, partnerId];
    setBlockedIds(updated);
    localStorage.setItem(`blindspark_blocked_${currentUser.id}`, JSON.stringify(updated));
    setActiveChat(null);
    setSelectedPartner(null);

    // Run unmatch sequence silently without user notifications
    await handleUnmatch(matchId, partnerId, false);
  };

  // Unmatch/Cancel match sequence
  const handleUnmatch = async (matchId: string, partnerId: string, alertUser = true) => {
    const isLocalMode = !currentUser.id || currentUser.id.startsWith("local_") || matchId.startsWith("local_");

    // Clean local storage match list
    const localMatchesStr = localStorage.getItem(`blindspark_matches_${currentUser.id}`) || "[]";
    try {
      const localMatchesList: Match[] = JSON.parse(localMatchesStr);
      const filtered = localMatchesList.filter(m => m.id !== matchId);
      localStorage.setItem(`blindspark_matches_${currentUser.id}`, JSON.stringify(filtered));
    } catch (e) {
      console.warn("Failed to update local matches list:", e);
    }

    // Purge local storage messages
    localStorage.removeItem(`blindspark_messages_${matchId}`);

    // Update matches list in state instantly for seamless responsiveness
    setMatches((prev) => prev.filter((p) => p.match.id !== matchId));
    setActiveChat(null);
    setSelectedPartner(null);

    // Delete matching doc from Firestore in background if online
    if (!isLocalMode) {
      deleteDoc(doc(db, "matches", matchId)).catch((e) => {
        console.warn("Could not delete match from Firestore:", e);
      });
    }
  };

  // Discovery keeps its demo profiles client-side; do not write simulated profiles into production Firestore.

  // 2. Listen to user's real-time matches
  useEffect(() => {
    const isLocalMode = !currentUser.id || currentUser.id.startsWith("local_");

    // Immediate matches cache key to load matches instantly
    const cacheKey = `blindspark_cached_matches_list_${currentUser.id}`;
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Sync immediately with cached items so there is zero spin wait
          setMatches(parsed);
          setLoadingMatches(false);
        }
      } catch (e) {
        console.warn("Failed to parse cached matches list:", e);
      }
    } else {
      setLoadingMatches(true);
    }

    if (isLocalMode) {
      const localMatchesStr = localStorage.getItem(`blindspark_matches_${currentUser.id}`);
      let localMatchesList: Match[] = [];
      if (localMatchesStr) {
        localMatchesList = JSON.parse(localMatchesStr);
      } else {
        // Create default simulated matches with high score for high fidelity demo
        const seedPartners = SEED_PROFILES.slice(0, 3);
        localMatchesList = seedPartners.map((partner, index) => ({
          id: `local_match_${index}_${currentUser.id}`,
          users: [currentUser.id, `seed_${partner.name.toLowerCase()}`],
          createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
          score: 88 - index * 6,
          chatStarted: true,
        }));
        localStorage.setItem(`blindspark_matches_${currentUser.id}`, JSON.stringify(localMatchesList));
      }

      // Read blocked IDs from local storage
      const blockedList: string[] = JSON.parse(localStorage.getItem(`blindspark_blocked_${currentUser.id}`) || "[]");

      const matchedPairs = localMatchesList
        .map((match) => {
          const partnerId = match.users.find((id) => id !== currentUser.id);
          const partnerSeed = SEED_PROFILES.find((p) => `seed_${p.name.toLowerCase()}` === partnerId) || SEED_PROFILES[0];
          return {
            match,
            partner: {
              ...partnerSeed,
              id: partnerId || `seed_${partnerSeed.name.toLowerCase()}`,
            } as Profile,
          };
        })
        .filter((p) => !blockedList.includes(p.partner.id));

      setMatches(matchedPairs);
      localStorage.setItem(cacheKey, JSON.stringify(matchedPairs));
      setLoadingMatches(false);
      return;
    }

    // Cloud Mode Match Listening with Parallel Retrieval & Local Caching
    const q = query(collection(db, "matches"), where("users", "array-contains", currentUser.id));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        // Read blocked IDs dynamically
        const blockedList: string[] = JSON.parse(localStorage.getItem(`blindspark_blocked_${currentUser.id}`) || "[]");

        // Load profiles cache from localStorage
        const profilesCacheKey = `blindspark_profiles_cache_${currentUser.id}`;
        let profilesCache: Record<string, Profile> = {};
        try {
          profilesCache = JSON.parse(localStorage.getItem(profilesCacheKey) || "{}");
        } catch (_) {}

        // Fetch all partner profiles in parallel
        const matchPromises = snapshot.docs.map(async (docSnap) => {
          const matchData = docSnap.data() as Match;
          const partnerId = matchData.users.find((id) => id !== currentUser.id);

          if (!partnerId || blockedList.includes(partnerId)) return null;

          // Serve from memory cache instantly if hit
          if (profilesCache[partnerId]) {
            return {
              match: matchData,
              partner: profilesCache[partnerId],
            };
          }

          // Otherwise, fetch from Firestore
          try {
            const partnerSnap = await getDoc(doc(db, "profiles", partnerId));
            if (partnerSnap.exists()) {
              const pData = partnerSnap.data() as Profile;
              profilesCache[partnerId] = pData;
              return { match: matchData, partner: pData };
            }
          } catch (e) {
            console.warn("Failed to fetch partner profile:", partnerId, e);
          }

          // Safe fallback to seeds if not found or network error
          const seedName = partnerId.replace("seed_", "");
          const partnerSeed = SEED_PROFILES.find((p) => p.name.toLowerCase() === seedName);
          if (partnerSeed) {
            const fallbackProfile = { ...partnerSeed, id: partnerId } as Profile;
            profilesCache[partnerId] = fallbackProfile;
            return { match: matchData, partner: fallbackProfile };
          }

          return null;
        });

        const results = await Promise.all(matchPromises);
        const validPairs = results.filter((r): r is { match: Match; partner: Profile } => r !== null);

        // Save profiles cache
        localStorage.setItem(profilesCacheKey, JSON.stringify(profilesCache));

        // Sort by chemistry score
        const sorted = validPairs.sort((a, b) => b.match.score - a.match.score);
        
        setMatches(sorted);
        localStorage.setItem(cacheKey, JSON.stringify(sorted));
        setLoadingMatches(false);
      } catch (err) {
        console.error("Error updating matches on snapshot:", err);
        setLoadingMatches(false);
      }
    }, (error) => {
      console.warn("Firestore matches onSnapshot failed, using cache fallback:", error);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setMatches(JSON.parse(cached));
      }
      setLoadingMatches(false);
    });

    return () => unsubscribe();
  }, [currentUser.id]);

  // Handle Match creation event from swipe component
  const handleMatchCreatedOnSwipe = (match: Match, partnerProfile: Profile) => {
    // Automatically prepare active chat on matches tab
    setActiveChat({ match, partner: partnerProfile });
    setActiveTab("matches");
  };

  // Save profile edits
  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);

    const updated: Profile = {
      ...currentUser,
      location: editLocation,
      lookingFor: editLookingFor,
      age: parseInt(editAge, 10) || currentUser.age || 24,
      bio: editBio,
    };

    // Always update localStorage first as a local cache/fallback
    localStorage.setItem(`blindspark_profile_${currentUser.id}`, JSON.stringify(updated));

    try {
      const localMode = !currentUser.id || currentUser.id.startsWith("local_");
      if (!localMode) {
        await Promise.race([
          setDoc(doc(db, "profiles", currentUser.id), updated),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout updating profile")), 1500)),
        ]);
      }
      onProfileUpdate(updated);
      setShowUpdateSuccess(true);
      setTimeout(() => setShowUpdateSuccess(false), 2500);
    } catch (err) {
      console.error("Error updating profile in cloud (falling back to local memory):", err);
      onProfileUpdate(updated);
      setShowUpdateSuccess(true);
      setTimeout(() => setShowUpdateSuccess(false), 2500);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const myArchetype = ARCHETYPES[currentUser.archetype];
  const isLocalMode = !currentUser.id || currentUser.id.startsWith("local_");

  return (
    <div className="min-h-screen bg-[#FCFAF7] text-stone-900 flex flex-col pb-20 md:pb-6 font-sans">
      {/* Top Header */}
      <header className="px-6 py-5 border-b border-stone-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center max-w-lg w-full mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-rose-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-rose-500/10">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-black font-display tracking-tight bg-gradient-to-r from-rose-600 to-amber-600 bg-clip-text text-transparent">
            blindSpark
          </span>
        </div>

        {/* Small Logged In indicator */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-stone-900 font-bold">{currentUser.name}</span>
            <span className={`text-[8px] font-black uppercase ${myArchetype.textColor.replace('-400', '-600')}`}>
              {myArchetype.name}
            </span>
          </div>
        </div>
      </header>

      {isLocalMode && (
        <div className="px-6 mt-4 max-w-lg w-full mx-auto">
          <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 flex items-start gap-3 shadow-xs text-stone-800">
            <span className="text-sm shrink-0 mt-0.5">⚠️</span>
            <div className="flex-1 text-[11px] leading-relaxed font-medium">
              <strong className="font-extrabold text-amber-850">iPhone Test Mode:</strong> your profile, matches and chats are stored only on this device so you can test the complete app without cloud setup.
              <span className="block mt-1 text-stone-500">
                Demo profiles are labeled clearly. Native sign-in and the production backend can be connected before release.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        {activeChat ? (
          <Chat
            match={activeChat.match}
            currentUser={currentUser}
            partnerProfile={activeChat.partner}
            onBack={() => setActiveChat(null)}
            onViewProfile={() => setSelectedPartner({ partner: activeChat.partner, matchScore: activeChat.match.score, matchId: activeChat.match.id })}
          />
        ) : (
          <div className="w-full max-w-md flex-1 flex flex-col">
            {/* Discover Tab */}
            {activeTab === "discover" && (
              <Discovery currentUser={currentUser} onMatchCreated={handleMatchCreatedOnSwipe} />
            )}

            {/* Matches / Chat List Tab */}
            {activeTab === "matches" && (
              <div className="flex-1 flex flex-col bg-white border border-stone-200/75 rounded-3xl p-5 min-h-[480px] shadow-lg shadow-stone-100/40">
                <h2 className="text-lg font-black font-display tracking-tight text-stone-900 mb-1">Dating Sparks</h2>
                <p className="text-stone-500 text-xs mb-5 font-medium leading-relaxed">These compatible profiles matching your vibe are ready to converse.</p>

                {loadingMatches ? (
                  <div className="flex-1 flex flex-col justify-center items-center">
                    <RefreshCw className="w-6 h-6 text-rose-500 animate-spin mb-2" />
                    <span className="text-xs text-stone-400 font-semibold">Retrieving matches...</span>
                  </div>
                ) : matches.length === 0 ? (
                  <div className="flex-1 flex flex-col justify-center items-center text-center gap-4 py-8">
                    <div className="w-12 h-12 bg-stone-50 border border-stone-200/60 rounded-xl flex items-center justify-center shadow-xs">
                      <MessageSquare className="w-6 h-6 text-stone-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-850">No active matches</h4>
                      <p className="text-xs text-stone-500 max-w-[200px] mx-auto mt-1 leading-relaxed font-medium">
                        Swipe on profiles in the Discovery deck to unlock connections!
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[360px] pr-1">
                    {matches.map(({ match, partner }) => {
                      const arch = ARCHETYPES[partner.archetype];
                      return (
                        <div
                          key={match.id}
                          className="w-full text-left bg-stone-50 hover:bg-rose-50/10 border border-stone-200/60 hover:border-rose-200/80 p-3.5 rounded-2xl flex items-center justify-between gap-3 transition-all duration-200 group shadow-2xs"
                        >
                          {/* Left Clickable Area (Opens Chat) */}
                          <div
                            onClick={() => setActiveChat({ match, partner })}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <span className="text-sm font-bold text-stone-900 group-hover:text-rose-950 transition-colors">
                                {partner.name}, <span className="text-stone-500 font-medium">{partner.age}</span>
                              </span>
                              <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md ${arch.textColor.replace('-400', '-600')} bg-white border border-stone-200 uppercase shadow-3xs`}>
                                {arch.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-stone-500 font-semibold">
                              <MapPin className="w-3 h-3 text-rose-500/80" />
                              <span>{partner.location}</span>
                            </div>
                          </div>

                          {/* Right Controls Area */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Open Profile Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPartner({ partner, matchScore: match.score, matchId: match.id });
                              }}
                              className="p-2 bg-white hover:bg-stone-100 border border-stone-200/80 text-stone-500 hover:text-stone-850 rounded-xl transition-all cursor-pointer shadow-3xs flex items-center justify-center"
                              title="View Profile Details"
                            >
                              <Info className="w-3.5 h-3.5 text-stone-500 hover:text-stone-850" />
                            </button>

                            {/* Score & Chat CTA */}
                            <button
                              onClick={() => setActiveChat({ match, partner })}
                              className="bg-white hover:bg-rose-50/50 border border-stone-200/80 hover:border-rose-300 rounded-xl px-2.5 py-1 text-[10px] font-black font-mono text-rose-600 transition-all shadow-3xs cursor-pointer flex items-center gap-1"
                            >
                              <span>{match.score}%</span>
                              <ChevronRight className="w-3 h-3 text-stone-400 group-hover:text-stone-600 transition-transform group-hover:translate-x-0.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Stats Ecosystem Tab */}
            {activeTab === "stats" && (
              <div className="flex-1 flex flex-col bg-white border border-stone-200/75 rounded-3xl p-5 min-h-[480px] shadow-lg shadow-stone-100/40 text-stone-900">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-5 h-5 text-rose-500" />
                  <h2 className="text-lg font-black font-display tracking-tight text-stone-900">Match Radar Analytics</h2>
                </div>
                <p className="text-stone-500 text-xs mb-5 font-medium">Your {myArchetype.name} archetype in the Los Angeles matching ecosystem.</p>

                {/* Local Density Cards */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3 text-center shadow-xs">
                    <span className="text-[9px] uppercase text-stone-400 font-extrabold block mb-1 font-display">Local Sparks</span>
                    <span className="text-xl font-extrabold font-mono tracking-tight text-stone-900">42 Active</span>
                    <span className="text-[8px] text-stone-500 block mt-0.5 font-medium">within 3 miles</span>
                  </div>
                  <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3 text-center shadow-xs">
                    <span className="text-[9px] uppercase text-stone-400 font-extrabold block mb-1 font-display">Avg. Compatibility</span>
                    <span className="text-xl font-extrabold font-mono tracking-tight text-rose-600">89.4%</span>
                    <span className="text-[8px] text-stone-500 block mt-0.5 font-medium">high-chemistry ratio</span>
                  </div>
                </div>

                {/* Archetype Compatibilities Bar Chart */}
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 flex-1 flex flex-col justify-between shadow-xs">
                  <div>
                    <span className="text-[10px] uppercase font-black text-stone-400 block mb-3 font-display">Compatibility Matrix By Archetype</span>
                    
                    <div className="flex flex-col gap-3">
                      {[
                        { name: "Dreamy Idealists", pct: 98, color: "bg-rose-500" },
                        { name: "Deep Thinkers", pct: 92, color: "bg-indigo-500" },
                        { name: "Cozy Homebodies", pct: 88, color: "bg-emerald-500" },
                        { name: "Playful Witties", pct: 82, color: "bg-fuchsia-500" },
                        { name: "Sparkly Adventurers", pct: 74, color: "bg-orange-500" }
                      ].map((item, idx) => (
                        <div key={idx} className="flex flex-col gap-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-stone-500 font-medium">{item.name}</span>
                            <span className="text-stone-850 font-mono font-bold">{item.pct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-stone-200/60 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${item.color} rounded-full transition-all duration-300`}
                              style={{ width: `${item.pct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-[10px] text-stone-500 leading-relaxed italic border-t border-stone-200/60 pt-3 mt-4 font-medium">
                    "Idealists match with extremely high emotional reciprocity (98%) and sync elegantly with Deep Thinkers (92%) due to intuitive alignment."
                  </p>
                </div>
              </div>
            )}

            {/* Profile Settings Tab */}
            {activeTab === "profile" && (
              <div className="flex-1 flex flex-col bg-white border border-stone-200/75 rounded-3xl p-5 min-h-[480px] shadow-lg shadow-stone-100/40 text-stone-900">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-lg font-black font-display text-stone-900">Your Dating Profile</h2>
                    <p className="text-stone-500 text-xs font-medium">Customize your spark and discover parameters.</p>
                  </div>
                  <button
                    onClick={onLogout}
                    className="p-2 py-1.5 bg-stone-50 hover:bg-rose-50 border border-stone-200 hover:border-rose-300 rounded-xl text-stone-500 hover:text-rose-600 transition-all cursor-pointer shadow-xs flex items-center gap-1 text-[11px] font-bold"
                    title="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>

                {/* Personality Badge Display */}
                <div className={`p-4 rounded-2xl bg-gradient-to-tr ${myArchetype.gradient} border border-stone-200/80 mb-5 text-center shadow-xs`}>
                  <span className="text-[8px] uppercase font-black text-stone-400 tracking-wider font-display">Your Archetype</span>
                  <h3 className={`text-lg font-black ${myArchetype.textColor.replace('-400', '-600')} mt-0.5`}>
                    {myArchetype.name}
                  </h3>
                  <p className="text-[10px] italic text-stone-700 mt-1 max-w-xs mx-auto leading-relaxed font-medium">
                    "{myArchetype.tagline}"
                  </p>
                  <div className="flex flex-wrap justify-center gap-1 mt-2.5">
                    {myArchetype.traits.map((tr, i) => (
                      <span key={i} className="text-[8px] font-extrabold px-2.5 py-1 bg-white rounded-full text-stone-600 border border-stone-200/60 shadow-xs">
                        {tr}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Form Editor */}
                <form onSubmit={handleUpdateProfile} className="flex-1 flex flex-col gap-3.5 justify-between">
                  <div className="flex flex-col gap-3.5">
                    {/* Location selector */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-bold text-stone-400">Local Area</label>
                      <select
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl px-3 py-2.5 text-xs focus:outline-none transition-all text-stone-900 cursor-pointer font-medium"
                      >
                        {[
                          "Silver Lake", "Echo Park", "Venice Beach", "Santa Monica",
                          "West Hollywood", "Downtown LA", "Los Feliz", "Pasadena"
                        ].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Looking For selector */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-bold text-stone-400">Looking To Meet</label>
                      <select
                        value={editLookingFor}
                        onChange={(e) => setEditLookingFor(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl px-3 py-2.5 text-xs focus:outline-none transition-all text-stone-900 cursor-pointer font-medium"
                      >
                        <option value="female">Women</option>
                        <option value="male">Men</option>
                        <option value="everyone">Everyone</option>
                      </select>
                    </div>

                    {/* Age editor */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-bold text-stone-400">Your Age</label>
                      <input
                        type="number"
                        value={editAge}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "" || (parseInt(val, 10) >= 0 && parseInt(val, 10) <= 120)) {
                            setEditAge(val);
                          }
                        }}
                        min={18}
                        max={100}
                        className="w-full bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl px-3 py-2.5 text-xs focus:outline-none transition-all text-stone-900 font-medium"
                      />
                    </div>

                    {/* Bio editor */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase font-bold text-stone-400">Bio</label>
                      <textarea
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        maxLength={250}
                        rows={3}
                        className="w-full bg-stone-50 border border-stone-200 focus:border-rose-400 rounded-xl p-3 text-xs focus:outline-none transition-all text-stone-900 resize-none leading-relaxed font-medium"
                      />
                      <span className="text-[9px] text-stone-400 text-right font-medium">{editBio.length}/250</span>
                    </div>
                  </div>

                  <div className="mt-4">
                    {showUpdateSuccess && (
                      <span className="text-emerald-600 text-[10px] font-bold text-center block mb-2">
                        ✓ Profile updated successfully!
                      </span>
                    )}
                    <button
                      type="submit"
                      disabled={isUpdatingProfile || editBio.length < 20 || !editAge || parseInt(editAge, 10) < 18}
                      className="w-full py-3.5 bg-stone-900 hover:bg-stone-850 disabled:bg-stone-100 text-white disabled:text-stone-400 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
                    >
                      {isUpdatingProfile ? "Updating..." : "Save Profile Details"}
                    </button>

                    {onResetProfile && (
                      <button
                        type="button"
                        onClick={onResetProfile}
                        className="w-full mt-2.5 py-2.5 bg-white hover:bg-rose-50 border border-stone-200 hover:border-rose-200 text-stone-500 hover:text-rose-600 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <RefreshCw className="w-3.5 h-3.5 animate-spin-hover" />
                        <span>Retake Personality Quiz</span>
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Global Tab Navigation Footer */}
      {!activeChat && (
        <nav className="bottom-safe-nav fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 py-3.5 px-6 flex justify-around items-center z-40 max-w-md mx-auto md:relative md:border-t-0 md:bg-transparent md:px-0">
          {[
            { id: "discover", icon: Compass, label: "Compass" },
            { id: "matches", icon: MessageSquare, label: "Matches" },
            { id: "stats", icon: Activity, label: "Radar" },
            { id: "profile", icon: User, label: "Profile" }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveChat(null);
                  setActiveTab(tab.id as any);
                }}
                className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  isActive ? "text-rose-600 scale-105 font-bold" : "text-stone-400 hover:text-stone-600"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] uppercase tracking-wider font-display font-black">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Profile Details Modal Overlay */}
      {selectedPartner && (
        <ProfileDetailsModal
          partner={selectedPartner.partner}
          matchScore={selectedPartner.matchScore}
          onClose={() => setSelectedPartner(null)}
          onUnmatch={() => handleUnmatch(selectedPartner.matchId, selectedPartner.partner.id)}
          onBlock={() => handleBlockUser(selectedPartner.partner.id, selectedPartner.matchId)}
        />
      )}
    </div>
  );
}
