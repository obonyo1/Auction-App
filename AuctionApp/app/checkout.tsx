import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  FlatList, 
  Alert,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { 
  getDatabase, 
  ref, 
  onValue, 
  update
} from 'firebase/database';

interface WonAuction {
  id: string;
  title: string;
  description: string;
  category: string;
  finalBid: number;
  endTime: number;
  auctioneerId: string;
  auctioneerName: string;
  images?: string;
  paymentStatus: 'pending' | 'paid' | 'processing';
  hiddenFromHistory?: boolean;
}

interface CurrentUser {
  id: string;
  name: string;
}

interface PaymentModalData {
  visible: boolean;
  auctionId: string;
  amount: number;
  title: string;
}

// IMPORTANT: These credentials should be moved to a secure backend server
const MPESA_CONFIG = {
  consumerKey: 'esS27JygO5uNE9XdGy1nem1XyrhUeMo8KmvAtfGzrladrngP',
  consumerSecret: '3uY78bYqnE7BuxayL3gtVqz0gASYhfJe7J9o36TPKf04WCqfonTMdFv88s3c9ADN',
  businessShortCode: '174379',
  passkey: 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
  baseUrl: 'https://sandbox.safaricom.co.ke',
  callbackUrl: 'https://your-backend-url.herokuapp.com/mpesa/callback',
  environment: 'sandbox'
};

