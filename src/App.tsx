import { Phone } from "@/components/phone/Phone";
import { DemoPanel } from "@/components/DemoPanel";
import { useFirstBill } from "@/hooks/useFirstBill";
import { useEffect, useState } from "react";

/** Like iMessage: when the keyboard opens, the header stays put and only the thread shrinks.
    iOS normally slides the whole page up, so we pin the app to the visible area instead. */
function useVisibleArea() {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      setBox({ top: vv.offsetTop, height: vv.height });
      if (window.scrollY) window.scrollTo(0, 0);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    window.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      window.removeEventListener("scroll", apply);
    };
  }, []);
  return box;
}

/** Phone-only, full screen: on a phone, when opened from the Home Screen, or with #phone in the link. */
function isPhoneOnly() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || /[#?&]phone\b/.test(window.location.href) || window.innerWidth < 640;
}

export default function App() {
  const api = useFirstBill();
  const box = useVisibleArea();
  if (isPhoneOnly()) {
    return (
      <div className="fixed inset-x-0 top-0 h-full bg-ph-bg" style={box ? { top: box.top, height: box.height } : undefined}>
        <Phone api={api} fullscreen />
      </div>
    );
  }
  return (
    <main className="min-h-full px-[max(16px,env(safe-area-inset-left,0px))] py-6 sm:py-8">
      <div className="mx-auto grid max-w-[1080px] items-start gap-8 lg:grid-cols-[402px_minmax(0,1fr)] lg:gap-12">
        <Phone api={api} />
        <DemoPanel api={api} />
      </div>
    </main>
  );
}
