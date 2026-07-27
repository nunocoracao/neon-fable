import { initScreenRouter, setFallbackScreen, showScreen } from "./ui/screen";
import { createMainMenuScreen } from "./ui/mainMenu";

const uiRoot = document.getElementById("ui-root");
if (!uiRoot) {
  throw new Error("Missing #ui-root element");
}

initScreenRouter(uiRoot);
setFallbackScreen(createMainMenuScreen);
showScreen(createMainMenuScreen());
