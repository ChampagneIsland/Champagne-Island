# Champagne Island website

Website for Champagne Island, a small, locally owned, eco-friendly, off-the-grid island in Belize.
Live at https://champagneisland.github.io/Champagne-Island/
Owner page: https://champagneisland.github.io/Champagne-Island/admin.html

## Files

- `index.html` homepage, `plan-your-visit.html`, `sample-itineraries.html`
- `offer/` the 12 service pages
- `style.css`, `script.js` shared look and behaviour
- `supabase-config.js` Supabase project URL + publishable key (shared by the two files below)
- `reviews.js` loads approved reviews and sends new ones (homepage)
- `book.html`, `book.js` booking request page (guests get a reference like CI-7KQ2M; nothing paid online)
- `content.js` fills in text the owner edits (prices, details, phone, announcement) on every page
- `admin.html`, `admin.js` owner page: bookings, reviews, closed days, site content
- `images/` resized photos; favicons and `apple-touch-icon.png`
- `brand/` logo files and the 18 original photos
- `supabase/` SQL to set up the database (run in Supabase > SQL Editor, in this order):
  1. `champagne-island-setup.sql` reviews table + keep-alive
  2. `champagne-island-owner-login.sql` owner accounts and approve/delete rules
  3. `champagne-island-bookings.sql` bookings, closed days, site content, owner/staff roles
  4. `champagne-island-team.sql` team details, switched-off logins, team list
- `supabase/functions/team/index.ts` Edge Function named `team` (deploy in Supabase > Edge Functions,
  Verify JWT off). Lets owners create/edit/switch off/delete logins and change passwords.
- `.github/workflows/supabase-keep-alive.yml` pings Supabase daily so the free project
  doesn't pause. Needs repo secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## Team accounts

Owners manage logins on the owner page (Team tab): name, username, role, password,
switch off / on, delete. Everyone can change their own password under My account.
Behind the scenes a username like `maya` is the Supabase login `champagneisland1+maya@gmail.com`.
Roles: `owner` can do everything; `staff` can see/confirm/decline bookings, check guests in
and approve reviews. A switched-off login is blocked by Supabase and by the database rules.
There must always be at least one active owner.

## Still to fill in

Search the HTML for `[` to find placeholders: phone/WhatsApp, pickup point,
real prices, durations and capacities on the service pages, and "to confirm" tags
on the Plan your visit page.
