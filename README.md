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
