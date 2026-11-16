# Pump Saathi (v1.0.0 core)

Petrol pump management PWA. Vanilla JS, offline-first, data localStorage mein.

## Chalane ke liye
1. Folder ko kisi static server par chalayein (HTTPS zaroori hai login ke crypto ke liye): `npx serve .` ya Netlify par deploy karein.
2. Pehli baar khulne par Super Admin setup karein (email + password, is device par save).
3. Settings mein nozzle aur tank add karein, phir Rates set karein.

## Files
- `index.html`, `styles.css`: shell aur design
- `features.js`: feature catalog (plan, built/roadmap status) aur AI avatar list
- `app.js`: sab screens (auth, shift, cash, udhaar, kharcha, tank, rates, reports, staff, skills, settings)
- `sw.js`, `manifest.json`: offline cache aur install
- `twa-manifest.json`, `.well-known/assetlinks.json`: Android APK (Bubblewrap/TWA) ke liye

## Abhi ki limitations (imandaari se)
- Data ek device ke localStorage mein hai. Multi-device sync ke liye Firebase Firestore agle step mein.
- Password hashing SHA-256 + salt hai. Production ke liye Firebase Auth hona chahiye.
- Pine Labs, payment gateway, WhatsApp support, party portal, churn list, AI voice assistant: roadmap mein hain, code mein nahi.
- Skill "Buy" abhi demo activation hai, real payment gateway ke baad.
- Support number placeholder hai: `features` mein aur `app.js` ke support screen mein replace karein.

## APK banana
1. `npx @bubblewrap/cli init --manifest https://app.digitalpetroleum.shop/manifest.json`
2. `npx @bubblewrap/cli build`
3. `assetlinks.json` ke sha256 fingerprint ko apne keystore se bharein.
