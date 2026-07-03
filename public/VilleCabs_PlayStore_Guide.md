# VilleCabs — Google Play Store Submission Guide (PWA/TWA)

## What You're Submitting
A **Trusted Web Activity (TWA)** — this wraps villecabs.com as a native Android app.
Every time you push to GitHub, the Play Store app updates automatically. No resubmission needed.

---

## STEP 1 — Add manifest.json to your web app

Copy this file to `C:\Users\Comfort Basic\Desktop\villecabs-web\public\manifest.json`:

```json
{
  "name": "VilleCabs",
  "short_name": "VilleCabs",
  "description": "Book rides in Mandeville, Manchester, Jamaica",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#1a1a2e",
  "theme_color": "#e8b400",
  "icons": [
    { "src": "/villecabs-logo.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/villecabs-logo.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "categories": ["travel", "navigation"],
  "lang": "en-JM",
  "scope": "/",
  "id": "/"
}
```

Then add this line to `public/index.html` inside the `<head>` tag:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#e8b400" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="VilleCabs" />
```

Push to GitHub:
```bash
cd "C:\Users\Comfort Basic\Desktop\villecabs-web"
git add public/manifest.json public/index.html
git commit -m "Add PWA manifest for Play Store"
git push
```

---

## STEP 2 — Install Android Studio + Bubblewrap

Bubblewrap is Google's official tool to convert a PWA into an Android app.

1. Install **Node.js** from nodejs.org (if not already installed)
2. Open Command Prompt and run:
```bash
npm install -g @bubblewrap/cli
```

3. Install **Android Studio** from developer.android.com/studio
   - During setup, install the Android SDK
   - Note the SDK path (usually `C:\Users\YourName\AppData\Local\Android\Sdk`)

---

## STEP 3 — Generate the Android App with Bubblewrap

Open Command Prompt in a new folder (e.g. `C:\Users\Comfort Basic\Desktop\villecabs-twa`):

```bash
mkdir villecabs-twa
cd villecabs-twa
bubblewrap init --manifest https://www.villecabs.com/manifest.json
```

When prompted, enter:
- **Package ID:** `com.villecabs.app`
- **App name:** `VilleCabs`
- **Launch URL:** `https://www.villecabs.com`
- **Icon URL:** `https://www.villecabs.com/villecabs-logo.png`
- **Display mode:** `standalone`
- **Status bar color:** `#e8b400`
- **Nav bar color:** `#1a1a2e`
- **Keystore path:** press Enter for default
- **Keystore password:** choose a password and **SAVE IT SAFELY**
- **Key alias:** `villecabs`
- **Key password:** same password

Then build:
```bash
bubblewrap build
```

This generates `app-release-signed.apk` and `app-release-bundle.aab` in your folder.
**Use the `.aab` file for Play Store submission.**

---

## STEP 4 — Add assetlinks.json to your website

This is required for Play Store verification.

1. After running `bubblewrap build`, run:
```bash
bubblewrap fingerprint add
```
Copy the SHA-256 fingerprint it shows you.

2. Create file: `C:\Users\Comfort Basic\Desktop\villecabs-web\public\.well-known\assetlinks.json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.villecabs.app",
    "sha256_cert_fingerprints": ["PASTE_YOUR_SHA256_HERE"]
  }
}]
```

3. Push to GitHub:
```bash
git add public/.well-known/assetlinks.json
git commit -m "Add assetlinks for TWA verification"
git push
```

4. Verify it's live at: `https://www.villecabs.com/.well-known/assetlinks.json`

---

## STEP 5 — Create Play Store Listing

1. Go to **play.google.com/console** and sign in with your Google account
2. Pay the **one-time $25 developer registration fee**
3. Click **Create app**
4. Fill in:
   - **App name:** VilleCabs
   - **Default language:** English (Jamaica) or English
   - **App or game:** App
   - **Free or paid:** Free

---

