"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

// Chromium fires this before showing its own install UI; we capture it to drive
// a custom button. iOS Safari never fires it, so there we show instructions.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "bmt-install-dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Already installed / running standalone → never prompt.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari exposes this non-standard flag when launched from the home screen.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    // One-time platform-capability read on mount — exactly the platform-API
    // sync effects are for; not a render-derived value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsIOS(ios);

    // iOS can't be prompted programmatically — reveal the manual instructions
    // directly (there's no beforeinstallprompt event to wait on).
    if (ios) {
      setVisible(true);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setVisible(false);
    setDeferred(null);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-border bg-surface-card p-4 shadow-lg sm:left-auto sm:right-4 sm:mx-0">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
          <Download size={20} className="text-brand-blue" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text-primary">Install Book My Tech</p>
          {isIOS ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-text-secondary">
              Tap the Share
              <Share size={14} className="inline text-brand-blue" />
              button, then{" "}
              <span className="font-medium text-text-primary">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-text-secondary">
              Add it to your home screen for one-tap access to your jobs.
            </p>
          )}
          {!isIOS && (
            <button
              onClick={install}
              className="mt-2.5 inline-flex h-9 items-center rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark"
            >
              Install app
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-text-muted transition-colors hover:bg-border-subtle"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
