/* Champagne Island owner page.
   Sign in with a username, then manage bookings, reviews, closed days and site text.
   The database (Row Level Security) checks every action:
   owner = everything; staff = bookings (see, confirm/decline, check in) + approve reviews. */
(() => {
  const cfg = window.CI_SUPABASE || {};
  const URL_ = cfg.url, KEY = cfg.key;
  const [BOX, DOMAIN] = (cfg.loginEmail || "champagneisland1@gmail.com").split("@");
  const STORE = "ci-owner-session";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const loginMsg = $("#login-msg"), note = $("#note");
  let session = null, me = { username: "", role: "staff" }, section = "today";
  let bookings = [], reviews = [], closedDays = [], closedAll = [], content = {};
  let bTab = "requests", rTab = "new";

  /* ---------- helpers ---------- */
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pad = n => String(n).padStart(2, "0");
  const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoDay(new Date());
  const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return isoDay(d); };
  const niceDay = s => new Date(s + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const niceTime = s => { const d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const ym = v => { const m = /^(\d{4})-(\d{2})$/.exec(v || ""); return m ? months[+m[2] - 1] + " " + m[1] : v || ""; };
  const say = (msg, bad) => { note.textContent = msg; note.className = "toast" + (bad ? " bad" : ""); note.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => note.hidden = true, 4000); };
  const isOwner = () => me.role === "owner";
  const save = s => { session = s; try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch (e) {} };
  const restore = () => { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; } };
  function twoTap(btn, label, run) {
    btn.onclick = () => {
      if (btn.dataset.armed !== "1") { btn.dataset.armed = "1"; btn.textContent = "Tap again to " + label.toLowerCase(); setTimeout(() => { btn.dataset.armed = ""; btn.textContent = label; }, 3500); return; }
      run();
    };
  }

  /* ---------- Supabase Auth + database ---------- */
  async function auth(grant, body) {
    const res = await fetch(`${URL_}/auth/v1/token?grant_type=${grant}`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error_description || data.msg || "Sign-in failed"), { status: res.status });
    return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600) };
  }
  async function freshToken() {
    if (!session) throw Object.assign(new Error("signed out"), { status: 401 });
    if (session.expires_at * 1000 - Date.now() < 60000) save(await auth("refresh_token", { refresh_token: session.refresh_token }));
    return session.access_token;
  }
  async function db(path, opts = {}, retry = true) {
    const token = await freshToken();
    const res = await fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: { apikey: KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", ...(opts.headers || {}) } });
    if (res.status === 401 && retry) { session.expires_at = 0; return db(path, opts, false); }
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw Object.assign(new Error(b.message || "Database error " + res.status), { status: res.status, code: b.code }); }
    return res.status === 204 ? null : res.json();
  }
  const change = (path, method, body) => db(path, { method, headers: { Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined })
    .then(rows => { if (!rows || !rows.length) throw new Error("Nothing changed"); return rows; });
  function failed(err) {
    if (err.status === 401) { signedOut("Please sign in again."); return; }
    say(err.code === "23505" ? "That already exists." : "That didn't work. Refresh and try again.", true);
  }

  /* ---------- sign in / out ---------- */
  function show(signedIn) { $("#login").hidden = signedIn; $("#app").hidden = !signedIn; }
  function loginError(msg) { loginMsg.textContent = msg; loginMsg.hidden = false; }
  function signedOut(msg) { save(null); show(false); if (msg) loginError(msg); }

  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault(); loginMsg.hidden = true;
    const user = $("#username").value.trim().toLowerCase(), pass = $("#password").value;
    if (!user || !pass) return loginError("Enter your username and password.");
    if (user.includes("@")) return loginError("Enter your username only, not an email address.");
    if (!/^[a-z0-9._-]+$/.test(user)) return loginError("Usernames only use letters, numbers, dots, dashes and underscores.");
    const btn = $("#login-form button"); btn.disabled = true; btn.textContent = "Signing in...";
    try { save(await auth("password", { email: `${BOX}+${user}@${DOMAIN}`, password: pass })); $("#password").value = ""; await start(); }
    catch (err) {
      save(null);
      loginError(/banned/i.test(err.message) ? "This login has been switched off. Ask the owner." : err.status === 400 || err.status === 401 ? "Wrong username or password." : err.status === 429 ? "Too many tries. Wait a few minutes and try again." : "Could not reach the database. Check your internet and try again.");
    } finally { btn.disabled = false; btn.textContent = "Sign in"; }
  });
  $("#signout").addEventListener("click", async () => {
    try { if (session) await fetch(`${URL_}/auth/v1/logout`, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + session.access_token } }); } catch (e) {}
    save(null); bookings = reviews = closedDays = closedAll = team = []; seenB = seenR = null; clearInterval(pollTimer); show(false);
  });

  /* ---------- sections ---------- */
  function go(name) {
    if (!isOwner() && ["closed", "content", "team", "history"].includes(name)) name = "today";
    section = name;
    $$(".snav button").forEach(b => b.setAttribute("aria-current", b.dataset.sec === name ? "page" : "false"));
    $$(".sec").forEach(s => s.hidden = s.id !== "sec-" + name);
    const btn = document.querySelector(`.snav button[data-sec="${name}"]`);
    $("#top-title").textContent = btn ? btn.childNodes[1].textContent.trim() : "";
    drawer(false); scrollTo(0, 0);
    render();
    if (name === "team") renderTeam();
    if (name === "account") renderAccount();
    if (name === "history") { fillWho(); loadHistory(false); }
  }
  $$(".snav button").forEach(b => b.onclick = () => go(b.dataset.sec));
  $("#refresh").onclick = () => loadAll();

  async function loadAll() {
    const since = addDays(today(), -90);
    try {
      let [b, r, c, s] = await Promise.all([
        db(`bookings?select=id,ref,created_at,service,visit_date,nights,group_size,name,phone,email,notes,status,updated_at,handled_by&visit_date=gte.${since}&order=visit_date.asc,created_at.asc`),
        db("reviews?select=id,created_at,rating,review,first_name,city_country,visit_date,service,contact,approved&order=created_at.desc"),
        db(`closed_days?select=day,note&day=gte.${since}&order=day`),
        isOwner() ? db("site_content?select=key,value,updated_at,updated_by") : Promise.resolve([])
      ]);
      if (loadedFrom < since) { const keep = bookings.filter(x => x.visit_date < since); b = keep.concat(b); }
      bookings = b; reviews = r; closedAll = c; closedDays = c.filter(x => x.day >= today()); content = {}; s.forEach(x => content[x.key] = x);
      rememberSeen();
      render(); if (isOwner()) { fillContent(); loadTeam(); }
    } catch (err) {
      if (err.status === 401) return signedOut("Please sign in again.");
      say("Could not load everything. Check your internet and press Refresh.", true);
    }
  }

  function render() {
    const pending = bookings.filter(b => b.status === "pending").length, newRev = reviews.filter(r => !r.approved).length;
    $("#n-bookings").textContent = pending; $("#n-bookings").hidden = !pending;
    $("#n-reviews").textContent = newRev; $("#n-reviews").hidden = !newRev;
    const total = pending + newRev;
    $("#top-n").textContent = total; $("#top-n").hidden = !total;
    document.title = (total ? `(${total}) ` : "") + "Owner page | Champagne Island";
    if (section === "today") renderToday();
    if (section === "bookings") renderBookings();
    if (section === "reviews") renderReviews();
    if (section === "closed") renderClosed();
  }

  /* ---------- bookings ---------- */
  const STATUS = { pending: "New request", confirmed: "Confirmed", arrived: "Checked in", declined: "Declined", cancelled: "Cancelled" };
  const closedOn = d => closedDays.find(c => c.day === d);
  function bookingGroups() {
    const t = today();
    return {
      requests: bookings.filter(b => b.status === "pending"),
      upcoming: bookings.filter(b => b.status === "confirmed" && b.visit_date >= t),
      past: bookings.filter(b => !(b.status === "pending" || (b.status === "confirmed" && b.visit_date >= t))).slice().reverse()
    };
  }
  $$("#sec-bookings .tabs button").forEach(b => b.onclick = () => { bTab = b.dataset.tab; renderBookings(); });
  function renderBookings() {
    const g = bookingGroups();
    $("#c-requests").textContent = g.requests.length; $("#c-upcoming").textContent = g.upcoming.length; $("#c-past").textContent = g.past.length;
    $$("#sec-bookings .tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === bTab));
    const list = $("#b-list"), items = g[bTab];
    if (!items.length) {
      list.replaceChildren(el("p", "empty", { requests: "No new booking requests. New ones will show up here.", upcoming: "No confirmed bookings coming up.", past: "Nothing here yet. Checked-in, declined and cancelled bookings show up here." }[bTab]));
      return;
    }
    list.replaceChildren(...items.map(bookingCard));
  }
  function waLink(b) {
    let d = (b.phone || "").replace(/\D/g, "");
    if (d.length === 7) d = "501" + d;
    if (d.length < 8) return null;
    const msg = `Hi ${b.name}, this is Champagne Island about your booking ${b.ref} for ${b.service} on ${niceDay(b.visit_date)}.`;
    return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
  }
  function bookingCard(b) {
    const c = el("article", "rcard bcard s-" + b.status);
    const t = today(), when = b.visit_date === t ? "Today" : b.visit_date === addDays(t, 1) ? "Tomorrow" : "";
    const top = el("div", "rtop"); top.append(el("span", "pill", STATUS[b.status]), el("span", "ref", b.ref));
    const date = el("p", "bdate"); date.append(document.createTextNode(niceDay(b.visit_date))); if (when) date.append(el("span", "soon", when));
    const what = el("p", "bwhat", `${b.service} · ${b.group_size} ${b.group_size === 1 ? "person" : "people"}` + (b.nights ? ` · ${b.nights} night${b.nights > 1 ? "s" : ""}` : ""));
    c.append(top, date, what);
    if (closedOn(b.visit_date) && ["pending", "confirmed"].includes(b.status)) c.append(el("p", "warn", "This date is marked as closed. Contact the guest."));
    const who = el("div", "bwho");
    who.append(el("strong", null, b.name));
    const links = el("div", "blinks");
    const wa = waLink(b);
    if (wa) { const a = el("a", "bchip wa", "WhatsApp"); a.href = wa; a.target = "_blank"; a.rel = "noopener"; links.append(a); }
    const call = el("a", "bchip", "Call " + b.phone); call.href = "tel:" + b.phone.replace(/[^\d+]/g, ""); links.append(call);
    if (b.email) { const m = el("a", "bchip", b.email); m.href = `mailto:${b.email}?subject=${encodeURIComponent("Your Champagne Island booking " + b.ref)}`; links.append(m); }
    who.append(links); c.append(who);
    if (b.notes) c.append(el("blockquote", "bnotes", b.notes));
    c.append(el("p", "meta", `Sent ${niceTime(b.created_at)}` + (b.handled_by ? ` · last updated by ${b.handled_by}` : "")));

    const acts = el("div", "acts");
    const setStatus = (label, status, cls, msg, confirm2) => {
      const btn = el("button", "btn small" + (cls ? " " + cls : ""), label);
      const run = () => { btn.disabled = true; change(`bookings?id=eq.${b.id}&select=id,status,handled_by,updated_at`, "PATCH", { status })
        .then(([row]) => { Object.assign(b, row); say(msg); render(); }).catch(err => { btn.disabled = false; failed(err); }); };
      if (confirm2) twoTap(btn, label, run); else btn.onclick = run;
      acts.append(btn);
    };
    if (b.status === "pending") { setStatus("Confirm", "confirmed", "", `${b.ref} confirmed. Let ${b.name} know.`); setStatus("Decline", "declined", "plain", `${b.ref} declined.`, true); }
    if (b.status === "confirmed") { setStatus("Check in", "arrived", "", `${b.name} checked in.`); setStatus("Cancel", "cancelled", "plain", `${b.ref} cancelled.`, true); }
    if (b.status === "arrived") setStatus("Undo check-in", "confirmed", "plain", "Check-in undone.");
    if (b.status === "declined" || b.status === "cancelled") setStatus("Move back to requests", "pending", "plain", `${b.ref} is back in requests.`);
    if (isOwner()) {
      const del = el("button", "btn small danger", "Delete");
      twoTap(del, "Delete", () => { del.disabled = true; change(`bookings?id=eq.${b.id}&select=id`, "DELETE")
        .then(() => { bookings = bookings.filter(x => x !== b); say("Booking deleted."); render(); }).catch(err => { del.disabled = false; failed(err); }); });
      acts.append(del);
    }
    c.append(acts);
    return c;
  }

  /* ---------- reviews ---------- */
  $$("#sec-reviews .tabs button").forEach(b => b.onclick = () => { rTab = b.dataset.tab; renderReviews(); });
  function renderReviews() {
    const waiting = reviews.filter(r => !r.approved), live = reviews.filter(r => r.approved);
    $("#c-new").textContent = waiting.length; $("#c-live").textContent = live.length;
    $$("#sec-reviews .tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === rTab));
    const items = rTab === "new" ? waiting : live, list = $("#r-list");
    if (!items.length) return list.replaceChildren(el("p", "empty", rTab === "new" ? "No new reviews right now. New ones will show up here." : "No reviews on the website yet. Approve one from New reviews."));
    list.replaceChildren(...items.map(reviewCard));
  }
  function reviewCard(r) {
    const c = el("article", "rcard");
    const top = el("div", "rtop");
    const st = el("span", "stars", "★".repeat(r.rating) + "☆".repeat(5 - r.rating)); st.setAttribute("aria-label", r.rating + " out of 5 stars");
    top.append(st, el("span", "when", "Sent " + niceTime(r.created_at)));
    const who = el("p", "who"); who.append(el("strong", null, r.first_name), document.createTextNode(" · " + r.city_country));
    c.append(top, el("blockquote", null, r.review), who, el("p", "meta", `Visited ${ym(r.visit_date)} · ${r.service}`));
    if (r.contact) { const p = el("p", "private"); p.append(el("b", null, "Private contact: "), document.createTextNode(r.contact)); c.append(p); }
    const acts = el("div", "acts");
    const main = el("button", "btn small" + (r.approved ? " plain" : ""), r.approved ? "Hide from website" : "Approve");
    main.onclick = () => { main.disabled = true; change(`reviews?id=eq.${r.id}&select=id`, "PATCH", { approved: !r.approved })
      .then(() => { r.approved = !r.approved; say(r.approved ? `${r.first_name}'s review is now on the website.` : `${r.first_name}'s review is hidden.`); render(); })
      .catch(err => { main.disabled = false; failed(err); }); };
    acts.append(main);
    if (isOwner()) {
      const del = el("button", "btn small danger", "Delete");
      twoTap(del, "Delete", () => { del.disabled = true; change(`reviews?id=eq.${r.id}&select=id`, "DELETE")
        .then(() => { reviews = reviews.filter(x => x !== r); say("Review deleted."); render(); }).catch(err => { del.disabled = false; failed(err); }); });
      acts.append(del);
    }
    c.append(acts);
    return c;
  }

  /* ---------- closed days (owner) ---------- */
  $("#closed-form").addEventListener("submit", e => {
    e.preventDefault();
    const day = $("#cd-day").value, noteTxt = $("#cd-note").value.trim();
    if (!day) return say("Choose a date to close.", true);
    if (day < today()) return say("Choose today or a future date.", true);
    const btn = $("#closed-form button"); btn.disabled = true;
    change("closed_days?select=day,note", "POST", { day, note: noteTxt || null })
      .then(([row]) => { closedDays.push(row); closedAll.push(row); closedDays.sort((a, b) => a.day < b.day ? -1 : 1); $("#cd-day").value = ""; $("#cd-note").value = ""; say(`${niceDay(day)} is now closed.`); render(); })
      .catch(err => err.code === "23505" ? say("That day is already closed.", true) : failed(err))
      .finally(() => btn.disabled = false);
  });
  function renderClosed() {
    $("#cd-day").min = today();
    const list = $("#cd-list");
    if (!closedDays.length) return list.replaceChildren(el("p", "empty", "No closed days coming up. The island is open every day."));
    list.replaceChildren(...closedDays.map(c => {
      const row = el("div", "cdrow");
      const txt = el("div"); txt.append(el("strong", null, niceDay(c.day)), el("span", null, c.note || "No reason shown to guests"));
      const active = bookings.filter(b => b.visit_date === c.day && ["pending", "confirmed"].includes(b.status)).length;
      if (active) txt.append(el("span", "warn", `${active} booking${active > 1 ? "s" : ""} on this day. Contact ${active > 1 ? "those guests" : "the guest"}.`));
      const btn = el("button", "btn small plain", "Reopen");
      btn.onclick = () => { btn.disabled = true; change(`closed_days?day=eq.${c.day}&select=day`, "DELETE")
        .then(() => { closedDays = closedDays.filter(x => x !== c); closedAll = closedAll.filter(x => x.day !== c.day); say(`${niceDay(c.day)} is open again.`); render(); }).catch(err => { btn.disabled = false; failed(err); }); };
      row.append(txt, btn);
      return row;
    }));
  }

  /* ---------- site content (owner) ---------- */
  const SERVICES = [["overnight-accommodation","Overnight accommodation","BZ$150","per person, per night","Sleeps: [add capacity]"],["day-trippers","Day trippers","BZ$60","per person","Hours: [add hours]"],["private-venues","Private venues","From BZ$800","per event","Capacity: [add guest count]"],["upscale-camping","Upscale camping","BZ$120","per tent, per night","Sleeps: [add capacity]"],["retreats","Retreats","From BZ$250","per person, per night","Group size: [add range]"],["nature-trails","Nature trails","BZ$25","per person, guided","Duration: [add duration]"],["medicinal-trails","Medicinal trails","BZ$30","per person, guided","Duration: [add duration]"],["fruit-trails","Fruit trails","BZ$30","per person, guided","Duration: [add duration]"],["birding","Birding","BZ$40","per person, guided","Best time: [add best time]"],["recreational-fishing","Recreational fishing","BZ$80","per person","Duration: [add duration]"],["tour-packages","Tour packages","From BZ$120","per person","Duration: [add duration]"],["water-recreation-rentals","Water recreation rentals","BZ$20","per hour","Availability: [add details]"]];
  function field(key, label, def, opts = {}) {
    const w = el("label", "cf"); w.append(el("span", null, label));
    const input = el(opts.area ? "textarea" : "input"); input.dataset.key = key; input.maxLength = opts.max || 200;
    if (opts.area) input.rows = opts.rows || 2;
    input.placeholder = def ? "Website shows: " + def : "Not set";
    w.append(input);
    if (opts.help) w.append(el("small", null, opts.help));
    return w;
  }
  function buildContent() {
    const f = $("#content-form"); if (f.dataset.built) return; f.dataset.built = "1";
    const g1 = el("fieldset", "cgroup"); g1.append(el("legend", null, "Announcement"),
      field("announcement", "Message at the bottom of every page", "", { area: true, max: 200, help: "For example: \"Closed Dec 24 to 26 for the holidays.\" Leave empty to hide it." }));
    const g2 = el("fieldset", "cgroup"); g2.append(el("legend", null, "Contact"),
      field("contact.phone", "Phone / WhatsApp", "", { max: 30, help: "Shown in Contact on the homepage and on Plan your visit." }),
      field("contact.directions", "Getting here", "A short boat ride from the mainland, within sight of the Placencia Peninsula.", { area: true, rows: 3, max: 400 }));
    const g3 = el("fieldset", "cgroup"); g3.append(el("legend", null, "Service prices and details"),
      el("p", "hint", "Leave a box empty to keep what the website shows now. When you set a price, its label changes from \"Sample price\" to \"Price\"."));
    SERVICES.forEach(([slug, name, price, per, detail]) => {
      const d = el("details", "svcbox"); d.append(el("summary", null, name));
      const row = el("div", "svcrow");
      row.append(field("price." + slug, "Price", price, { max: 40 }), field("per." + slug, "Price note", per, { max: 60 }), field("detail." + slug, "Details line", detail, { max: 120 }));
      d.append(row); g3.append(d);
    });
    f.prepend(g1, g2, g3);
  }
  function fillContent() {
    buildContent();
    $$("#content-form [data-key]").forEach(i => { i.value = (content[i.dataset.key] && content[i.dataset.key].value) || ""; i.dataset.saved = i.value; });
    const latest = Object.values(content).filter(x => x.value).sort((a, b) => a.updated_at < b.updated_at ? 1 : -1)[0];
    $("#content-saved").textContent = latest ? `Last saved ${niceTime(latest.updated_at)}` + (latest.updated_by ? ` by ${latest.updated_by}` : "") : "";
  }
  $("#content-form").addEventListener("submit", e => {
    e.preventDefault();
    const changed = $$("#content-form [data-key]").filter(i => i.value.trim() !== i.dataset.saved).map(i => ({ key: i.dataset.key, value: i.value.trim() }));
    if (!changed.length) return say("Nothing to save. You haven't changed anything.");
    const btn = $("#content-form button[type=submit]"); btn.disabled = true; btn.textContent = "Saving...";
    db("site_content?on_conflict=key&select=key,value,updated_at,updated_by", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(changed) })
      .then(rows => { rows.forEach(x => content[x.key] = x); fillContent(); say(`Saved ${rows.length} change${rows.length > 1 ? "s" : ""}. The website is updated.`); })
      .catch(failed).finally(() => { btn.disabled = false; btn.textContent = "Save changes"; });
  });

  /* ---------- team (owner) and my account (everyone) ---------- */
  let team = [];
  async function fn(action, payload) {
    const token = await freshToken();
    let res;
    try {
      res = await fetch(`${URL_}/functions/v1/team`, { method: "POST",
        headers: { apikey: KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }) });
    } catch (e) {
      // No usable answer: offline, or the "team" Edge Function is missing / has Verify JWT on.
      throw Object.assign(new Error("Couldn't reach the team function. Check your internet, and check that the \"team\" Edge Function is deployed in Supabase with Verify JWT turned off."), { friendly: true });
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw Object.assign(new Error("signed out"), { status: 401 });
    if (!res.ok || data.error) throw Object.assign(new Error(data.error || (res.status === 404 ? "The team function isn't set up yet in Supabase." : "Something went wrong (" + res.status + ").")), { status: res.status, friendly: true });
    return data;
  }
  const fnFailed = err => err.status === 401 ? signedOut("Please sign in again.") : say(err.friendly ? err.message : "Couldn't reach Supabase. Check your internet and try again.", true);
  const WORDS = ["palm","lagoon","coconut","sunset","dory","mango","pelican","reef","breeze","hammock","toucan","island","cashew",
    "manatee","papaya","harbor","jaguar","orchid","cacao","marimba","tapir","heron","coral","pier","guava","banana","lobster",
    "conch","dolphin","frigate","mangrove","seagrass","bamboo","cohune","kayak","sandbar","starfish","parrot","iguana","hibiscus"];
  function suggestPassword() {
    const r = new Uint32Array(4); crypto.getRandomValues(r);
    const picked = [];
    for (let i = 0; picked.length < 3; i++) { const w = WORDS[(r[i % 3] + i * 7) % WORDS.length]; if (!picked.includes(w)) picked.push(w); }
    return picked.join("-") + "-" + (10 + r[3] % 90);
  }
  function pwField(id, label) {
    const w = el("label", "cf"); w.append(el("span", null, label));
    const row = el("div", "pwrow"); const i = el("input"); i.id = id; i.type = "password"; i.autocomplete = "new-password"; i.minLength = 8; i.maxLength = 72;
    const showBtn = el("button", "mini", "Show"); showBtn.type = "button";
    showBtn.onclick = () => { const s = i.type === "password"; i.type = s ? "text" : "password"; showBtn.textContent = s ? "Hide" : "Show"; };
    const sug = el("button", "mini", "Suggest"); sug.type = "button";
    sug.onclick = () => { i.value = suggestPassword(); i.type = "text"; showBtn.textContent = "Hide"; };
    row.append(i, showBtn, sug); w.append(row, el("small", null, "At least 8 characters."));
    return w;
  }
  const ago = s => { if (!s) return "Never signed in"; const m = Math.round((Date.now() - new Date(s)) / 60000);
    return "Last signed in " + (m < 2 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : niceTime(s)); };

  async function loadTeam() {
    try { team = await db("rpc/team_list", { method: "POST", body: "{}" }); renderTeam(); fillWho(); }
    catch (err) { if (err.status === 401) return signedOut("Please sign in again."); $("#team-list").replaceChildren(el("p", "empty", "Couldn't load the team. Press Refresh.")); }
  }

  function buildTeamForm() {
    const f = $("#team-form"); if (f.dataset.built) return; f.dataset.built = "1";
    const name = el("label", "cf"); name.append(el("span", null, "Person's name")); const ni = el("input"); ni.id = "t-name"; ni.maxLength = 80; ni.placeholder = "e.g. Maya Garcia"; name.append(ni);
    const user = el("label", "cf"); user.append(el("span", null, "Username (what they type to sign in)")); const ui = el("input"); ui.id = "t-user"; ui.maxLength = 30; ui.autocapitalize = "none"; ui.spellcheck = false; ui.placeholder = "e.g. maya"; user.append(ui, el("small", null, "3 to 30 characters: lowercase letters, numbers, dots, dashes or underscores."));
    ni.addEventListener("input", () => { if (!ui.dataset.touched) ui.value = ni.value.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9._-]/g, ""); });
    ui.addEventListener("input", () => { ui.dataset.touched = "1"; });
    const role = el("label", "cf"); role.append(el("span", null, "Role"));
    const rs = el("select"); rs.id = "t-role"; rs.append(new Option("Staff: bookings and approving reviews", "staff"), new Option("Owner: everything", "owner")); role.append(rs);
    const btn = el("button", "btn", "Create login"); btn.type = "submit"; btn.style.justifyContent = "center"; btn.style.cursor = "pointer";
    f.append(el("h2", null, "Add a person"), name, user, role, pwField("t-pass", "Password"), btn,
      el("p", "hint", "Give them their username and password in person or by WhatsApp. They can change the password later under My account."));
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const payload = { full_name: ni.value.trim(), username: ui.value.trim().toLowerCase(), role: rs.value, password: $("#t-pass").value };
      if (!payload.full_name) return say("Enter the person's name.", true);
      if (!/^[a-z0-9._-]{3,30}$/.test(payload.username)) return say("Check the username: 3 to 30 lowercase letters, numbers, dots, dashes or underscores.", true);
      if (payload.password.length < 8) return say("The password needs at least 8 characters.", true);
      btn.disabled = true; btn.textContent = "Creating...";
      try { await fn("create", payload); say(`${payload.full_name} can now sign in as "${payload.username}".`); f.reset(); delete ui.dataset.touched; $("#t-pass").type = "password"; loadTeam(); }
      catch (err) { fnFailed(err); } finally { btn.disabled = false; btn.textContent = "Create login"; }
    });
  }

  function renderTeam() {
    buildTeamForm();
    const list = $("#team-list");
    if (!team.length) return list.replaceChildren(el("p", "empty", "Loading the team..."));
    list.replaceChildren(...team.map(memberCard));
  }

  function memberCard(m) {
    const self = m.user_id === me.user_id;
    const c = el("article", "rcard mcard" + (m.active ? "" : " off"));
    const top = el("div", "rtop");
    top.append(el("span", "pill " + (m.role === "owner" ? "p-owner" : "p-staff"), m.role === "owner" ? "Owner" : "Staff"),
      el("span", "when", m.active ? ago(m.last_sign_in_at) : "Login switched off"));
    const nm = el("p", "bdate", m.full_name || m.username); if (self) nm.append(el("span", "soon", "You"));
    c.append(top, nm, el("p", "meta", "Signs in as: " + m.username));

    const box = el("div", "editbox"); box.hidden = true;
    const acts = el("div", "acts");
    const openBox = (build) => { box.replaceChildren(...build()); box.hidden = false; acts.hidden = true; };
    const closeBox = () => { box.hidden = true; acts.hidden = false; };
    const cancel = () => { const b = el("button", "btn small plain", "Cancel"); b.type = "button"; b.onclick = closeBox; return b; };
    const run = async (btn, action, payload, msg) => {
      btn.disabled = true;
      try { await fn(action, { user_id: m.user_id, ...payload }); say(msg); await loadTeam(); }
      catch (err) { btn.disabled = false; fnFailed(err); }
    };

    const pw = el("button", "btn small", "Change password");
    pw.onclick = () => openBox(() => {
      const save_ = el("button", "btn small", "Save password"); save_.type = "button";
      save_.onclick = () => { const v = $("#pw-" + m.user_id).value; if (v.length < 8) return say("The password needs at least 8 characters.", true); run(save_, "set_password", { password: v }, `Password changed for ${m.full_name || m.username}. Let them know the new one.`); };
      const row = el("div", "acts"); row.append(save_, cancel());
      return [pwField("pw-" + m.user_id, "New password"), row];
    });
    const edit = el("button", "btn small plain", "Edit");
    edit.onclick = () => openBox(() => {
      const n = el("label", "cf"); n.append(el("span", null, "Name")); const ni = el("input"); ni.value = m.full_name || ""; ni.maxLength = 80; n.append(ni);
      const u = el("label", "cf"); u.append(el("span", null, "Username")); const ui = el("input"); ui.value = m.username; ui.maxLength = 30; ui.autocapitalize = "none"; u.append(ui);
      const r = el("label", "cf"); r.append(el("span", null, "Role")); const rs = el("select"); rs.append(new Option("Staff", "staff"), new Option("Owner", "owner")); rs.value = m.role; rs.disabled = self; r.append(rs);
      if (self) r.append(el("small", null, "You can't change your own role."));
      const sv = el("button", "btn small", "Save"); sv.type = "button";
      sv.onclick = () => {
        const payload = { full_name: ni.value.trim(), username: ui.value.trim().toLowerCase() };
        if (!self) payload.role = rs.value;
        if (!/^[a-z0-9._-]{3,30}$/.test(payload.username)) return say("Check the username: 3 to 30 lowercase letters, numbers, dots, dashes or underscores.", true);
        run(sv, "update", payload, payload.username !== m.username ? `Saved. ${payload.full_name || m.username} now signs in as "${payload.username}".` : "Saved.");
      };
      const row = el("div", "acts"); row.append(sv, cancel());
      return [n, u, r, row];
    });
    acts.append(pw, edit);
    if (!self) {
      const tog = el("button", "btn small " + (m.active ? "plain" : ""), m.active ? "Switch off login" : "Switch on login");
      const doTog = () => run(tog, "set_active", { active: !m.active }, m.active ? `${m.full_name || m.username} can't sign in anymore.` : `${m.full_name || m.username} can sign in again.`);
      if (m.active) twoTap(tog, "Switch off login", doTog); else tog.onclick = doTog;
      const del = el("button", "btn small danger", "Delete");
      twoTap(del, "Delete", () => run(del, "delete", {}, `${m.full_name || m.username}'s login was deleted.`));
      acts.append(tog, del);
    }
    c.append(box, acts);
    return c;
  }

  function renderAccount() {
    $("#acc-name").textContent = me.full_name || me.username;
    $("#acc-user").textContent = me.username;
    $("#acc-role").textContent = isOwner() ? "Owner: can do everything" : "Staff: bookings and approving reviews";
    const f = $("#acc-form"); if (f.dataset.built) return; f.dataset.built = "1";
    const btn = el("button", "btn", "Change my password"); btn.type = "submit"; btn.style.justifyContent = "center"; btn.style.cursor = "pointer";
    f.append(el("h2", null, "Change my password"), pwField("acc-pass", "New password"), pwField("acc-pass2", "Type it again"), btn);
    $$("#acc-form .mini:last-child").forEach(b => b.remove()); // no "Suggest" on your own password
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const a = $("#acc-pass").value, b = $("#acc-pass2").value;
      if (a.length < 8) return say("Your new password needs at least 8 characters.", true);
      if (a !== b) return say("The two passwords don't match.", true);
      btn.disabled = true; btn.textContent = "Saving...";
      try { await fn("set_password", { user_id: me.user_id, password: a }); f.reset(); say("Your password is changed. Use it next time you sign in."); }
      catch (err) { fnFailed(err); } finally { btn.disabled = false; btn.textContent = "Change my password"; }
    });
  }

  /* ---------- Today: tide strip + any day ---------- */
  let stripStart = addDays(today(), -3), selDay = today(), loadedFrom = addDays(today(), -90);
  const ACTIVE = ["pending", "confirmed", "arrived"];
  const covers = (b, d) => d >= b.visit_date && d <= addDays(b.visit_date, Math.max(1, b.nights || 1) - 1);
  const dayName = d => { const t = today(); return d === t ? "Today" : d === addDays(t, 1) ? "Tomorrow" : d === addDays(t, -1) ? "Yesterday" : ""; };
  const longDay = d => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  async function ensureRange(from) {
    if (from >= loadedFrom) return;
    try {
      const more = await db(`bookings?select=id,ref,created_at,service,visit_date,nights,group_size,name,phone,email,notes,status,updated_at,handled_by&visit_date=gte.${addDays(from, -30)}&visit_date=lt.${loadedFrom}&order=visit_date.asc`);
      const cd = await db(`closed_days?select=day,note&day=gte.${addDays(from, -30)}&day=lt.${loadedFrom}`);
      const ids = new Set(bookings.map(b => b.id));
      bookings = more.filter(b => !ids.has(b.id)).concat(bookings);
      closedAll = cd.concat(closedAll.filter(c => !cd.some(x => x.day === c.day)));
      loadedFrom = addDays(from, -30);
    } catch (err) { if (err.status === 401) signedOut("Please sign in again."); }
  }

  function renderToday() {
    const t = today();
    const pend = bookings.filter(b => b.status === "pending").length, newRev = reviews.filter(r => !r.approved).length;
    const wl = $("#waiting-line"); wl.replaceChildren();
    const link = (txt, sec) => { const b = el("button", null, txt); b.type = "button"; b.onclick = () => go(sec); return b; };
    if (!pend && !newRev) wl.textContent = "Nothing is waiting for you. New bookings and reviews will show up here.";
    else {
      wl.append(document.createTextNode(""));
      const parts = [];
      if (pend) parts.push(link(`${pend} booking request${pend > 1 ? "s" : ""}`, "bookings"));
      if (newRev) parts.push(link(`${newRev} review${newRev > 1 ? "s" : ""}`, "reviews"));
      parts.forEach((p, i) => { if (i) wl.append(document.createTextNode(" and ")); wl.append(p); });
      wl.append(document.createTextNode(pend + newRev > 1 ? " are waiting for you." : " is waiting for you."));
    }
    $("#today-title").textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

    // strip
    const days = Array.from({ length: 14 }, (_, i) => addDays(stripStart, i));
    const guests = d => bookings.filter(b => ACTIVE.includes(b.status) && covers(b, d)).reduce((s, b) => s + b.group_size, 0);
    const counts = days.map(guests), top = Math.max(10, ...counts);
    $("#tide-range").textContent = `${niceDay(days[0]).replace(/ \d{4}$/, "")} to ${niceDay(days[13])}`;
    $("#tide-date").value = selDay;
    $("#strip").replaceChildren(...days.map((d, i) => {
      const b = el("button", "day"); b.type = "button";
      const closed = closedAll.find(c => c.day === d), waiting = bookings.some(x => x.status === "pending" && covers(x, d));
      if (closed) b.classList.add("closed"); if (d === t) b.classList.add("today"); if (d < t) b.classList.add("past");
      b.setAttribute("aria-pressed", d === selDay);
      const dt = new Date(d + "T12:00:00");
      b.setAttribute("aria-label", `${longDay(d)}: ${counts[i]} guests` + (waiting ? ", request waiting" : "") + (closed ? ", closed" : ""));
      const water = el("span", "water"); water.style.height = Math.round(counts[i] / top * 100) + "%";
      b.append(water, el("span", "wd", d === t ? "Today" : dt.toLocaleDateString("en-GB", { weekday: "short" })), el("span", "dn", String(dt.getDate())));
      if (counts[i]) b.append(el("span", "ppl", String(counts[i])));
      if (waiting) b.append(el("span", "dot"));
      b.onclick = () => { selDay = d; renderToday(); };
      return b;
    }));
    renderDay();
  }

  async function renderDay() {
    const d = selDay, label = dayName(d);
    $("#day-title").textContent = d === today() ? "Today's guests" : label ? `${label}, ${longDay(d).replace(/ \d{4}$/, "")}` : longDay(d);
    const list = bookings.filter(b => covers(b, d)).sort((a, b) => ACTIVE.indexOf(b.status) === -1 ? -1 : 0);
    const active = list.filter(b => ACTIVE.includes(b.status));
    const ppl = active.reduce((s, b) => s + b.group_size, 0), pend = active.filter(b => b.status === "pending").length;
    const past = d < today();
    $("#day-sub").textContent = !active.length ? (past ? "No guests this day." : "No bookings yet for this day.")
      : `${ppl} guest${ppl === 1 ? "" : "s"} ${past ? "booked" : "expected"} across ${active.length} booking${active.length === 1 ? "" : "s"}` + (pend ? `. ${pend} still need${pend === 1 ? "s" : ""} a reply.` : ".");
    const closed = closedAll.find(c => c.day === d);
    $("#day-closed").hidden = !closed; if (closed) $("#day-closed").textContent = "Closed" + (closed.note ? ": " + closed.note : "");
    const rows = $("#day-rows");
    rows.replaceChildren(...(list.length ? list.map(b => dayRow(b, d)) : [el("p", "empty", past ? "Nothing was booked for this day." : "When a guest books this day, it shows up here.")]));
    // owner: what happened that day
    const box = $("#day-log");
    box.hidden = !isOwner(); $("#dayview").classList.toggle("with-log", isOwner());
    if (!isOwner()) return;
    const ul = $("#day-entries"); ul.replaceChildren(el("li", "empty", "Loading..."));
    try {
      const from = new Date(d + "T00:00:00").toISOString(), to = new Date(addDays(d, 1) + "T00:00:00").toISOString();
      const rowsLog = await db(`activity_log?select=*&at=gte.${encodeURIComponent(from)}&at=lt.${encodeURIComponent(to)}&order=at.desc&limit=200`);
      if (selDay !== d) return;
      ul.replaceChildren(...(rowsLog.length ? rowsLog.map(entry) : [el("li", "empty", "No changes were made this day.")]));
    } catch (err) { ul.replaceChildren(el("li", "empty", "Couldn't load the history for this day.")); }
  }

  function dayRow(b, d) {
    const r = el("div", "brow s-" + b.status);
    const p = el("div", "ppl", String(b.group_size)); p.append(el("small", null, b.group_size === 1 ? "guest" : "guests"));
    const mid = el("div"); const nm = el("div", "nm", b.name);
    const stay = b.nights ? `, night ${Math.round((new Date(d) - new Date(b.visit_date)) / 864e5) + 1} of ${b.nights}` : "";
    mid.append(nm, el("div", "sv", `${b.service}${stay}. ${STATUS[b.status]}, ${b.ref}`));
    const act = el("div", "act");
    const wa = waLink(b);
    if (wa) { const a = el("a", "bchip wa", "WhatsApp"); a.href = wa; a.target = "_blank"; a.rel = "noopener"; act.append(a); }
    const btn = (label, status, msg) => { const x = el("button", "btn small", label); x.onclick = () => setBookingStatus(b, status, msg, x); act.append(x); };
    if (b.status === "pending") btn("Confirm", "confirmed", `${b.ref} confirmed. Let ${b.name} know.`);
    if (b.status === "confirmed" && d === b.visit_date && d <= today()) btn("Check in", "arrived", `${b.name} checked in.`);
    r.append(p, mid, act);
    return r;
  }
  function setBookingStatus(b, status, msg, btn) {
    btn.disabled = true;
    change(`bookings?id=eq.${b.id}&select=id,status,handled_by,updated_at`, "PATCH", { status })
      .then(([row]) => { Object.assign(b, row); say(msg); render(); }).catch(err => { btn.disabled = false; failed(err); });
  }

  $("#tide-prev").onclick = async () => { stripStart = addDays(stripStart, -14); await ensureRange(stripStart); renderToday(); };
  $("#tide-next").onclick = () => { stripStart = addDays(stripStart, 14); renderToday(); };
  $("#tide-today").onclick = () => { stripStart = addDays(today(), -3); selDay = today(); renderToday(); };
  $("#tide-date").addEventListener("change", async e => {
    const d = e.target.value; if (!d) return;
    selDay = d; stripStart = addDays(d, -3); await ensureRange(stripStart); renderToday();
  });

  /* ---------- History (owner) ---------- */
  let hRows = [], hDone = false;
  const TYPE = { booking: "Booking", review: "Review", closed_day: "Closed day", content: "Site content", team: "Team" };
  const timeOf = s => new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  function entry(x) {
    const li = el("li", "entry");
    const tm = el("time", null, timeOf(x.at)); tm.dateTime = x.at;
    const what = el("div", "what"); what.append(el("span", "tag t-" + x.target_type, TYPE[x.target_type] || x.target_type), document.createTextNode(x.summary));
    const by = el("div", "by"); by.append(document.createTextNode("By "), el("b", null, x.actor), document.createTextNode(x.actor_role ? ` (${x.actor_role})` : ""));
    li.append(tm, what, by);
    return li;
  }
  async function loadHistory(more) {
    const day = $("#h-day").value, who = $("#h-who").value, type = $("#h-type").value;
    let q = "activity_log?select=*&order=at.desc&limit=60";
    if (day) q += `&at=gte.${encodeURIComponent(new Date(day + "T00:00:00").toISOString())}&at=lt.${encodeURIComponent(new Date(addDays(day, 1) + "T00:00:00").toISOString())}`;
    if (who) q += `&actor=eq.${encodeURIComponent(who)}`;
    if (type) q += `&target_type=eq.${type}`;
    if (more && hRows.length) q += `&id=lt.${hRows[hRows.length - 1].id}`;
    if (!more) { hRows = []; $("#h-list").replaceChildren(el("p", "empty", "Loading...")); }
    try {
      const rows = await db(q);
      hRows = hRows.concat(rows); hDone = rows.length < 60;
      renderHistory();
    } catch (err) {
      if (err.status === 401) return signedOut("Please sign in again.");
      $("#h-list").replaceChildren(el("p", "empty", "Couldn't load the history. If you haven't yet, run champagne-island-history.sql in Supabase."));
    }
  }
  function renderHistory() {
    const list = $("#h-list");
    $("#h-more").hidden = hDone || !hRows.length;
    if (!hRows.length) return list.replaceChildren(el("p", "empty", "Nothing matches. Try another day, person or type."));
    const groups = new Map();
    hRows.forEach(x => { const k = isoDay(new Date(x.at)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    list.replaceChildren(...[...groups].map(([k, xs]) => {
      const s = el("div", "tday"); const label = dayName(k);
      s.append(el("h3", null, label ? `${label}, ${longDay(k).replace(/ \d{4}$/, "")}` : longDay(k)));
      const ul = el("ul", "entries"); ul.append(...xs.map(entry)); s.append(ul);
      return s;
    }));
  }
  function fillWho() {
    const sel = $("#h-who"), cur = sel.value;
    const names = [...new Set(team.map(m => m.username).concat(["Guest", "Supabase dashboard"]))];
    sel.replaceChildren(new Option("Everyone", ""), ...names.map(n => new Option(n === "Guest" ? "Guests (website)" : n, n)));
    sel.value = cur;
  }
  ["#h-day", "#h-who", "#h-type"].forEach(s => $(s).addEventListener("change", () => loadHistory(false)));
  $("#h-clear").onclick = () => { $("#h-day").value = ""; $("#h-who").value = ""; $("#h-type").value = ""; loadHistory(false); };
  $("#h-more").onclick = () => loadHistory(true);

  /* ---------- New-item check every 30 seconds + marimba chime ---------- */
  let audio = null, soundOn = true, seenB = null, seenR = null, pollTimer = null;
  try { soundOn = localStorage.getItem("ci-sound") !== "off"; } catch (e) {}
  const unlock = () => { try { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch (e) {} };
  addEventListener("pointerdown", unlock, { passive: true }); addEventListener("keydown", unlock);
  function chime() {
    if (!soundOn) return; unlock(); if (!audio) return;
    const t0 = audio.currentTime + 0.02;
    [[784, 0], [1047, 0.16], [1319, 0.32]].forEach(([f, dt]) => {
      [[1, 0.32], [4, 0.06], [10, 0.015]].forEach(([mult, vol]) => {  // marimba-ish: soft fundamental + quick overtones
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = "sine"; o.frequency.value = f * mult;
        g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(vol, t0 + dt + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + (mult === 1 ? 0.9 : 0.18));
        o.connect(g).connect(audio.destination); o.start(t0 + dt); o.stop(t0 + dt + 1);
      });
    });
  }
  function paintSound() { const b = $("#sound"); b.setAttribute("aria-pressed", soundOn); b.querySelector("span").textContent = soundOn ? "Sound on" : "Sound off"; }
  $("#sound").onclick = () => { soundOn = !soundOn; try { localStorage.setItem("ci-sound", soundOn ? "on" : "off"); } catch (e) {} paintSound(); if (soundOn) { unlock(); chime(); } };
  paintSound();
  function rememberSeen() { seenB = new Set(bookings.filter(b => b.status === "pending").map(b => b.id)); seenR = new Set(reviews.filter(r => !r.approved).map(r => r.id)); }
  async function poll() {
    if (!session || seenB === null) return;
    try {
      const [b, r] = await Promise.all([
        db("bookings?select=id,name,service,visit_date&status=eq.pending&order=created_at.desc&limit=30"),
        db("reviews?select=id,first_name,rating&approved=is.false&order=created_at.desc&limit=30")]);
      const nb = b.filter(x => !seenB.has(x.id)), nr = r.filter(x => !seenR.has(x.id));
      if (!nb.length && !nr.length) return;
      chime();
      const msg = nb.length ? `New booking request from ${nb[0].name}: ${nb[0].service}, ${niceDay(nb[0].visit_date).replace(/ \d{4}$/, "")}` + (nb.length > 1 ? ` (and ${nb.length - 1} more)` : "")
        : `New ${nr[0].rating}-star review from ${nr[0].first_name}` + (nr.length > 1 ? ` (and ${nr.length - 1} more)` : "");
      note.textContent = msg; note.className = "toast new"; note.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => note.hidden = true, 8000);
      await loadAll();
    } catch (err) { if (err.status === 401) signedOut("Please sign in again."); }
  }
  function startPolling() { clearInterval(pollTimer); pollTimer = setInterval(poll, 30000); }

  /* ---------- phone menu ---------- */
  const drawer = open => { $("#side-nav").classList.toggle("open", open); $("#scrim").hidden = !open; $("#menu-btn").setAttribute("aria-expanded", open); };
  $("#menu-btn").onclick = () => drawer(true);
  $("#scrim").onclick = () => drawer(false);
  addEventListener("keydown", e => { if (e.key === "Escape") drawer(false); });

  /* ---------- start ---------- */
  async function start() {
    try {
      const rows = await db("admins?select=user_id,username,full_name,role,active");
      if (!rows.length) return signedOut("This account doesn't have access to the owner page.");
      if (rows[0].active === false) return signedOut("This login has been switched off. Ask the owner.");
      me = rows[0];
      $("#me").textContent = me.full_name || me.username;
      $("#me-role").textContent = isOwner() ? "Owner" : "Staff";
      $$("[data-owner]").forEach(x => x.hidden = !isOwner());
      show(true); go(section); await loadAll(); startPolling();
    } catch (err) {
      signedOut(err.status === 401 ? "" : "Could not reach the database. Check your internet and try again.");
    }
  }

  if (!KEY || KEY.startsWith("PASTE_")) { show(false); loginError("Setup needed: add the publishable key to supabase-config.js."); return; }
  session = restore();
  if (session) start(); else show(false);
})();
