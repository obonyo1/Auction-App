import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Alert, 
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from './firebase/firebaseConfig'; // Adjust path as needed

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [emailSent, setEmailSent] = useState<boolean>(false);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handlePasswordReset = async (): Promise<void> => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    
    try {
      await sendPasswordResetEmail(auth, email);
      setEmailSent(true);
      Alert.alert(
        'Password Reset Email Sent',
        `We've sent a password reset link to ${email}. Please check your email and follow the instructions to reset your password.`,
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      );
    } catch (error: any) {
      console.error('Password reset error:', error);
      
      let errorMessage = 'An error occurred while sending the reset email';
      
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email address';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many requests. Please try again later';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your connection';
          break;
        default:
          errorMessage = error.message || errorMessage;
      }
      
      Alert.alert('Reset Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen 
        options={{ 
          headerShown: true,
          title: 'Reset Password',
          headerBackTitle: 'Back'
        }} 
      />
      <View style={styles.container}>
        <Text style={styles.title}>Forgot Password?</Text>
        <Text style={styles.subtitle}>
          Enter your email address and we'll send you a link to reset your password.
        </Text>
        
        <TextInput
          style={styles.input}
          placeholder="Enter your email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          editable={!loading && !emailSent}
        />
        
        <TouchableOpacity 
          style={[
            styles.resetButton, 
            loading && styles.buttonDisabled,
            emailSent && styles.buttonSuccess
          ]}
          onPress={handlePasswordReset}
          disabled={loading || emailSent}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.resetButtonText}>
              {emailSent ? 'Email Sent!' : 'Send Reset Link'}
            </Text>
          )}
        </TouchableOpacity>
        
        {emailSent && (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>
              ✅ Password reset email sent successfully!
            </Text>
            <Text style={styles.successSubtext}>
              Check your email and click the reset link to create a new password.
            </Text>
          </View>
        )}
        
        <TouchableOpacity 
          style={styles.backToLoginLink}
          onPress={() => router.back()}
        >
          <Text style={styles.backToLoginText}>
            Back to Login
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
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    marginBottom: 20,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  resetButton: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonSuccess: {
    backgroundColor: '#28a745',
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  successContainer: {
    backgroundColor: '#d4edda',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#c3e6cb',
  },
  successText: {
    color: '#155724',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  successSubtext: {
    color: '#155724',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  backToLoginLink: {
    alignItems: 'center',
  },
  backToLoginText: {
    color: '#007bff',
    fontSize: 16,
  },
});