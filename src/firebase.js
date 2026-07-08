import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 1. Go to https://console.firebase.google.com, create a free project.
// 2. Click the "</>" (web app) icon to register a web app, then copy the
//    firebaseConfig object it gives you and paste it in place of the one below.
const firebaseConfig = {
     apiKey: "AIzaSyBaiBGt9N649Wv2Uol_AfunSu4TPod-GLM",
     authDomain: "movie-night-380d1.firebaseapp.com",
     projectId: "movie-night-380d1",
     storageBucket: "movie-night-380d1.firebasestorage.app",
     messagingSenderId: "PASTE THE VALUE YOU SEE",
     appId: "PASTE THE VALUE YOU SEE",
   };
// 2b. Pick a hard-to-guess room name only the two of you know.
// This keeps strangers from stumbling onto your list even though the
// site itself is public. Change this to something unique before deploying.
export const ROOM_ID = "bubbles15";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
