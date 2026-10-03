import { FormEvent, useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { deleteDoc, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Heart, Info, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react";
import { auth, db, functions } from "./lib/firebase";
import { Profile } from "./types";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";
import BlindArt from "./components/BlindArt";

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
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"closed" | "signin" | "signup">("closed");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, async (authUser) => {
      setLoading(true);
      if (authUser) {
        setUser(authUser);
        try {
          const snapshot = await getDoc(doc(db, "profiles", authUser.uid));
          setProfile(snapshot.exists() ? (snapshot.data() as Profile) : readCachedProfile(authUser.uid));
        } catch {
          setProfile(readCachedProfile(authUser.uid));
        }
        setLoading(false);
        return;
      }

      const stored = localStorage.getItem(LOCAL_UID_KEY);
      if (stored) {
        const localUser: LocalUser = { uid: stored, displayName: "You", isLocalFallback: true };
        setUser(localUser);
        setProfile(readCachedProfile(stored));
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  const startLocalDemo = () => {
    const local = createLocalUser();
    setUser(local);
    setProfile(readCachedProfile(local.uid));
  };

  const submitEmailAuth = async (event: FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    try {
      if (authMode === "signup") await createUserWithEmailAndPassword(auth, email.trim(), password);
      else await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error: any) {
      setAuthMessage(error?.message?.replace("Firebase: ", "") || "Could not continue with that account.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signInGoogle = async () => {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      setAuthMessage(error?.message?.replace("Firebase: ", "") || "Google sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signInApple = async () => {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      setAuthMessage(error?.message?.replace("Firebase: ", "") || "Apple sign-in failed. Make sure Apple is enabled in Firebase Authentication.");
    } finally {
      setAuthBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      setAuthMessage("Enter your email first.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setAuthMessage("Password reset email sent.");
    } catch (error: any) {
      setAuthMessage(error?.message?.replace("Firebase: ", "") || "Could not send reset email.");
    }
  };

  const handleOnboardingComplete = (newProfile: Profile) => {
    setProfile(newProfile);
    localStorage.setItem(`blindspark_profile_${newProfile.id}`, JSON.stringify(newProfile));
  };

  const handleLogout = async () => {
    if (!user) return;
    const local = user.uid?.startsWith("local_") || user.isLocalFallback;
    if (local) localStorage.removeItem(LOCAL_UID_KEY);
    else await signOut(auth).catch(() => undefined);
    setUser(null);
    setProfile(null);
  };

  const handleResetProfile = async () => {
    if (!user) return;
    if (!window.confirm("Reset your profile and retake the personality quiz?")) return;
    localStorage.removeItem(`blindspark_profile_${user.uid}`);
    if (!user.uid?.startsWith("local_")) await deleteDoc(doc(db, "profiles", user.uid)).catch(() => undefined);
    setProfile(null);
  };

  const handleProfileUpdate = (updated: Profile) => {
    setProfile(updated);
    localStorage.setItem(`blindspark_profile_${updated.id}`, JSON.stringify(updated));
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    const confirmed = window.confirm(
      "Delete your BlindSpark account and profile data? This cannot be undone."
    );
    if (!confirmed) return;

    setLoading(true);
    const isLocal = user.uid?.startsWith("local_") || user.isLocalFallback;

    try {
      if (isLocal) {
        const keys = Object.keys(localStorage).filter((key) => key.startsWith("blindspark_"));
        keys.forEach((key) => localStorage.removeItem(key));
      } else {
        try {
          const removeData = httpsCallable(functions, "deleteMyAccountData");
          await removeData();
        } catch (cloudError) {
          console.warn("Cloud account cleanup function unavailable; using client fallback.", cloudError);
          await deleteDoc(doc(db, "profiles", user.uid)).catch(() => undefined);
          if (auth.currentUser) await deleteUser(auth.currentUser);
        }
      }
      setUser(null);
      setProfile(null);
    } catch (error: any) {
      console.warn("Account deletion failed:", error);
      alert(error?.message || "Account deletion could not be completed. You may need to sign in again first.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="app-safe-screen bg-[#fffaf4] flex items-center justify-center text-[#2b1b18]">
        <div className="w-14 h-14 rounded-[18px] bg-gradient-to-br from-[#ef3e61] to-[#ff7a22] flex items-center justify-center animate-pulse">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-safe-screen min-h-[100dvh] bg-[#fffaf4] text-[#2b1b18] font-sans overflow-y-auto">
        <main className="max-w-md mx-auto px-5 pt-9 pb-12">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-[18px] bg-gradient-to-br from-[#ef3e61] to-[#ff7a22] flex items-center justify-center shadow-[0_8px_20px_rgba(238,65,87,.16)]">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <div className="text-[28px] font-black tracking-[-0.045em]">BlindSpark</div>
            </div>
            <span className="rounded-full bg-[#fff1e9] px-4 py-2 text-[16px] font-bold">18+</span>
          </div>

          <div className="relative flex justify-center mb-9">
            <BlindArt className="w-[290px] h-[290px] rounded-[42px] shadow-[0_24px_50px_rgba(232,75,91,.18)]" />
            <div className="absolute right-[-2px] top-[42px] bg-white rounded-full px-5 py-3 text-[18px] font-extrabold shadow-[0_10px_25px_rgba(49,31,25,.13)]">92% in sync</div>
            <div className="absolute left-[-6px] bottom-[24px] bg-white rounded-full px-4 py-3 text-[17px] font-extrabold shadow-[0_10px_25px_rgba(49,31,25,.13)]">No photos yet</div>
          </div>

          <h1 className="text-[45px] leading-[0.98] font-black tracking-[-0.055em] mb-5">
            Fall for the <span className="text-[#ee3c55]">person</span>, not the picture.
          </h1>
          <p className="text-[20px] leading-[1.5] text-[#766761] mb-7">
            Match on personality first, then unlock more of each other as the conversation grows.
          </p>

          <button
            type="button"
            onClick={startLocalDemo}
            className="w-full h-[72px] rounded-[28px] bg-gradient-to-r from-[#e83e5d] to-[#ff6f20] text-white text-[22px] font-black flex items-center justify-center gap-3 shadow-[0_12px_28px_rgba(232,62,93,.22)]"
          >
            <Heart className="w-7 h-7" />
            Try the local demo
          </button>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              type="button"
              onClick={() => { setAuthMode("signup"); setAuthMessage(""); }}
              className="h-[62px] rounded-[24px] border-2 border-[#2b1b18] bg-white text-[17px] font-extrabold flex items-center justify-center gap-2"
            >
              <UserRound className="w-5 h-5" /> Create account
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode("signin"); setAuthMessage(""); }}
              className="h-[62px] rounded-[24px] border-2 border-[#2b1b18] bg-white text-[17px] font-extrabold flex items-center justify-center gap-2"
            >
              <LockKeyhole className="w-5 h-5" /> Sign in
            </button>
          </div>

          {authMode !== "closed" && (
            <div className="mt-5 rounded-[28px] border-2 border-[#2b1b18] bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[24px] font-black">{authMode === "signup" ? "Create your account" : "Welcome back"}</h2>
                <button onClick={() => setAuthMode("closed")} className="text-[#8a7a73] font-black">Close</button>
              </div>

              <form onSubmit={submitEmailAuth} className="space-y-3">
                <label className="relative block">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#e84962]" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full h-14 rounded-[20px] border-2 border-[#2b1b18] pl-12 pr-4 bg-[#fffaf4] outline-none"
                  />
                </label>
                <label className="relative block">
                  <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#e84962]" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full h-14 rounded-[20px] border-2 border-[#2b1b18] pl-12 pr-4 bg-[#fffaf4] outline-none"
                  />
                </label>
                <button disabled={authBusy} className="w-full h-14 rounded-[20px] bg-gradient-to-r from-[#e84962] to-[#ef7938] text-white text-[18px] font-black disabled:opacity-50">
                  {authBusy ? "One moment…" : authMode === "signup" ? "Create account" : "Sign in"}
                </button>
              </form>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <button onClick={signInGoogle} disabled={authBusy} className="h-14 rounded-[20px] border-2 border-[#2b1b18] font-extrabold bg-white">
                  Google
                </button>
                <button onClick={signInApple} disabled={authBusy} className="h-14 rounded-[20px] border-2 border-[#2b1b18] font-extrabold bg-[#2b1b18] text-white">
                  Apple
                </button>
              </div>

              {authMode === "signin" && (
                <button onClick={resetPassword} className="w-full mt-3 text-[#e84962] font-bold text-[14px]">Forgot password?</button>
              )}
              {authMessage && <p className="mt-3 text-[13px] text-[#7a6962] leading-relaxed">{authMessage}</p>}
            </div>
          )}

          <div className="mt-5 rounded-[28px] bg-[#fde3e8] px-5 py-5 flex gap-3 text-[15px] leading-relaxed">
            <Info className="w-6 h-6 text-[#e84962] shrink-0 mt-0.5" />
            <p><strong>Demo profiles are always labeled.</strong> Real accounts only match when both people Spark each other.</p>
          </div>
        </main>
      </div>
    );
  }

  if (!profile) return <Onboarding userId={user.uid} onComplete={handleOnboardingComplete} />;

  return (
    <Dashboard
      currentUser={profile}
      onLogout={handleLogout}
      onProfileUpdate={handleProfileUpdate}
      onResetProfile={handleResetProfile}
      onDeleteAccount={handleDeleteAccount}
    />
  );
}
