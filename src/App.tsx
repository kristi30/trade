import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { deleteDoc, doc, getDoc } from "firebase/firestore";
import { AnimatePresence, motion } from "motion/react";
import { RefreshCw, Sparkles, Smartphone } from "lucide-react";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import { auth, db } from "./lib/firebase";
import { Profile } from "./types";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";

type LocalUser = {
  uid: string;
  displayName?: string;
  isLocalFallback: true;
};

const LOCAL_UID_KEY = "blindspark_local_uid";

function readCachedProfile(uid: string): Profile | null {
  try {
    const saved = localStorage.getItem(`blindspark_profile_${uid}`);
    return saved ? (JSON.parse(saved) as Profile) : null;
  } catch {
    return null;
  }
}

function createLocalUser(): LocalUser {
  let uid = localStorage.getItem(LOCAL_UID_KEY);
  if (!uid) {
    const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    uid = `local_${randomPart}`;
    localStorage.setItem(LOCAL_UID_KEY, uid);
  }
  return { uid, displayName: "You", isLocalFallback: true };
}

export default function App() {
  const isNative = Capacitor.isNativePlatform();
  const isStandalonePwa = typeof window !== "undefined" && (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [googleError, setGoogleError] = useState("");

  const startLocalDemo = () => {
    const localUser = createLocalUser();
    setUser(localUser);
    setProfile(readCachedProfile(localUser.uid));
  };

  const handleGoogleSignIn = async () => {
    setIsSigningInGoogle(true);
    setGoogleError("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.warn("Google Sign In Error:", err);
      setGoogleError(err?.message || "Failed to sign in with Google.");
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setLoading(true);

      if (authUser) {
        setUser(authUser);
        try {
          const profileSnap = await Promise.race([
            getDoc(doc(db, "profiles", authUser.uid)),
            new Promise<any>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout connecting to Firestore")), 8000),
            ),
          ]);

          if (profileSnap?.exists()) {
            setProfile(profileSnap.data() as Profile);
          } else {
            setProfile(readCachedProfile(authUser.uid));
          }
        } catch (error) {
          console.warn("Could not retrieve profile from Firestore; using local cache:", error);
          setProfile(readCachedProfile(authUser.uid));
        } finally {
          setLoading(false);
        }
        return;
      }

      // Local test mode persists across native, PWA, and browser launches without depending on OAuth.
      const storedLocalUid = localStorage.getItem(LOCAL_UID_KEY);
      if (storedLocalUid) {
        const localUser: LocalUser = {
          uid: storedLocalUid,
          displayName: "You",
          isLocalFallback: true,
        };
        setUser(localUser);
        setProfile(readCachedProfile(storedLocalUid));
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isNative]);

  const handleOnboardingComplete = (newProfile: Profile) => {
    setProfile(newProfile);
    if (user?.uid) {
      localStorage.setItem(`blindspark_profile_${user.uid}`, JSON.stringify(newProfile));
    }
  };

  const handleLogout = async () => {
    if (!user) return;
    setLoading(true);

    const isLocalUser = user.uid?.startsWith("local_") || user.isLocalFallback;

    try {
      if (isLocalUser) {
        localStorage.removeItem(LOCAL_UID_KEY);
      } else {
        await signOut(auth);
      }
      setUser(null);
      setProfile(null);
    } catch (error) {
      console.warn("Error signing out:", error);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleResetProfile = async () => {
    if (!user) return;
    if (!window.confirm("Reset your profile and retake the personality quiz? Your current profile will be cleared.")) {
      return;
    }

    setLoading(true);
    const isLocalUser = user.uid?.startsWith("local_") || user.isLocalFallback;
    localStorage.removeItem(`blindspark_profile_${user.uid}`);

    try {
      if (!isLocalUser) {
        await deleteDoc(doc(db, "profiles", user.uid));
      }
    } catch (error) {
      console.warn("Could not delete cloud profile:", error);
    }

    setProfile(null);
    setLoading(false);
  };

  const handleProfileUpdate = (updated: Profile) => {
    setProfile(updated);
    if (user?.uid) {
      localStorage.setItem(`blindspark_profile_${user.uid}`, JSON.stringify(updated));
    }
  };

  if (loading) {
    return (
      <div className="app-safe-screen bg-[#FCFAF7] text-stone-900 flex flex-col justify-center items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-14 h-14 bg-gradient-to-tr from-rose-500 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/10">
            <Sparkles className="w-7 h-7 text-white animate-pulse" />
          </div>
          <h1 className="text-xl font-black bg-gradient-to-r from-rose-600 to-amber-600 bg-clip-text text-transparent">
            blindSpark
          </h1>
          <div className="flex items-center gap-1.5 mt-2">
            <RefreshCw className="w-3.5 h-3.5 text-rose-500 animate-spin" />
            <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">
              Starting your experience...
            </span>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-safe-screen bg-[#FCFAF7] text-stone-900 flex flex-col justify-center items-center px-4 py-8 select-none">
        <div className="w-full max-w-md bg-white border border-stone-200/75 rounded-3xl shadow-xl shadow-stone-200/30 p-6 md:p-8 relative overflow-hidden">
          <div className="absolute -top-12 -left-12 w-48 h-48 bg-rose-200/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-amber-200/20 rounded-full blur-3xl" />

          <div className="text-center flex flex-col items-center py-6 relative z-10">
            <div className="w-16 h-16 bg-gradient-to-tr from-rose-500 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/15 mb-6">
              <Sparkles className="w-8 h-8 text-white animate-pulse" />
            </div>
            <h1 className="text-3xl font-extrabold font-display tracking-tight bg-gradient-to-r from-rose-600 to-amber-600 bg-clip-text text-transparent mb-3">
              blindSpark
            </h1>
            <p className="text-stone-600 text-sm mb-8 leading-relaxed max-w-xs">
              A personality-first dating experience where conversation comes before photos.
            </p>

            <div className="w-full space-y-3">
              <button
                type="button"
                onClick={startLocalDemo}
                className="w-full py-4 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white rounded-xl font-bold flex items-center justify-center gap-2.5 shadow-md shadow-rose-500/10 hover:shadow-lg transition-all duration-300 cursor-pointer"
              >
                <Smartphone className="w-5 h-5" />
                {isNative || isStandalonePwa ? "Try blindSpark on this iPhone" : "Try blindSpark — no account needed"}
              </button>
              <p className="text-[11px] leading-relaxed text-stone-400 max-w-xs mx-auto">
                Test mode stores your profile, matches, and chats only on this device.
              </p>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-stone-200" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-300">or</span>
                <div className="h-px flex-1 bg-stone-200" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSigningInGoogle}
                className="w-full py-3.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-800 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-all duration-300 disabled:opacity-75 cursor-pointer"
              >
                {isSigningInGoogle ? (
                  <>
                    <div className="w-5 h-5 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                    <span>Signing in with Google...</span>
                  </>
                ) : (
                  <span>Sign In with Google</span>
                )}
              </button>

              {googleError && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-left w-full">
                  <p className="text-[12px] text-rose-600 font-bold">Google Sign-In Error</p>
                  <p className="mt-1 text-[11px] text-rose-500 font-medium leading-relaxed">{googleError}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <PwaInstallPrompt />
      </div>
    );
  }

  return (
    <div className="app-safe-screen bg-[#FCFAF7] text-stone-900 select-none">
      <AnimatePresence mode="wait">
        {!profile ? (
          <motion.div
            key="onboarding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full"
          >
            <Onboarding userId={user.uid} onComplete={handleOnboardingComplete} />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full"
          >
            <Dashboard
              currentUser={profile}
              onLogout={handleLogout}
              onProfileUpdate={handleProfileUpdate}
              onResetProfile={handleResetProfile}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
