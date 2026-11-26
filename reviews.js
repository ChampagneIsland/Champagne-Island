/* Champagne Island guest reviews, stored in Supabase.
   New reviews are saved as "not approved". Tick "approved" in the
   Supabase Table Editor and the review appears on the homepage. */
const SUPABASE_URL = "https://nbhkzsugpsoibvkbbnuo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ZcV7RPh7XJthw6frk32TZQ_oWxEWQpR"; // sb_publishable_... (safe to be public)

(() => {
  const API = SUPABASE_URL + "/rest/v1/reviews";
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY };
  const grid = document.querySelector("#reviews .gr-grid");
  const sum = document.querySelector("#reviews .gr-sum");
  const form = document.querySelector("#reviews .gr-form");
  if (!grid || !form) return;

  const slugs = {
    "Overnight accommodation": "overnight-accommodation", "Day trippers": "day-trippers",
    "Private venues": "private-venues", "Upscale camping": "upscale-camping", "Retreats": "retreats",
    "Nature trails": "nature-trails", "Medicinal trails": "medicinal-trails", "Fruit trails": "fruit-trails",
    "Birding": "birding", "Recreational fishing": "recreational-fishing", "Tour packages": "tour-packages",
    "Water recreation rentals": "water-recreation-rentals"
  };
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const stars = n => "★".repeat(n) + "☆".repeat(5 - n);
  const when = v => { const m = /^(\d{4})-(\d{2})$/.exec(v || ""); return m ? months[+m[2] - 1] + " " + m[1] : ""; };

  function card(r, featured) {
    const a = el("article", "gr-card" + (featured ? " gr-feat" : ""));
    const s = el("span", "gr-stars", stars(r.rating)); s.setAttribute("aria-label", r.rating + " out of 5 stars");
    const who = el("div", "gr-who"), av = el("div", "gr-av", (r.first_name || "?").trim().charAt(0).toUpperCase());
    av.setAttribute("aria-hidden", "true");
    const nm = el("div"); nm.append(el("strong", null, r.first_name), el("span", null, r.city_country));
    who.append(av, nm);
    const meta = el("div", "gr-meta"); meta.append(el("span", null, when(r.visit_date)));
    if (slugs[r.service]) { const c = el("a", "gr-chip", r.service); c.href = "offer/" + slugs[r.service] + ".html"; meta.append(c); }
    a.append(s, el("blockquote", "gr-quote", r.review), who, meta);
    return a;
  }

  async function load() {
    try {
      const res = await fetch(API + "?select=id,created_at,rating,review,first_name,city_country,visit_date,service" +
        "&order=created_at.desc&limit=12", { headers });
      if (!res.ok) return;
      const list = await res.json();
      if (!list.length) return; // keep the "Be one of our first reviews" card
      grid.replaceChildren(...list.map((r, i) => card(r, i === 0 && list.length >= 3)));
      if (sum) {
        const avg = list.reduce((t, r) => t + r.rating, 0) / list.length;
        sum.querySelector(".gr-score").textContent = avg.toFixed(1);
        const st = sum.querySelector(".gr-stars");
        st.textContent = stars(Math.round(avg)); st.setAttribute("aria-label", avg.toFixed(1) + " out of 5 stars");
        sum.querySelector("small").textContent = list.length + (list.length === 1 ? " guest review" : " guest reviews") + ", shared with permission";
        sum.hidden = false;
      }
    } catch (e) { /* offline or paused: leave the section as it is */ }
  }

  const status = form.querySelector(".gr-status");
  const say = (msg, ok) => { status.textContent = msg; status.className = "gr-status " + (ok ? "ok" : "err"); status.hidden = false; };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const d = new FormData(form);
    const btn = form.querySelector("button[type=submit]");
    if (d.get("_gotcha")) { form.reset(); say("Thank you! Your review has been sent.", true); return; } // spam bot
    const body = {
      rating: +d.get("rating"),
      review: (d.get("review") || "").trim(),
      first_name: (d.get("first_name") || "").trim(),
      city_country: (d.get("city_country") || "").trim(),
      visit_date: d.get("visit_date"),
      service: d.get("service"),
      contact: (d.get("contact") || "").trim() || null,
      consent: d.get("consent") === "yes"
    };
    if (body.review.length < 80) { say("Please write a little more: at least 80 characters.", false); return; }
    btn.disabled = true; btn.textContent = "Sending...";
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(res.status);
      form.reset();
      say("Thank you! Your review has been sent. It will appear here once it has been checked.", true);
    } catch (err) {
      say("Sorry, your review could not be sent right now. Please try again later.", false);
    } finally {
      btn.disabled = false; btn.textContent = "Send my review";
    }
  });

  load();
})();