export default function Checkout() {
  const router = useRouter();
  const [wonAuctions, setWonAuctions] = useState<WonAuction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [paymentModal, setPaymentModal] = useState<PaymentModalData>({
    visible: false,
    auctionId: '',
    amount: 0,
    title: ''
  });
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [deletingAuctions, setDeletingAuctions] = useState<Set<string>>(new Set());

  // Firebase Auth listener
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser({
          id: user.uid,
          name: user.displayName || user.email || 'Anonymous User'
        });
      } else {
        setCurrentUser(null);
        router.replace('/login');
      }
    });
    
    return () => unsubscribe();
  }, []);

  // Generate M-Pesa access token
  const generateAccessToken = async (): Promise<string> => {
    try {
      const auth = btoa(`${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`);
      
      const response = await fetch(`${MPESA_CONFIG.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate access token');
      }

      const data = await response.json();
      return data.access_token;
    } catch (error) {
      console.error('Error generating access token:', error);
      throw new Error('Failed to authenticate with M-Pesa');
    }
  };

  // Generate password for STK Push
  const generatePassword = (): string => {
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const password = btoa(`${MPESA_CONFIG.businessShortCode}${MPESA_CONFIG.passkey}${timestamp}`);
    return password;
  };

  // Get timestamp in the required format
  const getTimestamp = (): string => {
    return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  };

  const fetchWonAuctions = async () => {
    try {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      const db = getDatabase();
      const auctionsRef = ref(db, 'auctions');

      // Set up real-time listener for all auctions
      const unsubscribe = onValue(
        auctionsRef,
        (snapshot) => {
          const loadedWonAuctions: WonAuction[] = [];
          
          if (snapshot.exists()) {
            const data = snapshot.val();
            const currentTime = Date.now();
            
            // Filter ended auctions where current user was the highest bidder
            Object.keys(data).forEach((key) => {
              const auction = data[key];
              
              // Skip if auction is hidden from history
              if (auction.hiddenFromHistory) {
                return;
              }
              
              // Check if auction has ended
              const hasEnded = auction.endTime <= currentTime || auction.status === 'completed';
              
              if (hasEnded && auction.bids) {
                const bidsData = auction.bids;
                const bidsList = Object.keys(bidsData).map(bidKey => ({
                  id: bidKey,
                  ...bidsData[bidKey]
                }));
                
                // Sort bids by amount (highest first) to find the winner
                bidsList.sort((a, b) => b.amount - a.amount);
                
                // Check if current user is the highest bidder
                if (bidsList.length > 0 && bidsList[0].bidderId === currentUser.id) {
                  loadedWonAuctions.push({
                    id: key,
                    title: auction.title || 'Unknown Product',
                    description: auction.description || 'No description',
                    category: auction.category || 'Uncategorised',
                    finalBid: bidsList[0].amount,
                    endTime: auction.endTime || Date.now(),
                    auctioneerId: auction.auctioneerId,
                    auctioneerName: auction.auctioneerName || 'Anonymous',
                    images: auction.images || '',
                    paymentStatus: auction.paymentStatus || 'pending',
                    hiddenFromHistory: auction.hiddenFromHistory || false
                  });
                }
              }
            });
            
            // Sort by end time (most recent first)
            loadedWonAuctions.sort((a, b) => b.endTime - a.endTime);
          }
          
          setWonAuctions(loadedWonAuctions);
          setLoading(false);
          setRefreshing(false);
        },
        (error) => {
          console.error('Realtime Database error:', error);
          Alert.alert('Error', 'Failed to load your won auctions');
          setLoading(false);
          setRefreshing(false);
        }
      );

      // Store unsubscribe function for cleanup
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up won auctions listener:', error);
      Alert.alert('Error', 'Failed to load won auctions');
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const setupListener = async () => {
      if (currentUser) {
        unsubscribe = await fetchWonAuctions();
      }
    };
    
    setupListener();

    // Cleanup function
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUser]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchWonAuctions();
  };

  // Format phone number for M-Pesa (ensure it starts with 254)
  const formatPhoneNumber = (phone: string): string => {
    // Remove all non-digit characters
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Handle different phone number formats
    if (cleanPhone.startsWith('254')) {
      return cleanPhone;
    } else if (cleanPhone.startsWith('0')) {
      return '254' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('7') || cleanPhone.startsWith('1')) {
      return '254' + cleanPhone;
    }
    
    return cleanPhone;
  };

  // Validate phone number
  const isValidPhoneNumber = (phone: string): boolean => {
    const formatted = formatPhoneNumber(phone);
    // Kenyan phone numbers should be 12 digits starting with 254
    return /^254[71][0-9]{8}$/.test(formatted);
  };

  // Update payment status in Firebase
  const updatePaymentStatus = async (auctionId: string, status: 'pending' | 'paid' | 'processing') => {
    try {
      const db = getDatabase();
      const auctionRef = ref(db, `auctions/${auctionId}`);
      await update(auctionRef, { paymentStatus: status });
    } catch (error) {
      console.error('Error updating payment status:', error);
    }
  };

  // Hide auction from history (soft delete)
  const hideAuctionFromHistory = async (auctionId: string) => {
    try {
      setDeletingAuctions(prev => new Set([...prev, auctionId]));
      
      const db = getDatabase();
      const auctionRef = ref(db, `auctions/${auctionId}`);
      
      // Set hiddenFromHistory flag instead of deleting the record
      await update(auctionRef, { 
        hiddenFromHistory: true,
        hiddenAt: Date.now(),
        hiddenBy: currentUser?.id
      });
    } catch (error) {
      console.error('Error hiding auction from history:', error);
      Alert.alert('Error', 'Failed to remove auction from history. Please try again.');
    } finally {
      setDeletingAuctions(prev => {
        const newSet = new Set(prev);
        newSet.delete(auctionId);
        return newSet;
      });
    }
  };

  // Handle delete auction with confirmation
  const handleDeleteAuction = (auctionId: string, title: string, paymentStatus: string) => {
    if (paymentStatus !== 'paid') {
      Alert.alert(
        'Cannot Delete',
        'Only paid auctions can be removed from history. Please complete payment first.'
      );
      return;
    }

    Alert.alert(
      'Remove from History',
      `Are you sure you want to remove "${title}" from your checkout history? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => hideAuctionFromHistory(auctionId)
        }
      ]
    );
  };

  // Initiate M-Pesa STK Push with Daraja API
  const initiateMpesaPayment = async (amount: number, phoneNumber: string, auctionId: string, description: string) => {
    try {
      setIsProcessingPayment(true);
      
      // Update payment status to processing
      await updatePaymentStatus(auctionId, 'processing');

      // Get access token
      const accessToken = await generateAccessToken();
      
      const formattedPhone = formatPhoneNumber(phoneNumber);
      const timestamp = getTimestamp();
      const password = generatePassword();
      
      const requestBody = {
        BusinessShortCode: MPESA_CONFIG.businessShortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: MPESA_CONFIG.businessShortCode,
        PhoneNumber: formattedPhone,
        CallBackURL: `${MPESA_CONFIG.callbackUrl}/${auctionId}`,
        AccountReference: auctionId,
        TransactionDesc: description
      };

      const response = await fetch(`${MPESA_CONFIG.baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();

      if (response.ok && result.ResponseCode === '0') {
        // Payment request sent successfully
        Alert.alert(
          'Payment Request Sent',
          'Please check your phone for the M-Pesa payment prompt and enter your PIN to complete the payment.',
          [
            {
              text: 'OK',
              onPress: () => {
                setPaymentModal({ visible: false, auctionId: '', amount: 0, title: '' });
                setPhoneNumber('');
                // Start polling for payment status
                const checkoutRequestId = result.CheckoutRequestID;
                pollPaymentStatus(checkoutRequestId, auctionId);
              }
            }
          ]
        );
      } else {
        // Handle specific error messages
        let errorMessage = 'Payment initiation failed';
        
        if (result.ResponseDescription) {
          errorMessage = result.ResponseDescription;
        } else if (result.errorMessage) {
          errorMessage = result.errorMessage;
        } else if (result.ResponseCode) {
          errorMessage = `Error Code: ${result.ResponseCode}`;
        }
        
        throw new Error(errorMessage);
      }

    } catch (error) {
      console.error('M-Pesa payment error:', error);
      
      // Reset payment status to pending on error
      await updatePaymentStatus(auctionId, 'pending');
      
      Alert.alert(
        'Payment Error',
        `Failed to initiate payment: ${error.message || 'Unknown error'}. Please try again.`
      );
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Poll payment status with Daraja STK Query
  const pollPaymentStatus = async (checkoutRequestId: string, auctionId: string) => {
    let attempts = 0;
    const maxAttempts = 24; // Poll for 4 minutes (24 * 10 seconds)
    
    const checkStatus = async () => {
      try {
        // Get access token for query
        const accessToken = await generateAccessToken();
        const timestamp = getTimestamp();
        const password = generatePassword();
        
        const queryBody = {
          BusinessShortCode: MPESA_CONFIG.businessShortCode,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId
        };

        const response = await fetch(`${MPESA_CONFIG.baseUrl}/mpesa/stkpushquery/v1/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(queryBody)
        });

        const result = await response.json();

        // Check for successful payment
        if (result.ResultCode === '0') {
          // Payment successful
          await updatePaymentStatus(auctionId, 'paid');
          Alert.alert('Payment Successful', 'Your payment has been processed successfully!');
          return;
        } else if (result.ResultCode === '1032') {
          // Payment cancelled by user
          await updatePaymentStatus(auctionId, 'pending');
          Alert.alert('Payment Cancelled', 'Payment was cancelled. You can try again.');
          return;
        } else if (result.ResultCode && result.ResultCode !== '1037') {
          // Payment failed (1037 is timeout/still processing)
          await updatePaymentStatus(auctionId, 'pending');
          const errorMessage = result.ResultDesc || 'Payment was not successful';
          Alert.alert('Payment Failed', errorMessage);
          return;
        }

        // If still processing and haven't reached max attempts, check again
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(checkStatus, 10000); // Check again after 10 seconds
        } else {
          // Timeout - payment might still be processing
          Alert.alert(
            'Payment Status Unknown',
            'We are still processing your payment. You will be notified once the payment is confirmed.'
          );
        }

      } catch (error) {
        console.error('Error checking payment status:', error);
        // Continue polling unless we've reached max attempts
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(checkStatus, 10000);
        }
      }
    };

    // Start checking after 10 seconds to give M-Pesa time to process
    setTimeout(checkStatus, 10000);
  };

  const handlePayment = (auctionId: string, amount: number, title: string) => {
    setPaymentModal({
      visible: true,
      auctionId,
      amount,
      title
    });
  };

  const processPayment = () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      Alert.alert('Error', 'Please enter a valid Kenyan phone number (e.g., 0712345678 or 254712345678)');
      return;
    }

    Alert.alert(
      'Confirm Payment',
      `Pay Ksh ${paymentModal.amount.toLocaleString()} for "${paymentModal.title}" using M-Pesa number ${phoneNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          style: 'default',
          onPress: () => {
            initiateMpesaPayment(
              paymentModal.amount,
              phoneNumber,
              paymentModal.auctionId,
              `Payment for ${paymentModal.title}`
            );
          }
        }
      ]
    );
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return '#28a745';
      case 'processing':
        return '#ffc107';
      case 'pending':
      default:
        return '#dc3545';
    }
  };

  const getPaymentStatusText = (status: string) => {
    switch (status) {
      case 'paid':
        return 'PAID';
      case 'processing':
        return 'PROCESSING';
      case 'pending':
      default:
        return 'PENDING';
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const renderWonAuctionItem = ({ item }: { item: WonAuction }) => (
    <View style={styles.auctionItem}>
      <View style={styles.auctionContent}>
        <View style={styles.productHeader}>
          <Text style={styles.productName}>{item.title}</Text>
          <View style={styles.statusAndActions}>
            <View style={[styles.statusBadge, { backgroundColor: getPaymentStatusColor(item.paymentStatus) }]}>
              <Text style={styles.statusText}>{getPaymentStatusText(item.paymentStatus)}</Text>
            </View>
            
            {/* Delete button - only show for paid auctions */}
            {item.paymentStatus === 'paid' && (
              <TouchableOpacity
                style={[styles.deleteButton, deletingAuctions.has(item.id) && styles.deletingButton]}
                onPress={() => handleDeleteAuction(item.id, item.title, item.paymentStatus)}
                disabled={deletingAuctions.has(item.id)}
              >
                {deletingAuctions.has(item.id) ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.deleteButtonText}>×</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
        
        <Text style={styles.productDescription} numberOfLines={2}>
          {item.description}
        </Text>
        
        <View style={styles.categoryContainer}>
          <Text style={styles.category}>{item.category}</Text>
        </View>
        
        <Text style={styles.auctioneerText}>
          Sold by: {item.auctioneerName}
        </Text>
        
        <Text style={styles.endDateText}>
          Ended: {formatDate(item.endTime)}
        </Text>
      </View>
      
      <View style={styles.priceContainer}>
        <Text style={styles.priceLabel}>WINNING BID</Text>
        <Text style={styles.price}>Ksh {item.finalBid.toLocaleString()}</Text>
        
        {item.paymentStatus === 'pending' && (
          <TouchableOpacity 
            style={styles.paymentButton}
            onPress={() => handlePayment(item.id, item.finalBid, item.title)}
          >
            <Text style={styles.paymentButtonText}>Pay with M-Pesa</Text>
          </TouchableOpacity>
        )}
        
        {item.paymentStatus === 'processing' && (
          <View style={styles.processingButton}>
            <Text style={styles.processingButtonText}>Processing...</Text>
          </View>
        )}
        
        {item.paymentStatus === 'paid' && (
          <View style={styles.paidButton}>
            <Text style={styles.paidButtonText}>✓ Paid</Text>
          </View>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Loading your won auctions...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>Checkout</Text>
          
          <View style={styles.placeholder} />
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Your Won Auctions</Text>
          <Text style={styles.welcomeSubtitle}>Complete your payments below</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Won Auctions Section */}
        <View style={styles.auctionsSection}>
          {wonAuctions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No won auctions found. Start bidding to see your wins here!
              </Text>
              <TouchableOpacity 
                style={styles.browseButton}
                onPress={() => router.push('/bidderHome' as any)}
              >
                <Text style={styles.browseButtonText}>Browse Auctions</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={wonAuctions}
              renderItem={renderWonAuctionItem}
              keyExtractor={(item) => item.id}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#007bff']}
                />
              }
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContainer}
            />
          )}
        </View>

        {/* M-Pesa Payment Modal */}
        <Modal
          visible={paymentModal.visible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            if (!isProcessingPayment) {
              setPaymentModal({ visible: false, auctionId: '', amount: 0, title: '' });
              setPhoneNumber('');
            }
          }}
        >
          <KeyboardAvoidingView 
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>M-Pesa Payment</Text>
              
              <View style={styles.paymentDetails}>
                <Text style={styles.paymentItemTitle}>{paymentModal.title}</Text>
                <Text style={styles.paymentAmount}>Ksh {paymentModal.amount.toLocaleString()}</Text>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Enter your M-Pesa phone number:</Text>
                <TextInput
                  style={styles.phoneInput}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="e.g., 0712345678 or 254712345678"
                  keyboardType="phone-pad"
                  maxLength={15}
                  editable={!isProcessingPayment}
                />
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    if (!isProcessingPayment) {
                      setPaymentModal({ visible: false, auctionId: '', amount: 0, title: '' });
                      setPhoneNumber('');
                    }
                  }}
                  disabled={isProcessingPayment}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.modalButton, styles.payButton, isProcessingPayment && styles.disabledButton]}
                  onPress={processPayment}
                  disabled={isProcessingPayment}
                >
                  {isProcessingPayment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.payButtonText}>Pay Now</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.mpesaNote}>
                You will receive an M-Pesa prompt on your phone. Enter your PIN to complete the payment.
              </Text>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 50, // Account for status bar
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  welcomeSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 20,
    marginVertical: 10,
  },
  auctionsSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  listContainer: {
    paddingBottom: 20,
  },
  auctionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 15,
    paddingHorizontal: 15,
    marginVertical: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#007bff',
  },
  auctionContent: {
    flex: 1,
    paddingRight: 15,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  statusAndActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  deletingButton: {
    backgroundColor: '#a02835',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: -2,
  },
  productDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  categoryContainer: {
    marginBottom: 8,
  },
  category: {
    fontSize: 12,
    color: '#007bff',
    backgroundColor: '#E8F4FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontWeight: '500',
    alignSelf: 'flex-start',
  },
  auctioneerText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  endDateText: {
    fontSize: 12,
    color: '#888',
  },
  priceContainer: {
    alignItems: 'flex-end',
    minWidth: 120,
  },
  priceLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28a745',
    marginBottom: 10,
  },
  paymentButton: {
    backgroundColor: '#00C851',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  paymentButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  processingButton: {
    backgroundColor: '#ffc107',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  processingButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  paidButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  paidButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  browseButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  browseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  paymentDetails: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
  },
  paymentItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  paymentAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00C851',
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  phoneInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  payButton: {
    backgroundColor: '#00C851',
  },
  payButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  mpesaNote: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 16,
  },
});