import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import appletConfig from "../../firebase-applet-config.json";

const firebaseConfig = {
  apiKey: appletConfig?.apiKey || "AIzaSyBMS-USITSEhOvtrOCCpGpMx-sijLn0_4g",
  authDomain: appletConfig?.authDomain || "blindspark-4ae0a.firebaseapp.com",
  projectId: appletConfig?.projectId || "blindspark-4ae0a",
  storageBucket: appletConfig?.storageBucket || "blindspark-4ae0a.firebasestorage.app",
  messagingSenderId: appletConfig?.messagingSenderId || "430634364013",
  appId: appletConfig?.appId || "1:430634364013:web:4be1236fb190a931c890ef"
};

const app = initializeApp(firebaseConfig);

const db = appletConfig?.firestoreDatabaseId &&
  appletConfig.firestoreDatabaseId !== "ai-studio-c019015c-94c4-4689-8e19-3268b8fa95aa" &&
  appletConfig.firestoreDatabaseId !== "(default)"
    ? getFirestore(app, appletConfig.firestoreDatabaseId)
    : getFirestore(app);

const auth = getAuth(app);
const storage = getStorage(app);

export { app, db, auth, storage };
