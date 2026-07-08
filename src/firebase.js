import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 1. Go to https://console.firebase.google.com, create a free project.
// 2. Click the "</>" (web app) icon to register a web app, then copy the
//    firebaseConfig object it gives you and paste it in place of the one below.
const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID",
};

// 2b. Pick a hard-to-guess room name only the two of you know.
// This keeps strangers from stumbling onto your list even though the
// site itself is public. Change this to something unique before deploying.
export const ROOM_ID = "change-me-to-something-unique-abc123";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
