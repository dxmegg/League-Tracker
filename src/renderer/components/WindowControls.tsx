import { useEffect, useState } from "react";
import { MaximizeIcon, MinusIcon, RestoreIcon, XIcon } from "./icons";

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.api.isWindowMaximized().then(setMaximized);
    return window.api.onMaximizedChanged(setMaximized);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => window.api.minimizeWindow()}
        title="Minimize"
        className="titlebar-no-drag flex h-8 w-8 items-center justify-center text-lol-text transition-colors hover:bg-white/5 hover:text-lol-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60"
      >
        <MinusIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => window.api.toggleMaximizeWindow()}
        title={maximized ? "Restore" : "Maximize"}
        className="titlebar-no-drag flex h-8 w-8 items-center justify-center text-lol-text transition-colors hover:bg-white/5 hover:text-lol-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60"
      >
        {maximized ? <RestoreIcon className="h-3 w-3" /> : <MaximizeIcon className="h-3 w-3" />}
      </button>
      <button
        type="button"
        onClick={() => window.api.closeWindow()}
        title="Close"
        className="titlebar-no-drag flex h-8 w-8 items-center justify-center text-lol-text transition-colors hover:bg-lol-loss hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-loss/70"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
