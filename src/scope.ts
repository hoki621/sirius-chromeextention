export function isSiriusPortal(href: string, isTopFrame: boolean): boolean {
  if (!isTopFrame) return false;
  try {
    const url = new URL(href);
    return (
      url.origin === "https://lms.sirius.tuat.ac.jp" &&
      url.username === "" &&
      url.password === "" &&
      (url.pathname === "/portal" || url.pathname.startsWith("/portal/"))
    );
  } catch {
    return false;
  }
}
