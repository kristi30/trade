import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export default function PwaInstallPrompt() {
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && isStandaloneMode());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("blindspark_install_dismissed") === "1");

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => setInstalled(true);
    const media = window.matchMedia?.("(display-mode: standalone)");
    const handleModeChange = () => setInstalled(isStandaloneMode());

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    media?.addEventListener?.("change", handleModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
      media?.removeEventListener?.("change", handleModeChange);
    };
  }, []);

  if (installed || dismissed || (!isIos && !deferredPrompt)) return null;

  const dismiss = () => {
    sessionStorage.setItem("blindspark_install_dismissed", "1");
    setDismissed(true);
  };

  const install = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
      return;
    }
    if (isIos) setShowIosHelp(true);
  };

  return (
    <>
      <div className="fixed left-3 right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-[100] mx-auto max-w-md rounded-2xl border border-stone-200 bg-white/95 p-3 shadow-2xl shadow-stone-900/10 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white">
            <Download className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-stone-900">Install blindSpark</p>
            <p className="text-[11px] leading-snug text-stone-500">Add it to your Home Screen and open it like an app.</p>
          </div>
          <button type="button" onClick={install} className="rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white">Install</button>
          <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showIosHelp && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-sm" onClick={() => setShowIosHelp(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-black text-stone-900">Install on iPhone</p>
                <p className="mt-1 text-xs leading-relaxed text-stone-500">Use Safari for the best iPhone install experience.</p>
              </div>
              <button type="button" onClick={() => setShowIosHelp(false)} className="rounded-xl bg-stone-100 p-2 text-stone-500">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-stone-700">
              <div className="flex gap-3"><span className="font-black text-rose-500">1</span><p>Tap the <span className="inline-flex items-center gap-1 font-bold"><Share className="h-4 w-4" /> Share</span> button in Safari.</p></div>
              <div className="flex gap-3"><span className="font-black text-rose-500">2</span><p>Choose <strong>Add to Home Screen</strong>.</p></div>
              <div className="flex gap-3"><span className="font-black text-rose-500">3</span><p>Tap <strong>Add</strong>, then open blindSpark from your Home Screen.</p></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
