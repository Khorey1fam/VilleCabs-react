export const getAuth = () => ({});
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(window.__user || null), 0); return () => {}; };
const nope = async () => { throw Object.assign(new Error('mock'), { code: 'auth/invalid-credential' }); };
export const signInWithEmailAndPassword = nope;
export const createUserWithEmailAndPassword = nope;
export const sendPasswordResetEmail = async () => {};
export const signOut = async () => {};

// Extra names App.js imports (unused by the screens under test).
export const signInWithPopup = async () => ({});
export class GoogleAuthProvider {}
export const sendEmailVerification = async () => {};
export const setPersistence = async () => {};
export const browserLocalPersistence = {};
export const updatePassword = async () => {};
export const updateEmail = async () => {};
export const reauthenticateWithCredential = async () => {};
export const EmailAuthProvider = { credential: () => ({}) };
