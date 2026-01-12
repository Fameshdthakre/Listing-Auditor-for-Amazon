// firebase-init.js
// Importing from your local lib folder
import { initializeApp } from './lib/firebase-app.js';
import { getFirestore } from './lib/firebase-firestore.js';
import { getAuth } from './lib/firebase-auth.js';

// TODO: Replace with your actual project config from Firebase Console
// Go to: Project Settings > General > Your apps > SDK setup and configuration > Config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Export them so popup.js can use them
export { db, auth };
