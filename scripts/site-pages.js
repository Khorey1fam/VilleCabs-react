// After the build: make a copy of index.html for each VILLE-family domain with
// its own title, description, icons and link-preview tags. WhatsApp, Facebook
// and Google read these without running the app. middleware.js serves the
// right copy for each domain; index.html (VilleCabs) is left exactly as built.
const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', 'build');
const SITES = {
  dash: {
    title: 'VilleDash · Your City. Delivered.',
    name: 'VilleDash',
    description: 'Your City. Delivered. Send packages and order from local stores in Mandeville, Jamaica.',
    url: 'https://villedash.com',
    image: 'https://villedash.com/dash-og.jpg',
    card: 'summary_large_image',
    manifest: '/manifest-dash.json',
    icon: '/dash-favicon-64.png',
    touch: '/dash-apple-touch-icon.png',
  },
  ville: {
    title: 'VILLE · Your City. One App.',
    name: 'VILLE',
    description: 'Rides, deliveries and events in Mandeville, Jamaica, in one app.',
    url: 'https://villeapp.org',
    image: 'https://villeapp.org/ville-icon-512.png',
    card: 'summary',
    manifest: '/manifest-ville.json',
    icon: '/ville-favicon-64.png',
    touch: '/ville-apple-touch-icon.png',
  },
  driver: {
    title: 'VilleCabs Driver',
    name: 'VilleCabs Driver',
    description: 'Drive with VilleCabs in Mandeville and Manchester. Keep 85% of every fare.',
    url: 'https://driver.villecabs.com',
    image: 'https://driver.villecabs.com/driver-icon-512.png',
    card: 'summary',
    manifest: '/manifest-driver.json',
    icon: '/driver-icon-192.png',
    touch: '/driver-icon-512.png',
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function swap(html, re, value, label) {
  if (!re.test(html)) throw new Error(`site-pages: couldn't find ${label} in index.html`);
  return html.replace(re, value);
}

function pageFor(html, s) {
  let h = html;
  h = swap(h, /<title>[^<]*<\/title>/, `<title>${esc(s.title)}</title>`, 'title');
  h = swap(h, /<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(s.description)}"/>`, 'description');
  h = swap(h, /<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${esc(s.title)}"/>`, 'og:title');
  h = swap(h, /<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${esc(s.description)}"/>`, 'og:description');
  h = swap(h, /<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${esc(s.image)}"/>`, 'og:image');
  h = swap(h, /<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${esc(s.url)}"/>`, 'og:url');
  h = swap(h, /<meta name="twitter:card" content="[^"]*"\s*\/?>/, `<meta name="twitter:card" content="${s.card}"/>`, 'twitter:card');
  h = swap(h, /<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${esc(s.title)}"/>`, 'twitter:title');
  h = swap(h, /<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${esc(s.description)}"/>`, 'twitter:description');
  h = swap(h, /<meta name="twitter:image" content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${esc(s.image)}"/>`, 'twitter:image');
  h = swap(h, /<meta name="apple-mobile-web-app-title" content="[^"]*"\s*\/?>/, `<meta name="apple-mobile-web-app-title" content="${esc(s.name)}"/>`, 'apple title');
  h = swap(h, /<meta name="application-name" content="[^"]*"\s*\/?>/, `<meta name="application-name" content="${esc(s.name)}"/>`, 'application-name');
  h = swap(h, /<link rel="manifest" href="[^"]*"\s*\/?>/, `<link rel="manifest" href="${s.manifest}"/>`, 'manifest');
  h = swap(h, /<link rel="icon" href="[^"]*"\s*\/?>/, `<link rel="icon" href="${s.icon}"/>`, 'icon');
  h = swap(h, /<link rel="shortcut icon" href="[^"]*"\s*\/?>/, `<link rel="shortcut icon" href="${s.icon}"/>`, 'shortcut icon');
  h = h.replace(/<link rel="apple-touch-icon"( sizes="\d+x\d+")? href="[^"]*"\s*\/?>/g, (m, sz) => `<link rel="apple-touch-icon"${sz || ''} href="${s.touch}"/>`);
  return h;
}

const index = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
Object.entries(SITES).forEach(([key, s]) => {
  fs.writeFileSync(path.join(BUILD, `${key}.html`), pageFor(index, s));
  console.log(`site-pages: wrote build/${key}.html`);
});
