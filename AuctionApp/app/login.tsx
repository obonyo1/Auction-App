import React, { useState } from 'react';
import { 
  View, 
  TextInput, 
  Button, 
  Alert, 
  StyleSheet, 
  Text, 
  TouchableOpacity 
} from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { router } from 'expo-router';
import { auth } from './firebase/firebaseConfig';
import { Stack } from 'expo-router';
import { getDoc, doc } from 'firebase/firestore';
import { db } from './firebase/firebaseConfig'; 
import { useAuth } from './context/authContext'; // Adjust path as needed



export default function LoginScreen() {
  const { setUsername: setGlobalUsername, setRole: setGlobalRole } = useAuth();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const validateInputs = (): boolean => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return false;
    }

    return true;
  };

  const handleLogin = async (): Promise<void> => {
  if (!validateInputs()) return;

  setLoading(true);
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Fetch user data (username and role)
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      throw new Error('User profile not found in Firestore');
    }

    const userData = userDoc.data();
    const username = userData.username || 'User';
    const role = userData.role || 'bidder';

    // Set globally
    setGlobalUsername(username);
    setGlobalRole(role);

    // Navigate directly based on role
    if (role === 'admin') {
      router.push('/adminPanel' as any);
    } else if (role === 'auctioneer') {
      router.push('/auctioneerHome' as any);
    } else {
      router.push('/bidderHome' as any);
    }

  } catch (error: any) {
    console.error('Login error:', error);
    let errorMessage = 'An error occurred during login';

    switch (error.code) {
      case 'auth/user-not-found':
        errorMessage = 'No account found with this email';
        break;
      case 'auth/wrong-password':
        errorMessage = 'Incorrect password';
        break;
      case 'auth/invalid-email':
        errorMessage = 'Invalid email address';
        break;
      case 'auth/user-disabled':
        errorMessage = 'This account has been disabled';
        break;
      case 'auth/too-many-requests':
        errorMessage = 'Too many failed attempts. Please try again later';
        break;
      default:
        errorMessage = error.message;
    }

    Alert.alert('Login Error', errorMessage);
  } finally {
    setLoading(false);
  }
};

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <Text style={styles.title}>Welcome Back</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />
        
        <Button 
          title={loading ? "Signing In..." : "Login"} 
          onPress={handleLogin}
          disabled={loading}
        />
        
        <TouchableOpacity 
          style={styles.signupLink}
          onPress={() => router.push('/signup')}
        >
          <Text style={styles.signupText}>
            Don't have an account? Sign up here
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.forgotPasswordLink}
          onPress={() => {
            // You can implement forgot password functionality here
            Alert.alert('Info', 'Forgot password functionality coming soon');
          }}
        >
          <Text style={styles.forgotPasswordText}>
            Forgot Password?
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    marginBottom: 15,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  signupLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  signupText: {
    color: '#007bff',
    fontSize: 16,
  },
  forgotPasswordLink: {
    marginTop: 10,
    alignItems: 'center',
  },
  forgotPasswordText: {
    color: '#666',
    fontSize: 14,
  },
});