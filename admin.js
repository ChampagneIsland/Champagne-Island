/* Champagne Island owner page: sign in with a username, then approve,
   hide or delete guest reviews. The database (Row Level Security) checks
   every action, so this page cannot do anything without a valid owner login. */
(() => {
  const cfg = window.CI_SUPABASE || {};
  const URL_ = cfg.url, KEY = cfg.key;
  const [BOX, DOMAIN] = (cfg.loginEmail || "champagneisland1@gmail.com").split("@");
  const STORE = "ci-owner-session";
  const $ = s => document.querySelector(s);
  const loginView = $("#login"), appView = $("#app"), loginForm = $("#login-form"), loginMsg = $("#login-msg");
  const list = $("#list"), note = $("#note");
  let session = null, tab = "new", reviews = [];

  /* ---------- session storage (safe if storage is blocked) ---------- */
  const save = s => { session = s; try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch (e) {} };
  const restore = () => { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; } };

  /* ---------- Supabase Auth (plain fetch, no library) ---------- */
  async function auth(grant, body) {
    const res = await fetch(`${URL_}/auth/v1/token?grant_type=${grant}`, {
      method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error_description || data.msg || "Sign-in failed"); err.status = res.status; throw err; }
    return { access_token: data.access_token, refresh_token: data.refresh_token,
             expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600) };
  }
  async function freshToken() {
    if (!session) throw Object.assign(new Error("signed out"), { status: 401 });
    if (session.expires_at * 1000 - Date.now() < 60000) save(await auth("refresh_token", { refresh_token: session.refresh_token }));
    return session.access_token;
  }

  /* ---------- database calls ---------- */
  async function db(path, opts = {}, retry = true) {
    const token = await freshToken();
    const res = await fetch(`${URL_}/rest/v1/${path}`, { ...opts,
      headers: { apikey: KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", ...(opts.headers || {}) } });
    if (res.status === 401 && retry) { session.expires_at = 0; return db(path, opts, false); }
    if (!res.ok) throw Object.assign(new Error("Database error " + res.status), { status: res.status });
    return res.status === 204 ? null : res.json();
  }

  /* ---------- sign in / out ---------- */
  function show(signedIn) { loginView.hidden = signedIn; appView.hidden = !signedIn; $("#whoami").hidden = !signedIn; }
  function loginError(msg) { loginMsg.textContent = msg; loginMsg.hidden = false; }

  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    loginMsg.hidden = true;
    let user = $("#username").value.trim().toLowerCase();
    const pass = $("#password").value;
    if (!user || !pass) return loginError("Enter your username and password.");
    if (user.includes("@")) return loginError("Enter your username only, not an email address.");
    {
      if (!/^[a-z0-9._-]+$/.test(user)) return loginError("Usernames only use letters, numbers, dots, dashes and underscores.");
      user = BOX + "+" + user + "@" + DOMAIN;
    }
    const btn = loginForm.querySelector("button"); btn.disabled = true; btn.textContent = "Signing in...";
    try {
      save(await auth("password", { email: user, password: pass }));
      $("#password").value = "";
      await start();
    } catch (err) {
      save(null);
      loginError(err.status === 400 || err.status === 401 ? "Wrong username or password."
        : err.status === 429 ? "Too many tries. Wait a few minutes and try again."
        : "Could not reach the database. Check your internet and try again.");
    } finally { btn.disabled = false; btn.textContent = "Sign in"; }
  });

  $("#signout").addEventListener("click", async () => {
    try { if (session) await fetch(`${URL_}/auth/v1/logout`, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + session.access_token } }); } catch (e) {}
    save(null); reviews = []; show(false);
  });

  /* ---------- reviews ---------- */
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const visit = v => { const m = /^(\d{4})-(\d{2})$/.exec(v || ""); return m ? months[+m[2] - 1] + " " + m[1] : v || ""; };
  const sent = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const say = (msg, bad) => { note.textContent = msg; note.className = "note" + (bad ? " bad" : ""); note.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => note.hidden = true, 4000); };

  async function load() {
    list.replaceChildren(el("p", "empty", "Loading reviews..."));
    try {
      reviews = await db("reviews?select=id,created_at,rating,review,first_name,city_country,visit_date,service,contact,approved&order=created_at.desc");
      render();
    } catch (err) {
      if (err.status === 401) { save(null); show(false); return loginError("Please sign in again."); }
      list.replaceChildren(el("p", "empty", "Could not load reviews. Check your internet and press Refresh."));
    }
  }

  function render() {
    const waiting = reviews.filter(r => !r.approved), live = reviews.filter(r => r.approved);
    $("#count-new").textContent = waiting.length; $("#count-live").textContent = live.length;
    document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
    const show_ = tab === "new" ? waiting : live;
    if (!show_.length) {
      list.replaceChildren(el("p", "empty", tab === "new" ? "No new reviews right now. New ones will show up here." : "No reviews on the website yet. Approve one from New reviews."));
      return;
    }
    list.replaceChildren(...show_.map(card));
  }

  function card(r) {
    const c = el("article", "rcard");
    const top = el("div", "rtop");
    const st = el("span", "stars", "★".repeat(r.rating) + "☆".repeat(5 - r.rating)); st.setAttribute("aria-label", r.rating + " out of 5 stars");
    top.append(st, el("span", "when", "Sent " + sent(r.created_at)));
    const who = el("p", "who"); who.append(el("strong", null, r.first_name), document.createTextNode(" · " + r.city_country));
    const meta = el("p", "meta", `Visited ${visit(r.visit_date)} · ${r.service}`);
    c.append(top, el("blockquote", null, r.review), who, meta);
    if (r.contact) { const p = el("p", "private"); p.append(el("b", null, "Private contact: "), document.createTextNode(r.contact)); c.append(p); }

    const acts = el("div", "acts");
    const main = el("button", "btn small", r.approved ? "Hide from website" : "Approve");
    if (r.approved) main.classList.add("plain");
    main.onclick = () => act(r, main, () => db(`reviews?id=eq.${r.id}&select=id`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ approved: !r.approved }) }),
      rows => { r.approved = !r.approved; say(r.approved ? `${r.first_name}'s review is now on the website.` : `${r.first_name}'s review is hidden.`); });
    const del = el("button", "btn small danger", "Delete");
    del.onclick = () => {
      if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; setTimeout(() => { del.dataset.armed = ""; del.textContent = "Delete"; }, 3500); return; }
      act(r, del, () => db(`reviews?id=eq.${r.id}&select=id`, { method: "DELETE", headers: { Prefer: "return=representation" } }),
        () => { reviews = reviews.filter(x => x !== r); say("Review deleted."); });
    };
    acts.append(main, del); c.append(acts);
    return c;
  }

  async function act(r, btn, call, done) {
    btn.disabled = true;
    try {
      const rows = await call();
      if (!rows || !rows.length) throw new Error("no change");
      done(rows); render();
    } catch (err) {
      btn.disabled = false;
      if (err.status === 401) { save(null); show(false); return loginError("Please sign in again."); }
      say("That didn't work. Refresh and try again.", true);
    }
  }

  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
  $("#refresh").onclick = load;

  /* ---------- start ---------- */
  async function start() {
    try {
      const me = await db("admins?select=username,role");
      if (!me.length) { save(null); show(false); return loginError("This account doesn't have owner access."); }
      $("#me").textContent = me[0].username;
      show(true); load();
    } catch (err) {
      save(null); show(false);
      if (err.status !== 401) loginError("Could not reach the database. Check your internet and try again.");
    }
  }

  if (!KEY || KEY.startsWith("PASTE_")) { show(false); loginError("Setup needed: add the publishable key to supabase-config.js."); return; }
  session = restore();
  if (session) start(); else show(false);
})();
