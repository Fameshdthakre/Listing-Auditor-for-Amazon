# Linking Your Extension to Google Firebase

This guide explains how to set up a Google Firebase project and link it to your Chrome Extension. This will enable advanced features like **Cloud Sync** (saving your Catalogue across devices) and **User Authentication**.

## Step 1: Create a Firebase Project

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Click **"Add project"** (or "Create a project").
3.  Enter a project name (e.g., `listing-auditor-sync`).
4.  (Optional) Disable Google Analytics for this project to keep it simple.
5.  Click **"Create project"**.

## Step 2: Enable Firestore Database

1.  In the left sidebar of your new project dashboard, click on **Build** -> **Firestore Database**.
2.  Click **"Create database"**.
3.  **Location:** Choose a location close to your users (e.g., `nam5 (us-central)`).
4.  **Security Rules:** Select **"Start in test mode"** for now (we will secure this later).
5.  Click **"Enable"**.

## Step 3: Get Your Web App Config

1.  Click the **Project Overview** (gear icon) -> **Project settings**.
2.  Scroll down to the "Your apps" section.
3.  Click the **Web** icon (`</>`).
4.  **App nickname:** Enter a name (e.g., `Chrome Extension`).
5.  Click **"Register app"**.
6.  You will see a code block labeled `const firebaseConfig = { ... };`. **Copy the object inside the braces.** It looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "123456...",
  appId: "1:123456..."
};
```

## Step 4: Add Config to Your Extension

1.  Open the file `sidepanel.js` in your extension's source code.
2.  Search for the placeholder comment: `// --- CONFIG: Firebase ---` (or add it near the top).
3.  Paste your config object there.

**Example Code to Add:**

```javascript
// Import Firebase (ensure you have the SDK scripts in your sidepanel.html)
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  // PASTE YOUR CONFIG HERE
  apiKey: "AIzaSyD...",
  authDomain: "...",
  projectId: "...",
  // ...
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
```

*Note: To make this work, you will need to bundle the Firebase JS SDK or include it via CDN in your `sidepanel.html` manifest.*

## Step 5: Enable Authentication (Optional but Recommended)

To ensure users only see their own data:

1.  Go to **Build** -> **Authentication** in the Firebase Console.
2.  Click **"Get started"**.
3.  Select **"Google"** as a Sign-in method and enable it.
4.  Update your extension code to use `firebase.auth()` instead of `chrome.identity` for handling the login flow if you want strict Firebase linkage.

## Step 6: Update Security Rules

Once you are ready for production, go back to **Firestore Database** -> **Rules** and change them to allow only authenticated access:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

This ensures a user can only read/write their own catalogue data.
