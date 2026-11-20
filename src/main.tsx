import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
declare const __BUILD__: string;

// Home Screen apps keep old builds. On open and every time the app comes back, check for a newer build and reload into it.
async function checkForUpdate() {
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const { build } = (await r.json()) as { build?: string };
    if (build && build !== __BUILD__ && sessionStorage.getItem("fb-reloaded") !== build) {
      sessionStorage.setItem("fb-reloaded", build);
      location.reload();
    }
  } catch {
    /* offline or storage blocked: keep the current build */
  }
}
if (typeof window !== "undefined" && location.protocol.startsWith("http")) {
  void checkForUpdate();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void checkForUpdate());
}



createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// No pinch or double-tap zoom: this should feel like the Messages app, not a web page.
const stop = (e: Event) => e.preventDefault();
document.addEventListener("gesturestart", stop);
document.addEventListener("gesturechange", stop);
document.addEventListener("gestureend", stop);
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener("dblclick", stop, { passive: false });
