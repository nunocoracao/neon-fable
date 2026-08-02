import { audio, installAutoUnlock, installFocusDucking } from "./audio";
// Importing the settings store applies persisted preferences (reduced
// motion class, text speed) before the first screen mounts.
import "./settings";
import {
  initScreenRouter,
  installErrorBoundary,
  setFallbackScreen,
  showScreen,
} from "./ui/screen";
import { createMainMenuScreen } from "./ui/mainMenu";

const uiRoot = document.getElementById("ui-root");
if (!uiRoot) {
  throw new Error("Missing #ui-root element");
}

// Audio starts on the first user gesture (autoplay policy); until then
// every audio call is a safe no-op.
installAutoUnlock(audio);

// Looking away quiets the game: unfocused ducks, a hidden tab silences.
// Switchable off in Settings, for the second monitor it is running on.
installFocusDucking(audio);

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
// Anything that escapes a handler or a promise lands on the crash
// screen with the run stashed, rather than on a page that has stopped
// responding with no explanation.
installErrorBoundary();
showScreen(createMainMenuScreen());
