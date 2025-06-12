import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDeZi3b1JxunUBFb5njndMKtYlUFrPfIJM",
  authDomain: "auction-app-febf4.firebaseapp.com",
  databaseURL: "https://auction-app-febf4-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "auction-app-febf4",
  storageBucket: "auction-app-febf4.firebasestorage.app",
  messagingSenderId: "944815420430",
  appId: "1:944815420430:web:a48584c4b47fb51416f85f",
  measurementId: "G-TF4LD95KG9"
};

const app = initializeApp(firebaseConfig);

// Initialize auth with persistence for React Native
let auth;
try {
  const { initializeAuth, getReactNativePersistence } = require('firebase/auth');
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error) {
  // Fallback to basic auth if persistence setup fails
  auth = getAuth(app);
  console.warn('Using basic auth without persistence:', error.message);
}

// Initialize Firestore
const db = getFirestore(app);

export { auth, db };
export default auth;