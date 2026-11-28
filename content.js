/* Champagne Island: text the owner can change from the owner page.
   Any element with data-ci="key" shows the saved value for that key.
   If nothing is saved (or the database can't be reached) the page keeps its own text. */
(() => {
  const cfg = window.CI_SUPABASE || {};
  const CACHE = "ci-content", HIDE = "ci-banner-hidden";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  function apply(map) {
    document.querySelectorAll("[data-ci]").forEach(el => {
      if (el.dataset.ciDefault === undefined) el.dataset.ciDefault = el.textContent;
      const v = (map[el.dataset.ci] || "").trim();
      el.textContent = v || el.dataset.ciDefault;
      if (el.matches('a[href^="tel:"]')) {
        let d = el.textContent.replace(/[^\d+]/g, "");
        if (d && !d.startsWith("+")) d = (d.length === 7 ? "+501" : "+") + d;
        if (d) el.href = "tel:" + d;
      }
      if (el.dataset.ci.startsWith("price.")) {
        const tag = el.parentElement.querySelector("[data-ci-tag]");
        if (tag) { if (tag.dataset.ciDefault === undefined) tag.dataset.ciDefault = tag.textContent; tag.textContent = v ? "Price" : tag.dataset.ciDefault; }
      }
    });
    banner((map.announcement || "").trim());
  }

  function banner(text) {
    let b = document.querySelector(".ci-banner");
    if (!text || store.get(HIDE) === text) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement("div"); b.className = "ci-banner"; b.setAttribute("role", "status");
      b.innerHTML = '<p></p><button type="button" aria-label="Close">&times;</button>';
      b.querySelector("button").onclick = () => { store.set(HIDE, b.querySelector("p").textContent); b.remove(); };
      document.body.append(b);
    }
    b.querySelector("p").textContent = text;
  }

  try { apply(JSON.parse(store.get(CACHE) || "{}")); } catch (e) {}
  if (!cfg.url || !cfg.key || cfg.key.startsWith("PASTE_")) return;
  fetch(cfg.url + "/rest/v1/site_content?select=key,value", { headers: { apikey: cfg.key, Authorization: "Bearer " + cfg.key } })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(rows => { const map = {}; rows.forEach(r => map[r.key] = r.value); store.set(CACHE, JSON.stringify(map)); apply(map); })
    .catch(() => {});
})();
