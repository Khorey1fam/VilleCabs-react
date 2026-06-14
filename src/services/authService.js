// VilleCabs — Firebase Auth service
// Replace firebaseConfig with your project credentials

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
         GoogleAuthProvider, signInWithPopup, sendEmailVerification, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export async function signUpWithEmail({ email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(cred.user);
  return cred.user;
}
export const loginWithEmail  = (e, p) => signInWithEmailAndPassword(auth, e, p).then(c => c.user);
export const loginWithGoogle = ()      => signInWithPopup(auth, googleProvider).then(r => r.user);
export const logout          = ()      => signOut(auth);
