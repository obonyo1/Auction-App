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
import { Picker } from '@react-native-picker/picker';
import { 
  createUserWithEmailAndPassword, 
  updateProfile, 
  sendEmailVerification,
  signOut
} from 'firebase/auth';
import { router } from 'expo-router';
import { auth } from './firebase/firebaseConfig';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/firebaseConfig';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function SignupScreen() {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [role, setRole] = useState<string>('bidder');
  const [loading, setLoading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  const validatePassword = (password: string): { isValid: boolean; message?: string } => {
    if (password.length < 8) {
      return { isValid: false, message: 'Password must be at least 8 characters long' };
    }

    if (!/\d/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one number' };
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one special character' };
    }

    if (!/[a-zA-Z]/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one letter' };
    }

    return { isValid: true };
  };

  const validateInputs = (): boolean => {
    if (!email || !password || !confirmPassword || !displayName || !role) {
      Alert.alert('Error', 'Please fill in all fields');
      return false;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return false;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      Alert.alert('Invalid Password', passwordValidation.message);
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return false;
    }

    if (displayName.trim().length < 2) {
      Alert.alert('Error', 'Username must be at least 2 characters long');
      return false;
    }

    return true;
  };

  const handleSignup = async (): Promise<void> => {
    if (!validateInputs()) return;

    setLoading(true);
    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Update the user's display name in Auth
      await updateProfile(user, {
        displayName: displayName
      });

      // Create Firestore user document with verified status
      await setDoc(doc(db, 'users', user.uid), {
        username: displayName,
        email: email,
        role: role,
        emailVerified: false, // Track verification status
        createdAt: serverTimestamp()
      });

      // Send email verification
      await sendEmailVerification(user);

      // Sign out the user until they verify their email
      await signOut(auth);

      Alert.alert(
        'Account Created Successfully!',
        `We've sent a verification email to ${email}. Please check your email and click the verification link before logging in.`,
        [
          {
            text: 'Go to Login',
            onPress: () => router.push('/login')
          }
        ]
      );

    } catch (error: any) {
      console.error('Signup error:', error);
      let errorMessage = 'An error occurred during signup';
      
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'This email is already registered';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password is too weak';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your connection';
          break;
        default:
          errorMessage = error.message;
      }
      
      Alert.alert('Signup Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrengthColor = (): string => {
    if (password.length === 0) return '#ddd';
    const validation = validatePassword(password);
    if (validation.isValid) return '#4CAF50'; // Green
    if (password.length >= 8) return '#FF9800'; // Orange
    return '#F44336'; // Red
  };

  const getPasswordStrengthText = (): string => {
    if (password.length === 0) return '';
    const validation = validatePassword(password);
    if (validation.isValid) return '✓ Strong password';
    return validation.message || '';
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <Text style={styles.title}>Create Account</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
        />
        
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="password-new"
          />
          <TouchableOpacity 
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons 
              name={showPassword ? 'eye-off' : 'eye'} 
              size={24} 
              color="#666" 
            />
          </TouchableOpacity>
        </View>

        {password.length > 0 && (
          <Text style={[styles.passwordStrength, { color: getPasswordStrengthColor() }]}>
            {getPasswordStrengthText()}
          </Text>
        )}

        <Text style={styles.passwordRequirements}>
          Password must contain: • At least 8 characters • Numbers • Special characters • Letters
        </Text>
        
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
            autoComplete="password-new"
          />
          <TouchableOpacity 
            style={styles.eyeButton}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            <Ionicons 
              name={showConfirmPassword ? 'eye-off' : 'eye'} 
              size={24} 
              color="#666" 
            />
          </TouchableOpacity>
        </View>

        {confirmPassword.length > 0 && password !== confirmPassword && (
          <Text style={styles.passwordMismatch}>
            Passwords do not match
          </Text>
        )}
        
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerLabel}>Select your role:</Text>
          <Picker
            selectedValue={role}
            style={styles.picker}
            onValueChange={(itemValue: string) => setRole(itemValue)}
          >
            <Picker.Item label="Bidder" value="bidder" />
            <Picker.Item label="Auctioneer" value="auctioneer" />
          </Picker>
        </View>
        
        <Button 
          title={loading ? "Creating Account..." : "Sign Up"} 
          onPress={handleSignup}
          disabled={loading}
        />
        
        <TouchableOpacity 
          style={styles.loginLink}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.loginText}>
            Already have an account? Login here
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
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    marginBottom: 5,
  },
  passwordInput: {
    flex: 1,
    padding: 15,
    fontSize: 16,
  },
  eyeButton: {
    padding: 15,
  },
  passwordStrength: {
    fontSize: 12,
    marginBottom: 5,
    marginLeft: 5,
    fontWeight: '500',
  },
  passwordRequirements: {
    fontSize: 11,
    color: '#666',
    marginBottom: 10,
    marginLeft: 5,
    lineHeight: 16,
  },
  passwordMismatch: {
    fontSize: 12,
    color: '#F44336',
    marginBottom: 10,
    marginLeft: 5,
  },
  loginLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  loginText: {
    color: '#007bff',
    fontSize: 16,
  },
  pickerContainer: {
    marginBottom: 15,
  },
  pickerLabel: {
    fontSize: 16,
    marginBottom: 5,
    color: '#333',
    fontWeight: '500',
  },
  picker: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
});