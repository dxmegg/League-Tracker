import { createRoot } from "react-dom/client";
import App from "./App";
import { initViewState } from "./lib/viewState";
import { dbg } from "../shared/debug";
import "./global.css";

const root = createRoot(document.getElementById("root")!);
const themeSetting = window.api?.getSetting?.("theme");

// Pages read their remembered filters as they mount, so whether to remember at
// all has to be settled before the first render.
Promise.resolve(window.api?.getDebugEnabled?.())
  .catch(() => undefined)
  .then((debugEnabled) => {
    if (debugEnabled !== undefined) dbg.setEnabled(debugEnabled);
    return window.api?.getSetting?.("remember_filters");
  })
  .catch(() => null)
  .then((remember) => {
    initViewState(remember === "true");
    return Promise.resolve(themeSetting)
      .catch(() => null)
      .then((stored) => {
        const valid = stored === "test" || stored === "pink" ? stored : "test";
        document.documentElement.setAttribute("data-theme", valid);
      })
      .finally(() => {
        root.render(<App />);
      });
  });
