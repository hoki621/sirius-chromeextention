import { isSiriusPortal } from "./scope.ts";

if (isSiriusPortal(window.location.href, window.self === window.top)) {
  // Issue #3 only: no API requests or page mutations until #2 confirms the contract.
  console.debug("[Sirius 学習支援] 基盤版を読み込みました。データ取得は未実装です。");
}
