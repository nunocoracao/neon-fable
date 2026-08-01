import { audio, installAutoUnlock } from "./audio";
// Importing the settings store applies persisted preferences (reduced
// motion class, text speed) before the first screen mounts.
import "./settings";
import { initScreenRouter, setFallbackScreen, showScreen } from "./ui/screen";
import { createMainMenuScreen } from "./ui/mainMenu";

const uiRoot = document.getElementById("ui-root");
if (!uiRoot) {
  throw new Error("Missing #ui-root element");
}

// Audio starts on the first user gesture (autoplay policy); until then
// every audio call is a safe no-op.
installAutoUnlock(audio);

// Every standard button press clicks; specific handlers layer their own
// cues (confirm chimes, combat impacts) on top.
document.addEventListener(
  "click",
  (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest("button.nf-button")
    ) {
      audio.emit("ui.click");
    }
  },
  true,
);

initScreenRouter(uiRoot);
setFallbackScreen(createMainMenuScreen);
showScreen(createMainMenuScreen());
