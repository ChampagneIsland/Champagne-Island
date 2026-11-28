/* Supabase settings shared by reviews.js (homepage) and admin.js (owner page).
   The publishable key is meant to be public. NEVER put the sb_secret_ key here. */
window.CI_SUPABASE = {
  url: "https://nbhkzsugpsoibvkbbnuo.supabase.co",
  key: "sb_publishable_ZcV7RPh7XJthw6frk32TZQ_oWxEWQpR", // sb_publishable_...
  // Owners sign in with a username only. Behind the scenes Supabase needs an
  // email-shaped ID, so username "owner" becomes champagneisland1+owner@gmail.com
  // (Gmail delivers +anything to the owners' normal inbox).
  loginEmail: "champagneisland1@gmail.com"
};
