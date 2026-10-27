// Firebase data layer for WorkoutCtrl. Public web config (not a secret).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAeKL6JrCIB6f188RZLWzFzbs-J3tCy8PY",
  authDomain: "workouts-347af.firebaseapp.com",
  projectId: "workouts-347af",
  storageBucket: "workouts-347af.firebasestorage.app",
  messagingSenderId: "39166195519",
  appId: "1:39166195519:web:16e1a81bc5d1a632f8c58a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export function onAuthChange(cb) { return onAuthStateChanged(auth, cb); }
export function signIn() { return signInWithPopup(auth, new GoogleAuthProvider()); }
export function signOut() { return fbSignOut(auth); }
export function currentUser() { return auth.currentUser; }