## STEP 6 — Fill in Store Listing

### Short description (80 chars):
```
Book rides in Mandeville, Manchester, Jamaica — fast & reliable.
```

### Full description:
```
Welcome to VilleCabs — Your city. Your ride. Your way.

VilleCabs is a modern ride-hailing and taxi platform built for the people of Mandeville, Manchester, Jamaica. Created to bring convenience, reliability, and opportunity to our community, VilleCabs connects passengers with trusted local drivers through a simple and accessible transportation service.

We're bringing the ease and flexibility of app-based transportation to Mandeville while supporting local drivers and creating new earning opportunities within our parish.

Whether you need a quick ride across town, transportation to work, school, appointments, shopping, or getting home safely — VilleCabs is designed to make moving around easier.

WHY CHOOSE VILLECABS?
✔ Fast and reliable rides
✔ Local drivers who know Mandeville
✔ Safe and convenient transportation
✔ Flexible earning opportunities for drivers
✔ Built with the community in mind

OUR MISSION
To provide safe, dependable, and affordable transportation while empowering local drivers and improving how people move across Mandeville and Manchester.

OUR VISION
To become the leading ride-hailing service in Manchester and expand transportation access across Jamaica through innovation, trust, and community.

Ride local. Move smarter. Grow together with VilleCabs.

📍 Serving Mandeville & Manchester, Jamaica
🌐 villecabs.com
📞 Call / WhatsApp: 876-280-4292
```

### Category: **Travel & Local**

---

## STEP 7 — Screenshots Required

Google requires at least **2 phone screenshots** (1080x1920 or similar).

Take screenshots of these screens on your phone:
1. Home screen (Book a Ride circle button)
2. Map pin screen
3. Vehicle selection screen
4. Active ride / tracking screen
5. Driver dashboard (Go Online screen)

Upload them under **Store listing → Phone screenshots**

### Feature Graphic (required):
Size: **1024 x 500 px**
You can create one free at **canva.com** — use VilleCabs yellow (#e8b400) background with the logo and tagline "Your city. Your ride. Your way."

---

## STEP 8 — App Content & Privacy

### Privacy Policy URL:
You need a privacy policy page. Add this to your website at `/privacy`:
- villecabs.com/privacy

Or use a free generator at **app-privacy-policy.com** and host it.

### Content Rating:
- Take the content rating questionnaire
- Select: No violence, no adult content, transportation app
- You'll likely get rated **Everyone**

### Target audience: **18+** (since your terms require 18+)

---

## STEP 9 — Upload & Submit

1. Go to **Production → Releases → Create new release**
2. Upload your `app-release-bundle.aab` file
3. Add release notes:
```
VilleCabs Beta — Initial release for Mandeville, Manchester, Jamaica.
Book rides with local trusted drivers. Fast, reliable, and built for our community.
```
4. Click **Review release** → **Start rollout to Production**

---

## STEP 10 — Wait for Review

Google typically reviews new apps in **3–7 days**.
You'll get an email when approved or if they need changes.

---

## IMPORTANT — Keep your keystore safe!

The keystore file generated by Bubblewrap is stored at:
`C:\Users\Comfort Basic\.android\villecabs.keystore`

**Back this up to Google Drive or USB immediately.**
If you lose it you can NEVER update the app on Play Store.

---

## Quick Summary of Files Needed
| File | Location |
|------|----------|
| manifest.json | public/manifest.json |
| assetlinks.json | public/.well-known/assetlinks.json |
| App bundle (.aab) | Generated by Bubblewrap |
| Keystore (.keystore) | Keep safe — back up! |
| Screenshots | 5 phone screenshots |
| Feature graphic | 1024x500 PNG |
| Privacy policy | villecabs.com/privacy |

---

*VilleCabs — Mandeville, Manchester, Jamaica*
*Contact: daviskeneile@gmail.com | WhatsApp: 876-280-4292*
