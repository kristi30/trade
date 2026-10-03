# blindSpark — iPhone-ready Capacitor prototype

blindSpark is a React + TypeScript + Firebase dating-app prototype packaged for iOS/Android with Capacitor.

## What is ready now

- Capacitor configuration for iOS and Android.
- iPhone safe-area / Dynamic Island / home-indicator spacing.
- Native location support through `@capacitor/geolocation`.
- Editable city/area instead of the previous Los Angeles-only selector.
- 18+ onboarding gate.
- On-device iPhone test mode that works without Google OAuth or a deployed backend.
- Local profile, matches and chat persistence for test mode.
- Demo profiles are visibly labeled **Demo**.
- Demo/bot Sparks now match with a 25% probability (1 in 4) instead of matching every time.
- Chat uses a smarter context-aware AI endpoint when `GEMINI_API_KEY` is configured, with a more natural local fallback when it is not.
- Demo replies are scheduled for 60 seconds after the user message, with pending replies persisted locally.
- Photo sharing unlocks per person at 30 text messages (1 photo), 50 (2 total), and 80 (unlimited).
- Discovery supports swipe-left to Pass and swipe-right to Spark, while keeping the buttons.
- The quiz reveals and names the user's personality archetype immediately after the quiz, before profile prompts.
- Web/server build output is separated from the Capacitor web bundle.
- iOS setup script adds the required privacy strings for location/photo/camera access.

## Install it on your iPhone

### Requirements on your Mac

1. macOS.
2. Node.js 22 or newer.
3. Xcode and Xcode Command Line Tools.
4. Your iPhone connected to the Mac by cable for the first setup (wireless development can be enabled later).
5. An Apple Account signed into Xcode. A paid Apple Developer membership is **not required** just to test on your own iPhone.

### Fast setup

Open Terminal inside this project folder and run:

```bash
npm run ios:setup
```

That command will:

1. install npm dependencies;
2. build the React app;
3. create the Capacitor iOS project if it does not exist;
4. sync the web app and native plugins;
5. add iOS privacy permission descriptions;
6. open the project in Xcode.

### In Xcode

1. Click the **App** project in the left sidebar.
2. Select the **App** target.
3. Open **Signing & Capabilities**.
4. Enable **Automatically manage signing**.
5. Under **Team**, choose your Apple Account / Personal Team.
6. Connect and unlock your iPhone.
7. Choose your iPhone from the device selector at the top of Xcode.
8. Press the **Run ▶** button.
9. If your iPhone asks for Developer Mode, enable it and follow the restart instructions shown by iOS.

The app will be installed directly on your iPhone.

## Testing the iPhone build

On the first screen, tap:

**Try BlindSpark on this iPhone**

This is intentionally a local test mode. It lets you test the entire UI before native Google Sign-In and the production backend are configured.

You can test:

- onboarding and personality quiz;
- location permission;
- Discovery;
- Spark/matching flow;
- Matches;
- chats and local simulated replies;
- photo-unlock UI;
- profile editing;
- block/unmatch;
- stats;
- profile reset and logout.

Your test data stays on that iPhone using local storage.

## Normal development workflow

After changing React/TypeScript code:

```bash
npm run cap:ios
```

This rebuilds the web app, syncs it into the iOS project, reapplies iOS privacy settings and opens Xcode.

For a web-only build:

```bash
npm run build:web
```

For the Express/Gemini server:

```bash
npm run build:server
```

## AI chat backend

`server.ts` provides `/api/chat-reply` for local/full-server hosting, and `api/chat-reply.ts` provides the same endpoint as a Vercel serverless function. Both use `GEMINI_API_KEY`.

For a deployed mobile build, host that Express server on HTTPS and set:

```env
VITE_API_BASE_URL=https://your-api.example.com
```

Then rebuild and sync the app.

On the hosted PWA, an empty `VITE_API_BASE_URL` uses the same-origin `/api/chat-reply` endpoint automatically. A Capacitor-native build with no API URL uses the built-in conversational fallback, so chat still works.

## Google Sign-In

The web version still uses Firebase `signInWithPopup`. A WKWebView app should use a proper native OAuth integration before public release. The iPhone test build therefore uses local test mode instead of pretending web popup auth is production-ready.

Before App Store release, configure a Firebase iOS app, add its `GoogleService-Info.plist`, and connect a native Google/Firebase authentication plugin or native sign-in flow.

## Before a public App Store release

The current package is a strong test/MVP build, not the final production release. Before publishing, complete at least:

- native Google/Apple sign-in as appropriate;
- deployed HTTPS backend for AI chat;
- production Firestore security rules and server-side bot logic;
- account deletion flow;
- privacy policy and terms;
- abuse/reporting moderation workflow;
- final app icon, launch screen and App Store screenshots;
- testing on several iPhone sizes;
- App Store privacy disclosures.


---

# PWA / install without Xcode

This project is also configured as a Progressive Web App (PWA), so it can be installed from Safari on iPhone without Xcode.

## PWA features included

- Home Screen app icon and standalone/full-screen app window.
- iPhone safe-area support.
- Install helper shown inside the app with iPhone-specific instructions.
- Local test mode available in the browser and installed PWA — no Google account or backend is required to explore the app.
- Service worker caching of the app shell and same-origin static assets for basic offline reopening.
- Location continues to use the browser's native location permission on the PWA.
- Netlify and Vercel SPA deployment configuration included.

## Build the PWA

```bash
npm install
npm run pwa:build
```

The deployable site is created in `dist/`.

## Install on iPhone (no Xcode)

A PWA must be opened from an HTTPS website; an unzipped local folder cannot be installed directly by iOS.

1. Deploy the `dist/` folder to any HTTPS static host (for example Netlify, Vercel, Cloudflare Pages, Firebase Hosting, or your own HTTPS server).
2. Open the deployed address in **Safari** on the iPhone.
3. Tap Safari's **Share** button.
4. Choose **Add to Home Screen**.
5. Tap **Add**.
6. Launch **blindSpark** from the new Home Screen icon.

For a quick test, choose **Try blindSpark — no account needed**. Test profile, matches, and chats are stored locally on that device.

## After changing the code

```bash
npm run pwa:build
```

Upload the new `dist/` contents to the same host. The service worker uses network-first navigation and will refresh static assets as they are requested.
