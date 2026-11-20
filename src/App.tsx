import { Phone } from "@/components/phone/Phone";
import { useFirstBill } from "@/hooks/useFirstBill";
import { useEffect, useState } from "react";

/** Like iMessage: when the keyboard opens, the header stays put and only the thread shrinks.
    iOS normally slides the whole page up, so we pin the app to the visible area instead. */
function useVisibleArea(enabled: boolean) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    if (!vv || !touch || !enabled) return;
    document.documentElement.classList.add("phone-lock");
    const apply = () => {
      if (Math.abs((vv.scale || 1) - 1) > 0.02) return setBox(null);
      setBox({ top: vv.offsetTop, height: vv.height });
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
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
  }, [enabled]);
  return box;
}

/** Full screen app: on a phone, from the Home Screen, a narrow window, or #phone on a touch device (tablet). */
function isPhoneOnly() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  return standalone || window.innerWidth < 640 || (touch && /[#?&]phone\b/.test(window.location.href));
}

function usePhoneOnly() {
  const [on, setOn] = useState(isPhoneOnly);
  useEffect(() => {
    const check = () => setOn(isPhoneOnly());
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  useEffect(() => {
    // Desktop shows only the iPhone, front and center, on black.
    document.documentElement.classList.toggle("desk", !on);
  }, [on]);
  return on;
}

export default function App() {
  const api = useFirstBill();
  const phoneOnly = usePhoneOnly();
  const box = useVisibleArea(phoneOnly);
  if (phoneOnly) {
    return (
      <div className="fixed inset-x-0 top-0 h-full bg-ph-bg" style={box ? { top: box.top, height: box.height } : undefined}>
        <Phone api={api} fullscreen />
      </div>
    );
  }
  return (
    <main className="fixed inset-0 grid place-items-center overflow-hidden bg-black p-4">
      <div className="w-[402px] max-w-full rounded-[58px] ring-1 ring-white/15">
        <Phone api={api} />
      </div>
    </main>
  );
}
