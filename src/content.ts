import { isSiriusPortal } from "./scope.ts";
import { mountPanel } from "./panel.ts";

if (isSiriusPortal(window.location.href, window.self === window.top)) {
  mountPanel();
  // A page restored from the back/forward cache needs a fresh, empty panel.
  window.addEventListener("pageshow", event => { if (event.persisted) mountPanel(); });
}
