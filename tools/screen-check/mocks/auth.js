export const getAuth = () => ({});
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(window.__user || null), 0); return () => {}; };
const nope = async () => { throw Object.assign(new Error('mock'), { code: 'auth/invalid-credential' }); };
export const signInWithEmailAndPassword = nope;
export const createUserWithEmailAndPassword = nope;
export const sendPasswordResetEmail = async () => {};
export const signOut = async () => {};
