import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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
