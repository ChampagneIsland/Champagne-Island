/* Champagne Island booking requests. Sends the request to Supabase through
   create_booking(), which checks the date, closed days and details, and
   returns a reference like CI-7KQ2M. Nothing is paid online. */
(() => {
  const cfg = window.CI_SUPABASE || {};
  const $ = s => document.querySelector(s);
  const form = $("#book-form"), status = $("#b-status"), dateIn = $("#b-date"), dateMsg = $("#b-date-msg");
  if (!form) return;
  const headers = { apikey: cfg.key, Authorization: "Bearer " + cfg.key, "Content-Type": "application/json" };
  const NIGHTS = ["Overnight accommodation", "Upscale camping", "Retreats"];
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const nice = s => new Date(s + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  let closed = {};

  // Dates: today up to one year ahead
  const today = new Date(), max = new Date(); max.setFullYear(max.getFullYear() + 1);
  dateIn.min = iso(today); dateIn.max = iso(max);

  // Service from the link (book.html?service=day-trippers) and the nights field
  const svc = $("#b-service");
  const want = new URLSearchParams(location.search).get("service");
  if (want) { const o = svc.querySelector(`option[data-slug="${CSS.escape(want)}"]`); if (o) o.selected = true; }
  const syncNights = () => { $("#nights-field").hidden = !NIGHTS.includes(svc.value); };
  svc.addEventListener("change", syncNights); syncNights();

  // Closed days
  function checkDate() {
    const d = dateIn.value;
    if (d && closed[d] !== undefined) {
      dateMsg.textContent = "Sorry, we're closed that day" + (closed[d] ? ` (${closed[d]})` : "") + ". Please pick another date.";
      dateMsg.className = "bad"; return false;
    }
    dateMsg.textContent = "The day you'd like to arrive."; dateMsg.className = ""; return true;
  }
  dateIn.addEventListener("change", checkDate);
  if (cfg.url && cfg.key && !cfg.key.startsWith("PASTE_")) {
    fetch(`${cfg.url}/rest/v1/closed_days?select=day,note&day=gte.${iso(today)}&order=day`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        rows.forEach(r => closed[r.day] = r.note || "");
        if (!rows.length) return;
        const ul = $("#closed-days ul");
        ul.replaceChildren(...rows.slice(0, 12).map(r => { const li = document.createElement("li"); li.textContent = nice(r.day) + (r.note ? " - " + r.note : ""); return li; }));
        $("#closed-days").hidden = false; checkDate();
      }).catch(() => {});
  }

  const say = msg => { status.textContent = msg; status.className = "gr-status err"; status.hidden = false; status.scrollIntoView({ block: "nearest", behavior: "smooth" }); };

  form.addEventListener("submit", async e => {
    e.preventDefault(); status.hidden = true;
    const d = new FormData(form);
    if (d.get("_gotcha")) return;
    const v = k => (d.get(k) || "").toString().trim();
    if (!svc.value) return say("Please choose what you'd like to book.");
    if (!v("date")) return say("Please choose a date.");
    if (v("date") < dateIn.min || v("date") > dateIn.max) return say("Please choose a date from today up to one year ahead.");
    if (!checkDate()) return say(dateMsg.textContent);
    const group = parseInt(v("group"), 10);
    if (!(group >= 1 && group <= 100)) return say("Please enter a group size between 1 and 100.");
    if (!v("name")) return say("Please enter your name.");
    if (v("phone").replace(/\D/g, "").length < 7) return say("Please enter a phone or WhatsApp number we can reach you on.");
    if (v("email") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("email"))) return say("Please check your email address, or leave it blank.");
    const nights = NIGHTS.includes(svc.value) ? parseInt(v("nights"), 10) || 1 : null;

    const btn = form.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Sending...";
    try {
      const res = await fetch(`${cfg.url}/rest/v1/rpc/create_booking`, {
        method: "POST", headers,
        body: JSON.stringify({ p_service: svc.value, p_date: v("date"), p_group: group, p_name: v("name"), p_phone: v("phone"),
                               p_email: v("email") || null, p_notes: v("notes") || null, p_nights: nights })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { say(data && data.code === "P0001" && data.message ? data.message : "Sorry, your request couldn't be sent right now. Please try again, or contact us directly."); return; }
      $("#b-ref").textContent = data;
      $("#b-summary").textContent = `${svc.value} on ${nice(v("date"))}` + (nights ? `, ${nights} night${nights > 1 ? "s" : ""}` : "") + `, ${group} ${group === 1 ? "person" : "people"}.`;
      $("#b-phone-out").textContent = v("phone");
      form.hidden = true; $("#book-done").hidden = false;
      $("#book-done").scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (err) {
      say("Sorry, your request couldn't be sent. Check your internet and try again.");
    } finally { btn.disabled = false; btn.textContent = "Send booking request"; }
  });
})();
