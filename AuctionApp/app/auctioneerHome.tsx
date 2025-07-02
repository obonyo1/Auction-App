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
import { useAuth } from './context/authContext'; // Adjust path as needed
import { 
  getDatabase, 
  ref, 
  onValue, 
  query, 
  orderByChild, 
  equalTo,
  off 
} from 'firebase/database';
import { signOut } from 'firebase/auth';
import { auth } from './firebase/firebaseConfig';

interface AuctionItem {
  id: string;
  title: string;
  description: string;
  startingBid: number;
  currentBid: number;
  status: 'active' | 'completed' | 'upcoming';
  endTime: number;
  createdAt: number;
  auctioneerId: string;
  images?: string;
}

export default function AuctioneerHome() {
  const router = useRouter();
  const { username } = useAuth();
  const [myAuctions, setMyAuctions] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Function to determine actual status based on current time
  const getActualStatus = (auction: AuctionItem) => {
    const now = Date.now();
    
    // If auction has ended (time passed), mark as completed
    if (auction.endTime <= now) {
      return 'completed';
    }
    
    
    // Return the database status if auction hasn't ended
    return auction.status;
  };

  // Separate auctions into active and ended based on actual status
  const activeAuctions = myAuctions.filter(auction => {
    const actualStatus = getActualStatus(auction);
    return actualStatus === 'active' || actualStatus === 'upcoming';
  });
  
  const endedAuctions = myAuctions.filter(auction => {
    const actualStatus = getActualStatus(auction);
    return actualStatus === 'completed';
  });

  const fetchMyAuctions = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setLoading(false);
        return;
      }

      const db = getDatabase();
      const auctionsRef = ref(db, 'auctions');

      // Set up real-time listener for auctions by current user
      const unsubscribe = onValue(
        auctionsRef,
        (snapshot) => {
          const loadedAuctions: AuctionItem[] = [];
          
          if (snapshot.exists()) {
            const data = snapshot.val();
            
            // Filter auctions by current user and convert to array
            Object.keys(data).forEach((key) => {
              const auction = data[key];
              
              // Only include auctions created by current user
              if (auction.auctioneerId === currentUser.uid) {
                const auctionItem: AuctionItem = {
                  id: key,
                  title: auction.title || 'Unknown Product',
                  description: auction.description || 'No description',
                  startingBid: auction.startPrice || 0,
                  currentBid: auction.currentBid || auction.startPrice || 0,
                  status: auction.status || 'active',
                  endTime: auction.endTime || Date.now(),
                  createdAt: auction.createdAt || Date.now(),
                  auctioneerId: auction.auctioneerId,
                  images: auction.imageUrl || ''
                };

                loadedAuctions.push(auctionItem);
              }
            });
            
            // Sort by creation time (newest first)
            loadedAuctions.sort((a, b) => b.createdAt - a.createdAt);
          }
          
          setMyAuctions(loadedAuctions);
          setLoading(false);
          setRefreshing(false);
          console.log('My auctions fetched:', loadedAuctions.length);
        },
        (error) => {
          console.error('Realtime Database error:', error);
          Alert.alert('Error', 'Failed to load your auctions');
          setLoading(false);
          setRefreshing(false);
        }
      );

      // Store unsubscribe function for cleanup
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up auction listener:', error);
      Alert.alert('Error', 'Failed to load auctions');
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const setupListener = async () => {
      unsubscribe = await fetchMyAuctions();
    };
    
    setupListener();

    // Set up interval to update status every minute
    const statusUpdateInterval = setInterval(() => {
      // Force re-render to update status badges and positions
      setMyAuctions(prev => [...prev]);
    }, 60000); // Update every minute

    // Cleanup function
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      clearInterval(statusUpdateInterval);
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMyAuctions();
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(auth);
              router.replace('/login');
            } catch (error) {
              console.error('Logout error:', error);
              Alert.alert('Error', 'Failed to logout');
            }
          }
        }
      ]
    );
  };

  const getStatusColor = (auction: AuctionItem) => {
    const actualStatus = getActualStatus(auction);
    switch (actualStatus) {
      case 'active':
        return '#28a745';
      case 'completed':
        return '#6c757d';
      case 'upcoming':
        return '#ffc107';
      default:
        return '#6c757d';
    }
  };

  const getStatusText = (auction: AuctionItem) => {
    const actualStatus = getActualStatus(auction);
    switch (actualStatus) {
      case 'active':
        return 'ACTIVE';
      case 'completed':
        return 'ENDED';
      case 'upcoming':
        return 'UPCOMING';
      default:
        return actualStatus.toUpperCase();
    }
  };

  const formatTimeLeft = (endTime: number) => {
    const now = Date.now();
    const timeLeft = endTime - now;
    
    if (timeLeft <= 0) return 'Ended';
    
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h left`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    }
    return `${minutes}m left`;
  };

  const renderAuctionItem = ({ item }: { item: AuctionItem }) => (
    <TouchableOpacity 
      style={styles.splitAuctionItem}
      onPress={() => {
        // Navigate to auction details
        router.push(`/auctionDetails/${item.id}` as any);
      }}
    >
      <View style={styles.auctionContent}>
        <View style={styles.productHeader}>
          <Text style={styles.productName} numberOfLines={1}>{item.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item) }]}>
            <Text style={styles.statusText}>{getStatusText(item)}</Text>
          </View>
        </View>
        <Text style={styles.productDescription} numberOfLines={2}>
          {item.description}
        </Text>
        <Text style={styles.timeLeft}>
          {formatTimeLeft(item.endTime)}
        </Text>
        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>CURRENT BID</Text>
          <Text style={styles.price}>Ksh {item.currentBid.toLocaleString()}</Text>
          <Text style={styles.startPrice}>Start: Ksh {item.startingBid.toLocaleString()}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Loading your auctions...</Text>
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
            style={styles.helpButton}
            onPress={() => {
              Alert.alert('Help', 'Contact support for assistance');
            }}
          >
            <Text style={styles.helpButtonText}>?</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.menuButton}
            onPress={handleLogout}
          >
            <View style={styles.menuIcon}>
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Welcome</Text>
          <Text style={styles.welcomeUsername}>{username || 'Auctioneer'}</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Place Item Button */}
        <TouchableOpacity 
          style={styles.placeItemButton}
          onPress={() => router.push('/createAuction' as any)}
        >
          <Text style={styles.placeItemButtonText}>Place item up for auction</Text>
        </TouchableOpacity>

        {/* My Auctions Section with Split Layout */}
        <View style={styles.previousAuctionsSection}>
          <Text style={styles.sectionTitle}>My Auctions</Text>
          
          {myAuctions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No auctions found. Create your first auction!
              </Text>
            </View>
          ) : (
            <View style={styles.splitContainer}>
              {/* Left Side - Active Auctions */}
              <View style={styles.leftColumn}>
                <Text style={styles.columnTitle}>Active ({activeAuctions.length})</Text>
                <FlatList
                  data={activeAuctions}
                  renderItem={renderAuctionItem}
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
                  ListEmptyComponent={
                    <Text style={styles.emptyColumnText}>No active auctions</Text>
                  }
                />
              </View>

              {/* Right Side - Ended Auctions */}
              <View style={styles.rightColumn}>
                <Text style={styles.columnTitle}>Ended ({endedAuctions.length})</Text>
                <FlatList
                  data={endedAuctions}
                  renderItem={renderAuctionItem}
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
                  ListEmptyComponent={
                    <Text style={styles.emptyColumnText}>No ended auctions</Text>
                  }
                />
              </View>
            </View>
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
  helpButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6c757d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  helpButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  menuButton: {
    padding: 10,
  },
  menuIcon: {
    width: 24,
    height: 24,
    justifyContent: 'space-between',
  },
  menuLine: {
    height: 3,
    backgroundColor: '#333',
    borderRadius: 2,
  },
  welcomeSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  welcomeUsername: {
    fontSize: 24,
    fontStyle: 'italic',
    color: '#666',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 20,
    marginVertical: 10,
  },
  placeItemButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 15,
    paddingHorizontal: 30,
    marginHorizontal: 20,
    marginVertical: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  placeItemButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  previousAuctionsSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  splitContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  leftColumn: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    marginRight: 5,
  },
  rightColumn: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    marginLeft: 5,
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  listContainer: {
    paddingBottom: 20,
  },
  splitAuctionItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  auctionContent: {
    flex: 1,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  productName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  productDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
    marginBottom: 5,
  },
  timeLeft: {
    fontSize: 11,
    color: '#ff6b35',
    fontWeight: '600',
    marginBottom: 8,
  },
  priceContainer: {
    alignItems: 'flex-start',
  },
  priceLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 2,
  },
  price: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: 2,
  },
  startPrice: {
    fontSize: 10,
    color: '#666',
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
  },
  emptyColumnText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 20,
  },
});