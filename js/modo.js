export function getModo() {
  const fromBody = document.body?.dataset?.modo;
  if (fromBody === "pc" || fromBody === "celular") return fromBody;
  const path = (location.pathname || "").toLowerCase();
  if (path.includes("/celular")) return "celular";
  if (path.includes("/pc")) return "pc";
  const q = new URLSearchParams(location.search).get("modo");
  if (q === "celular" || q === "pc") return q;
  return "pc";
}
