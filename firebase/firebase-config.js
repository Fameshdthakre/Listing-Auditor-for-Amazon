import { initializeApp } from './firebase-app.js';
import { getFirestore } from './firebase-firestore.js';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDR0EK0OULam0xsB9yVp_8qno8NV2ivF6Q",
  authDomain: "tfgcp-project-01.firebaseapp.com",
  projectId: "tfgcp-project-01",
  storageBucket: "tfgcp-project-01.firebasestorage.app",
  messagingSenderId: "789113929254",
  appId: "1:789113929254:web:d4ac06a817349e34aef0e7",
  measurementId: "G-ZEQNZ284W0"
};

/*
 * Microsoft Auth Handler
 * URL: https://tfgcp-project-01.firebaseapp.com/__/auth/handler
 *
 * Note: This URL is managed by Firebase. If you are configuring Microsoft Authentication
 * in the Azure Portal (Microsoft Entra ID), ensure this URL is added to the
 * "Redirect URIs" section for your application.
 */

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };
