// VilleCabs — Firestore + Storage service
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc,
         query, where, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const db = getFirestore();
const storage = getStorage();

// Customers
export const createCustomerProfile = (uid, data) =>
  setDoc(doc(db, 'customers', uid), { ...data, role: 'customer', createdAt: serverTimestamp() });

// Drivers
export const createDriverApplication = (uid, data) =>
  setDoc(doc(db, 'drivers', uid), { ...data, status: 'pending', role: 'driver', createdAt: serverTimestamp() });

export async function uploadDriverDocument(uid, type, file) {
  const storageRef = ref(storage, `drivers/${uid}/${type}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  await updateDoc(doc(db, 'drivers', uid), { [`docs.${type}`]: url });
  return url;
}

export const getPendingDrivers = async () => {
  const snap = await getDocs(query(collection(db, 'drivers'), where('status', '==', 'pending')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const approveDriver = uid =>
  updateDoc(doc(db, 'drivers', uid), { status: 'approved', approvedAt: serverTimestamp() });

export const rejectDriver = (uid, reason = '') =>
  updateDoc(doc(db, 'drivers', uid), { status: 'rejected', rejectionReason: reason, rejectedAt: serverTimestamp() });

// Bookings
export async function createBooking(booking) {
  const ref2 = doc(collection(db, 'bookings'));
  await setDoc(ref2, { ...booking, status: 'searching', createdAt: serverTimestamp() });
  return ref2.id;
}

export const subscribeToBooking = (id, cb) =>
  onSnapshot(doc(db, 'bookings', id), snap => cb({ id: snap.id, ...snap.data() }));

export const subscribeToAvailableBookings = cb =>
  onSnapshot(query(collection(db, 'bookings'), where('status', '==', 'searching'), orderBy('createdAt', 'desc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

export const acceptBooking = (bookingId, driverId) =>
  updateDoc(doc(db, 'bookings', bookingId), { driverId, status: 'active', acceptedAt: serverTimestamp() });

export const completeBooking = bookingId =>
  updateDoc(doc(db, 'bookings', bookingId), { status: 'completed', completedAt: serverTimestamp() });
