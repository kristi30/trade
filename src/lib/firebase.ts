import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import appletConfig from "../../firebase-applet-config.json";

// Configure Firebase using the user's specific project details for Blind.Spark as fallback
const firebaseConfig = {
  apiKey: appletConfig?.apiKey || "AIzaSyBMS-USITSEhOvtrOCCpGpMx-sijLn0_4g",
  authDomain: appletConfig?.authDomain || "blindspark-4ae0a.firebaseapp.com",
  projectId: appletConfig?.projectId || "blindspark-4ae0a",
  storageBucket: appletConfig?.storageBucket || "blindspark-4ae0a.firebasestorage.app",
  messagingSenderId: appletConfig?.messagingSenderId || "430634364013",
  appId: appletConfig?.appId || "1:430634364013:web:4be1236fb190a931c890ef" // Construct Web App ID format with the project number
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore. If it is the default database "(default)", initialize normally
const db = appletConfig?.firestoreDatabaseId && appletConfig.firestoreDatabaseId !== "ai-studio-c019015c-94c4-4689-8e19-3268b8fa95aa" && appletConfig.firestoreDatabaseId !== "(default)"
  ? getFirestore(app, appletConfig.firestoreDatabaseId)
  : getFirestore(app);

const auth = getAuth(app);

// Firestore connectivity is checked by the screens that actually need it.
// Avoiding a startup test read keeps native/offline startup fast and quiet.

export { app, db, auth };
