# Champagne Island website

Website for Champagne Island, a small, locally owned, eco-friendly, off-the-grid island in Belize.
Live at https://webassignment2.me/champagneisland/

## Folders

- `champagneisland/` – the website. Upload this folder so the site is served at `/champagneisland/`.
  - `index.html` homepage, `plan-your-visit.html`, `sample-itineraries.html`
  - `offer/` the 12 service pages
  - `style.css`, `script.js` shared look and behaviour
  - `images/` resized photos used on the site
  - favicons and `apple-touch-icon.png`
- `brand/` – the logo (icon SVG/PNGs, full logo SVGs) and the 18 original photos.
- `supabase/` – reviews database setup (not active yet):
  - `keep-alive.sql` – run once in Supabase > SQL Editor.
  - `supabase-keep-alive.yml` – move to `.github/workflows/` only after the Supabase
    project and its reviews table exist, then add the repo secrets
    `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## Still to fill in

Search the HTML for `[` to find placeholders: phone/WhatsApp, email, pickup point,
real prices, durations and capacities on the service pages, and "to confirm" tags on
the Plan your visit page. The review form still points to `formspree.io/f/YOUR_FORM_ID`
until the Supabase reviews are wired up.
