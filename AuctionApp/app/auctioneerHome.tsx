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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useAuth } from './context/authContext';
import { 
  getDatabase, 
  ref, 
  onValue, 
  query, 
  orderByChild, 
  equalTo,
  off,
  remove,
  get
} from 'firebase/database';
import { signOut } from 'firebase/auth';
import { auth } from './firebase/firebaseConfig';

const { width, height } = Dimensions.get('window');

interface BidInfo {
  id: string;
  bidderId: string;
  bidderName: string;
  bidAmount: number;
  bidTime: number;
  isWinning?: boolean;
}

interface PaymentInfo {
  hasPaid: boolean;
  amountPaid: number;
  paymentTime?: number;
  paymentMethod?: string;
}

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
  winnerId?: string;
  winnerName?: string;
  winningBidTime?: number;
  paymentInfo?: PaymentInfo;
  images?: string;
}

export default function AuctioneerHome() {
  const router = useRouter();
  const { username } = useAuth();
  const [myAuctions, setMyAuctions] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedAuction, setSelectedAuction] = useState<AuctionItem | null>(null);
  const [bidHistory, setBidHistory] = useState<BidInfo[]>([]);
  const [loadingBids, setLoadingBids] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  const fetchBidHistory = async (auctionId: string) => {
    setLoadingBids(true);
    try {
      const db = getDatabase();
      const bidsRef = ref(db, `auctions/${auctionId}/bids`);
      const oldBidsRef = ref(db, `bids/${auctionId}`);
      
      const [newSnapshot, oldSnapshot] = await Promise.all([
        get(bidsRef),
        get(oldBidsRef)
      ]);

      let bids: BidInfo[] = [];

      if (newSnapshot.exists()) {
        const data = newSnapshot.val();
        bids = Object.keys(data).map(key => ({
          id: key,
          bidderId: data[key].bidderId,
          bidderName: data[key].bidderName || 'Anonymous',
          bidAmount: data[key].amount || 0,
          bidTime: data[key].timestamp || Date.now(),
          isWinning: data[key].isWinning || false
        }));
      } else if (oldSnapshot.exists()) {
        const data = oldSnapshot.val();
        bids = Object.keys(data).map(key => ({
          id: key,
          bidderId: data[key].bidderId,
          bidderName: data[key].bidderName || data[key].bidderUsername || 'Anonymous',
          bidAmount: data[key].amount || data[key].bidAmount || 0,
          bidTime: data[key].timestamp || data[key].bidTime || Date.now(),
          isWinning: data[key].isWinning || false
        }));
      }

      setBidHistory(bids.sort((a, b) => b.bidAmount - a.bidAmount));
    } catch (error) {
      console.error('Error fetching bid history:', error);
      Alert.alert('Error', 'Failed to load bid history');
    } finally {
      setLoadingBids(false);
    }
  };

  const getActualStatus = (auction: AuctionItem) => {
    const now = Date.now();
    
    if (auction.endTime <= now) {
      return 'completed';
    }
    
    return auction.status;
  };

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

      const unsubscribe = onValue(
        auctionsRef,
        (snapshot) => {
          const loadedAuctions: AuctionItem[] = [];
          
          if (snapshot.exists()) {
            const data = snapshot.val();
            
            Object.keys(data).forEach((key) => {
              const auction = data[key];
              
              if (auction.auctioneerId === currentUser.uid) {
                const auctionItem: AuctionItem = {
                  id: key,
                  title: auction.title || 'Unknown Product',
                  description: auction.description || 'No description',
                  startingBid: auction.startPrice || auction.startingBid || 0,
                  currentBid: auction.currentBid || auction.startPrice || auction.startingBid || 0,
                  status: auction.status || (auction.endTime <= Date.now() ? 'completed' : 'active'),
                  endTime: auction.endTime || Date.now(),
                  createdAt: auction.createdAt || Date.now(),
                  auctioneerId: auction.auctioneerId,
                  images: auction.imageUrl || '',
                  winnerId: auction.winnerId,
                  winnerName: auction.winnerName || auction.winnerUsername,
                  winningBidTime: auction.winningBidTime,
                  paymentInfo: auction.paymentInfo || { hasPaid: false, amountPaid: 0 }
                };

                loadedAuctions.push(auctionItem);
              }
            });
            
            loadedAuctions.sort((a, b) => b.createdAt - a.createdAt);
          }
          
          setMyAuctions(loadedAuctions);
          setLoading(false);
          setRefreshing(false);
        },
        (error) => {
          console.error('Realtime Database error:', error);
          Alert.alert('Error', 'Failed to load your auctions');
          setLoading(false);
          setRefreshing(false);
        }
      );

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

    const statusUpdateInterval = setInterval(() => {
      setMyAuctions(prev => [...prev]);
    }, 60000);

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

  const openAuctionDetails = async (auction: AuctionItem) => {
    setSelectedAuction(auction);
    setModalVisible(true);
    await fetchBidHistory(auction.id);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedAuction(null);
    setBidHistory([]);
  };

  const handleDeleteAuction = async () => {
    if (!selectedAuction) return;
    
    Alert.alert(
      'Delete Auction',
      `Are you sure you want to delete "${selectedAuction.title}"? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              const db = getDatabase();
              await remove(ref(db, `auctions/${selectedAuction.id}`));
              await remove(ref(db, `bids/${selectedAuction.id}`));
              closeModal();
              fetchMyAuctions();
              Alert.alert('Success', 'Auction deleted successfully');
            } catch (error) {
              console.error('Error deleting auction:', error);
              Alert.alert('Error', 'Failed to delete auction');
            } finally {
              setDeleting(false);
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

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatBidTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderAuctionItem = ({ item }: { item: AuctionItem }) => (
    <TouchableOpacity 
      style={styles.auctionItem}
      onPress={() => openAuctionDetails(item)}
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

  const AuctionDetailsModal = () => {
    if (!selectedAuction) return null;

    const isAuctionEnded = selectedAuction.endTime <= Date.now() || selectedAuction.status === 'completed';

    return (
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedAuction.title}</Text>
              <TouchableOpacity 
                onPress={closeModal} 
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Description</Text>
                <Text style={styles.description}>{selectedAuction.description}</Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Pricing</Text>
                <View style={styles.priceRow}>
                  <Text style={styles.priceRowLabel}>Starting Bid:</Text>
                  <Text style={styles.priceRowValue}>Ksh {selectedAuction.startingBid.toLocaleString()}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceRowLabel}>Current Bid:</Text>
                  <Text style={[styles.priceRowValue, styles.currentBidValue]}>
                    Ksh {selectedAuction.currentBid.toLocaleString()}
                  </Text>
                </View>
              </View>

              {isAuctionEnded && selectedAuction.winnerId && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Winner Information</Text>
                  <View style={styles.winnerCard}>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceRowLabel}>Winner:</Text>
                      <Text style={[styles.priceRowValue, styles.winnerName]}>
                        {selectedAuction.winnerName || 'Unknown'}
                      </Text>
                    </View>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceRowLabel}>Winning Bid:</Text>
                      <Text style={[styles.priceRowValue, styles.winningAmount]}>
                        Ksh {selectedAuction.currentBid.toLocaleString()}
                      </Text>
                    </View>
                    {selectedAuction.winningBidTime && (
                      <View style={styles.priceRow}>
                        <Text style={styles.priceRowLabel}>Won At:</Text>
                        <Text style={styles.priceRowValue}>
                          {formatDate(selectedAuction.winningBidTime)}
                        </Text>
                      </View>
                    )}
                  </View>

                  {selectedAuction.paymentInfo && (
                    <View style={styles.paymentSection}>
                      <Text style={styles.paymentTitle}>Payment Status</Text>
                      <View style={styles.paymentCard}>
                        <View style={styles.priceRow}>
                          <Text style={styles.priceRowLabel}>Payment Status:</Text>
                          <Text style={[
                            styles.priceRowValue, 
                            selectedAuction.paymentInfo.hasPaid ? styles.paidStatus : styles.unpaidStatus
                          ]}>
                            {selectedAuction.paymentInfo.hasPaid ? 'PAID' : 'UNPAID'}
                          </Text>
                        </View>
                        <View style={styles.priceRow}>
                          <Text style={styles.priceRowLabel}>Amount Paid:</Text>
                          <Text style={styles.priceRowValue}>
                            Ksh {(selectedAuction.paymentInfo.amountPaid || 0).toLocaleString()}
                          </Text>
                        </View>
                        {selectedAuction.paymentInfo.paymentTime && (
                          <View style={styles.priceRow}>
                            <Text style={styles.priceRowLabel}>Paid At:</Text>
                            <Text style={styles.priceRowValue}>
                              {formatDate(selectedAuction.paymentInfo.paymentTime)}
                            </Text>
                          </View>
                        )}
                        {selectedAuction.paymentInfo.paymentMethod && (
                          <View style={styles.priceRow}>
                            <Text style={styles.priceRowLabel}>Method:</Text>
                            <Text style={styles.priceRowValue}>
                              {selectedAuction.paymentInfo.paymentMethod}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Timing</Text>
                <View style={styles.priceRow}>
                  <Text style={styles.priceRowLabel}>Created:</Text>
                  <Text style={styles.priceRowValue}>{formatDate(selectedAuction.createdAt)}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceRowLabel}>Ends:</Text>
                  <Text style={styles.priceRowValue}>{formatDate(selectedAuction.endTime)}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceRowLabel}>Status:</Text>
                  <Text style={[styles.priceRowValue, isAuctionEnded ? styles.timeEnded : styles.timeActive]}>
                    {isAuctionEnded ? 'Ended' : 'Active'}
                  </Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Bidding History</Text>
                {loadingBids ? (
                  <View style={styles.loadingBids}>
                    <ActivityIndicator size="small" color="#007bff" />
                    <Text style={styles.loadingBidsText}>Loading bids...</Text>
                  </View>
                ) : bidHistory.length > 0 ? (
                  <View style={styles.bidsContainer}>
                    {bidHistory.map((bid) => (
                      <View 
                        key={bid.id} 
                        style={[
                          styles.bidHistoryItem,
                          bid.isWinning && styles.winningBid
                        ]}
                      >
                        <View style={styles.bidInfo}>
                          <Text style={[
                            styles.bidderName,
                            bid.isWinning && styles.winningBidderName
                          ]}>
                            {bid.bidderName}
                            {bid.isWinning && ' 🏆'}
                          </Text>
                          <Text style={styles.bidTime}>
                            {formatBidTime(bid.bidTime)}
                          </Text>
                        </View>
                        <Text style={[
                          styles.bidAmount,
                          bid.isWinning && styles.winningBidAmount
                        ]}>
                          Ksh {bid.bidAmount.toLocaleString()}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noBidsText}>No bids yet</Text>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={[styles.footerButton, styles.deleteButton]}
                onPress={handleDeleteAuction}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.footerButtonText, styles.deleteButtonText]}>Delete Auction</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

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

        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Welcome</Text>
          <Text style={styles.welcomeUsername}>{username || 'Auctioneer'}</Text>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity 
          style={styles.placeItemButton}
          onPress={() => router.push('/createAuction' as any)}
        >
          <Text style={styles.placeItemButtonText}>Place item up for auction</Text>
        </TouchableOpacity>

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

        <AuctionDetailsModal />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 50,
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
  auctionItem: {
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666',
    fontWeight: 'bold',
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 15,
  },
  section: {
    marginBottom: 20,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  priceRowLabel: {
    fontSize: 16,
    color: '#666',
  },
  priceRowValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  currentBidValue: {
    color: '#007bff',
    fontSize: 18,
  },
  timeActive: {
    color: '#28a745',
  },
  timeEnded: {
    color: '#dc3545',
  },
  winnerCard: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
  },
  winnerName: {
    color: '#28a745',
    fontWeight: 'bold',
  },
  winningAmount: {
    color: '#007bff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  paymentSection: {
    marginTop: 15,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  paymentCard: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#007bff',
  },
  paidStatus: {
    color: '#28a745',
    fontWeight: 'bold',
  },
  unpaidStatus: {
    color: '#dc3545',
    fontWeight: 'bold',
  },
  bidsContainer: {
    marginTop: 10,
  },
  bidHistoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    marginVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  winningBid: {
    backgroundColor: '#fff3cd',
  },
  bidInfo: {
    flex: 1,
  },
  bidderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  winningBidderName: {
    color: '#856404',
  },
  bidAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007bff',
  },
  winningBidAmount: {
    color: '#856404',
  },
  bidTime: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 4,
  },
  noBidsText: {
    textAlign: 'center',
    color: '#6c757d',
    fontSize: 16,
    paddingVertical: 20,
    fontStyle: 'italic',
  },
  loadingBids: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingBidsText: {
    marginLeft: 10,
    color: '#666',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  footerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  primaryButton: {
    backgroundColor: '#007bff',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  footerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: '#fff',
  },
  deleteButtonText: {
    color: '#fff',
  },
});