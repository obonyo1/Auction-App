import React, { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { 
  View, 
  Image, 
  Text, 
  ScrollView, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput, 
  Alert,
  ActivityIndicator 
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { 
  getDatabase, 
  ref, 
  onValue, 
  push,
  set,
  serverTimestamp,
  off 
} from 'firebase/database';

type Bid = {
  id: string;
  amount: number;
  bidderId: string;
  bidderName: string;
  timestamp: number;
};

type AuctionDetails = {
  id: string;
  title: string;
  images: string | string[] | any; // More flexible image handling
  description: string;
  startingBid: number;
  currentBid: number;
  status: 'active' | 'completed' | 'upcoming';
  endTime: number;
  createdAt: number;
  auctioneerId: string;
  auctioneerName?: string;
  category?: string;
  condition?: string;
  bids?: Bid[];
};

type CurrentUser = {
  id: string;
  name: string;
};

export default function AuctionDetailsPage() {
  const searchParams = useLocalSearchParams();
  const id = searchParams.id as string;
  const [auction, setAuction] = useState<AuctionDetails | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [placingBid, setPlacingBid] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Updated function to handle flexible image formats
  const getDisplayImage = (imageData: string | string[] | any) => {
    // Handle null, undefined, or empty cases
    if (!imageData) {
      return null;
    }
    
    // If it's a string (single image URL), return it directly
    if (typeof imageData === 'string' && imageData.trim().length > 0) {
      return imageData;
    }
    
    // If it's an array, process the first element
    if (Array.isArray(imageData) && imageData.length > 0) {
      const firstImage = imageData[0];
      
      // Handle null or undefined entries
      if (!firstImage) {
        return null;
      }
      
      // Handle ImgBB object format
      if (typeof firstImage === 'object' && 
          firstImage !== null && 
          !Array.isArray(firstImage) && 
          ('url' in firstImage || 'displayUrl' in firstImage || 'thumbUrl' in firstImage)) {
        
        // Prefer displayUrl for better quality, fallback to url, then thumbUrl
        const imageUrl = firstImage.displayUrl || firstImage.url || firstImage.thumbUrl;
        
        // Ensure we're returning a string, not another object
        if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
          return imageUrl;
        }
        
        return null;
      }
      
      // Handle legacy string format in array
      if (typeof firstImage === 'string' && firstImage.trim().length > 0) {
        return firstImage;
      }
    }
    
    // Handle single ImgBB object (not in array)
    if (typeof imageData === 'object' && 
        imageData !== null && 
        !Array.isArray(imageData) && 
        ('url' in imageData || 'displayUrl' in imageData || 'thumbUrl' in imageData)) {
      
      const imageUrl = imageData.displayUrl || imageData.url || imageData.thumbUrl;
      
      if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
        return imageUrl;
      }
    }
    
    // If we get here, the data format is unexpected
    console.warn('Unexpected image format:', imageData);
    return null;
  };

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
      }
    });
    
    return () => unsubscribe();
  }, []);

  // Firebase data listeners
  useEffect(() => {
    if (!id) {
      router.back();
      return;
    }

    const db = getDatabase();
    const auctionRef = ref(db, `auctions/${id}`);
    const bidsRef = ref(db, `auctions/${id}/bids`);

    // Listen to auction details
    const auctionUnsubscribe = onValue(auctionRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setAuction({
          id,
          ...data
        });
      } else {
        Alert.alert('Error', 'Auction not found');
        router.back();
      }
      setLoading(false);
    });

    // Listen to bids
    const bidsUnsubscribe = onValue(bidsRef, (snapshot) => {
      const bidsList: Bid[] = [];
      if (snapshot.exists()) {
        const bidsData = snapshot.val();
        Object.keys(bidsData).forEach(key => {
          bidsList.push({
            id: key,
            ...bidsData[key]
          });
        });
        // Sort bids by timestamp (newest first)
        bidsList.sort((a, b) => b.timestamp - a.timestamp);
      }
      setBids(bidsList);
    });

    return () => {
      auctionUnsubscribe();
      bidsUnsubscribe();
    };
  }, [id]);

  // Update time left every second
  useEffect(() => {
    if (!auction) return;

    const updateTimeLeft = () => {
      const now = Date.now();
      const timeRemaining = auction.endTime - now;
      
      if (timeRemaining <= 0) {
        setTimeLeft('Auction Ended');
        return;
      }
      
      const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
      
      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`);
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [auction]);

  const handlePlaceBid = async () => {
    if (!currentUser) {
      Alert.alert('Error', 'Please log in to place a bid');
      return;
    }

    if (!auction || !bidAmount) {
      Alert.alert('Error', 'Please enter a bid amount');
      return;
    }

    const bidValue = parseFloat(bidAmount);
    
    if (isNaN(bidValue) || bidValue <= auction.currentBid) {
      Alert.alert('Invalid Bid', `Bid must be higher than current bid of Ksh ${auction.currentBid.toLocaleString()}`);
      return;
    }

    if (bidValue < auction.currentBid + 100) {
      Alert.alert('Bid Too Low', 'Minimum bid increment is Ksh 100');
      return;
    }

    if (auction.endTime <= Date.now()) {
      Alert.alert('Auction Ended', 'This auction has already ended');
      return;
    }

    setPlacingBid(true);

    try {
      const db = getDatabase();
      const bidsRef = ref(db, `auctions/${id}/bids`);
      
      // Add new bid
      const newBidRef = push(bidsRef);
      await set(newBidRef, {
        amount: bidValue,
        bidderId: currentUser.id,
        bidderName: currentUser.name,
        timestamp: Date.now()
      });

      // Update current bid in auction
      await set(ref(db, `auctions/${id}/currentBid`), bidValue);

      setBidAmount('');
      Alert.alert('Success', 'Your bid has been placed!');
    } catch (error) {
      console.error('Error placing bid:', error);
      Alert.alert('Error', 'Failed to place bid. Please try again.');
    } finally {
      setPlacingBid(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ 
          title: 'Auction Details',
          headerShown: true 
        }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Loading auction details...</Text>
        </View>
      </>
    );
  }

  if (!auction) {
    return (
      <>
        <Stack.Screen options={{ 
          title: 'Auction Details',
          headerShown: true 
        }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Auction not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const isAuctionActive = auction.status === 'active' && auction.endTime > Date.now();
  const displayImage = getDisplayImage(auction.images);

  return (
    <>
      <Stack.Screen options={{ 
        title: auction.title,
        headerShown: true 
      }} />
      <ScrollView style={styles.container}>
        {/* Main Image */}
        {displayImage ? (
          <Image 
            source={{ uri: displayImage }} 
            style={styles.mainImage}
            resizeMode="cover"
            onError={(error) => console.log('Image failed to load:', displayImage, error.nativeEvent.error)}
          />
        ) : (
          <View style={styles.placeholderImage}>
            <Text style={styles.placeholderText}>No Image Available</Text>
          </View>
        )}

        {/* Product Info */}
        <View style={styles.infoSection}>
          <Text style={styles.productName}>{auction.title}</Text>
          <Text style={styles.description}>{auction.description}</Text>
          
          {/* Price Information */}
          <View style={styles.priceSection}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Starting Price:</Text>
              <Text style={styles.startPrice}>Ksh {auction.startingBid || 0}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Current Bid:</Text>
              <Text style={styles.currentBid}>Ksh {auction.currentBid || 0}</Text>
            </View>
          </View>

          {/* Time Left */}
          <View style={styles.timeSection}>
            <Text style={[
              styles.timeLeft, 
              !isAuctionActive && styles.timeEnded
            ]}>
              {timeLeft}
            </Text>
            <Text style={styles.auctionStatus}>
              Status: {auction.status === 'active' ? 'Active' : 'Ended'}
            </Text>
          </View>
        </View>

        {/* Bidding Section */}
        {isAuctionActive && currentUser && (
          <View style={styles.biddingSection}>
            <Text style={styles.sectionTitle}>Place Your Bid</Text>
            <View style={styles.bidInputContainer}>
              <TextInput
                style={styles.bidInput}
                placeholder={`Minimum: Ksh ${(auction.currentBid || 0) + 100}`}
                value={bidAmount}
                onChangeText={setBidAmount}
                keyboardType="numeric"
                editable={!placingBid}
              />
              <TouchableOpacity 
                style={[styles.bidButton, placingBid && styles.bidButtonDisabled]}
                onPress={handlePlaceBid}
                disabled={placingBid}
              >
                {placingBid ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.bidButtonText}>Place Bid</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Login prompt for non-authenticated users */}
        {isAuctionActive && !currentUser && (
          <View style={styles.biddingSection}>
            <Text style={styles.sectionTitle}>Login Required</Text>
            <Text style={styles.loginText}>Please log in to place a bid on this auction.</Text>
          </View>
        )}

        {/* Bid History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Bid History</Text>
          {bids.length === 0 ? (
            <Text style={styles.noBidsText}>No bids placed yet</Text>
          ) : (
            bids.map((bid) => (
              <View key={bid.id} style={styles.bidHistoryItem}>
                <View style={styles.bidInfo}>
                  <Text style={styles.bidderName}>{bid.bidderName}</Text>
                  <Text style={styles.bidTime}>{formatTimestamp(bid.timestamp)}</Text>
                </View>
                <Text style={styles.bidHistoryAmount}>Ksh {bid.amount || 0}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  mainImage: {
    width: '100%',
    height: 300,
  },
  placeholderImage: {
    width: '100%',
    height: 300,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#999',
    fontSize: 16,
  },
  infoSection: {
    padding: 20,
  },
  productName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 20,
  },
  priceSection: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 16,
    color: '#666',
  },
  startPrice: {
    fontSize: 16,
    color: '#888',
  },
  currentBid: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007bff',
  },
  timeSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  timeLeft: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ff6b35',
    marginBottom: 8,
  },
  timeEnded: {
    color: '#dc3545',
  },
  auctionStatus: {
    fontSize: 14,
    color: '#666',
  },
  biddingSection: {
    padding: 20,
    backgroundColor: '#f8f9fa',
    marginHorizontal: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  bidInputContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  bidInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: 'white',
  },
  bidButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    minWidth: 100,
  },
  bidButtonDisabled: {
    backgroundColor: '#ccc',
  },
  bidButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loginText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  historySection: {
    padding: 20,
  },
  noBidsText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
  },
  bidHistoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  bidInfo: {
    flex: 1,
  },
  bidderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  bidTime: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  bidHistoryAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007bff',
  },
});