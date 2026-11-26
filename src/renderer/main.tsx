import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initShowAllMode } from "./hooks/useShowAllMode";
import { initViewState } from "./lib/viewState";
import { dbg } from "../shared/debug";
import { addQueueLabels } from "../shared/queues";
import "./global.css";

const root = createRoot(document.getElementById("root")!);

// Not awaited: a slow download must not hold up the window
window.api
  ?.getQueueNames?.()
  .then(addQueueLabels)
  .catch(() => {});

// Pages read their remembered filters as they mount, so whether to remember at
// all has to be settled before the first render.
Promise.resolve(window.api?.getDebugEnabled?.())
  .catch(() => undefined)
  .then((debugEnabled) => {
    if (debugEnabled !== undefined) dbg.setEnabled(debugEnabled);
    return Promise.all([
      window.api?.getSetting?.("remember_filters"),
      window.api?.getSetting?.("show_all_mode"),
    ]);
  })
  .catch(() => null)
  .then((settings) => {
    const [remember, showAll] = settings ?? [];
    initViewState(remember !== "false");
    initShowAllMode(showAll);
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    );
  });
