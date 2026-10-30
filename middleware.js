// Vercel Routing Middleware: serve each VILLE-family domain its own page header
// (title, icon, link preview) built by scripts/site-pages.js. The app itself is
// the same everywhere. villecabs.com and anything not listed here is untouched.
const PAGES = {
  'villedash.com': '/dash.html',
  'www.villedash.com': '/dash.html',
  'villeapp.org': '/ville.html',
  'www.villeapp.org': '/ville.html',
  'driver.villecabs.com': '/driver.html',
};
const PREVIEW = { dash: '/dash.html', ville: '/ville.html', driver: '/driver.html' };

export const config = {
  // Page requests only: skip files (anything with a dot), the event share
  // links (/e/…) and Vercel internals.
  matcher: ['/((?!e/|_vercel|.*\\.).*)'],
};

export default function middleware(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  let page = PAGES[host];
  // Previews: ?site=dash etc. lets us check each header before going live.
  if (!page && host.endsWith('.vercel.app')) page = PREVIEW[url.searchParams.get('site')];
  if (!page) return new Response(null, { headers: { 'x-middleware-next': '1' } });
  return new Response(null, { headers: { 'x-middleware-rewrite': new URL(page, url.origin).toString() } });
}
