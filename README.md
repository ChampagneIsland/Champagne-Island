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
- `admin.html`, `admin.js` owner page: sign in with a username, approve / hide / delete reviews
- `images/` resized photos; favicons and `apple-touch-icon.png`
- `brand/` logo files and the 18 original photos
- `supabase/` SQL to set up the database (run in Supabase > SQL Editor, in this order):
  1. `champagne-island-setup.sql` reviews table + keep-alive
  2. `champagne-island-owner-login.sql` owner accounts and approve/delete rules
- `.github/workflows/supabase-keep-alive.yml` pings Supabase daily so the free project
  doesn't pause. Needs repo secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## Owner accounts

Owners sign in with a username only. Each account is created in Supabase
(Authentication > Users > Add user) with the email `champagneisland1+USERNAME@gmail.com`
and "Auto Confirm User" ticked, then linked in the `admins` table
(see `champagne-island-owner-login.sql`). Public sign-up is turned off.

## Still to fill in

Search the HTML for `[` to find placeholders: phone/WhatsApp, pickup point,
real prices, durations and capacities on the service pages, and "to confirm" tags
on the Plan your visit page.
