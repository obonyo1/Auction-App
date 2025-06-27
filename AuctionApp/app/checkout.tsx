import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  FlatList, 
  Alert,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { 
  getDatabase, 
  ref, 
  onValue, 
  query, 
  orderByChild, 
  equalTo
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
}

interface CurrentUser {
  id: string;
  name: string;
}

export default function Checkout() {
  const router = useRouter();
  const [wonAuctions, setWonAuctions] = useState<WonAuction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

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
                    category: auction.category || 'Uncategorized',
                    finalBid: bidsList[0].amount,
                    endTime: auction.endTime || Date.now(),
                    auctioneerId: auction.auctioneerId,
                    auctioneerName: auction.auctioneerName || 'Anonymous',
                    images: auction.images || '',
                    paymentStatus: auction.paymentStatus || 'pending'
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
          console.log('Won auctions fetched:', loadedWonAuctions.length);
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

  const handlePayment = (auctionId: string, amount: number, title: string) => {
    Alert.alert(
      'Proceed to Payment',
      `Pay Ksh ${amount.toLocaleString()} for "${title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          style: 'default',
          onPress: () => {
            // Here you would integrate with a payment gateway
            // For now, we'll show a mock payment process
            Alert.alert(
              'Payment Processing',
              'Redirecting to payment gateway...',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    // Mock payment success
                    Alert.alert('Payment Successful', 'Your payment has been processed successfully!');
                  }
                }
              ]
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
          <View style={[styles.statusBadge, { backgroundColor: getPaymentStatusColor(item.paymentStatus) }]}>
            <Text style={styles.statusText}>{getPaymentStatusText(item.paymentStatus)}</Text>
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
            <Text style={styles.paymentButtonText}>Pay Now</Text>
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
    backgroundColor: '#007bff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  paymentButtonText: {
    color: '#fff',
    fontSize: 12,
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
});