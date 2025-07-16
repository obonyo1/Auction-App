import React, { useEffect, useState, useRef } from 'react';
import { 
  View, 
  Image, 
  Text, 
  ScrollView, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator,
  TextInput,
  Alert,
  Animated,
  Platform
} from 'react-native';
import { Stack, router } from 'expo-router';
import { getDatabase, ref, onValue } from 'firebase/database';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useAuth } from './context/authContext';
import * as Notifications from 'expo-notifications';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type Item = {
  id: string;
  title: string;
  images: string[];
  description: string;
  startingBid: number;
  currentBid: number;
  status: 'active' | 'completed' | 'upcoming';
  endTime: number;
  createdAt: number;
  auctioneerId: string;
  category: string;
  condition: string;
  auctioneerName: string;
  winnerId?: string;
  paymentInfo?: {
    hasPaid: boolean;
  };
};

const CATEGORIES = ['All', 'Electronics', 'Fashion', 'Home & Garden', 'Sports', 'Collectibles', 'Other'];

export default function BidderHome() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [wonAuctions, setWonAuctions] = useState<Item[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [previousWonCount, setPreviousWonCount] = useState(0);
  const { userId } = useAuth();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  // Request notification permissions
  useEffect(() => {
    registerForPushNotificationsAsync();

    // This listener is fired whenever a notification is received while the app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // This listener is fired whenever a user taps on or interacts with a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      // Handle notification tap - could navigate to specific auction
      const data = response.notification.request.content.data;
      if (data?.auctionId) {
        router.push(`/auctionDetails?id=${data.auctionId}`);
      } else if (data?.type === 'checkout') {
        router.push('/checkout');
      }
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // Function to request notification permissions
  async function registerForPushNotificationsAsync() {
    let token;
    
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      Alert.alert(
        'Notification Permission',
        'Please enable notifications to receive alerts about auctions you win!',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Settings', onPress: () => Notifications.openSettingsAsync() }
        ]
      );
      return;
    }

    return token;
  }

  // Function to send local notification
  async function sendWinNotification(auction: Item) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🎉 Congratulations!",
        body: `You won the auction for "${auction.title}"! Complete your payment now.`,
        data: { 
          auctionId: auction.id,
          type: 'win',
          amount: auction.currentBid 
        },
        sound: 'default',
      },
      trigger: null, // Send immediately
    });
  }

  // Function to send payment reminder
  async function sendPaymentReminder(unpaidCount: number) {
    if (unpaidCount > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Payment Reminder",
          body: `You have ${unpaidCount} unpaid auction${unpaidCount > 1 ? 's' : ''}. Complete your payment to secure your items.`,
          data: { 
            type: 'checkout',
            unpaidCount 
          },
          sound: 'default',
        },
        trigger: null,
      });
    }
  }

  useEffect(() => {
    const db = getDatabase();
    const auctionsRef = ref(db, 'auctions');

    const unsubscribe = onValue(auctionsRef, (snapshot) => {
      const loadedItems: Item[] = [];
      const newlyWonAuctions: Item[] = [];
      const currentTime = Date.now();
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        
        Object.keys(data).forEach((key) => {
          const auction = data[key];
          const item = {
            id: key,
            title: auction.title || 'Untitled Auction',
            images: auction.images || [],
            description: auction.description || 'No description available',
            startingBid: auction.startingBid || 0,
            currentBid: auction.currentBid || auction.startingBid || 0,
            status: auction.status,
            endTime: auction.endTime,
            createdAt: auction.createdAt || Date.now(),
            auctioneerId: auction.auctioneerId || '',
            category: auction.category || 'Uncategorized',
            condition: auction.condition || 'Unknown',
            auctioneerName: auction.auctioneerName || 'Anonymous',
            winnerId: auction.winnerId,
            paymentInfo: auction.paymentInfo || { hasPaid: false }
          };

          // Check if auction is won by current user and not paid
          if (auction.winnerId === userId && 
              auction.status === 'completed' && 
              (!auction.paymentInfo || !auction.paymentInfo.hasPaid)) {
            newlyWonAuctions.push(item);
          }

          // Only show active auctions in the main list
          if (auction.status === 'active' && auction.endTime > currentTime) {
            loadedItems.push(item);
          }
        });

        // Check for new wins and send notifications
        const currentWonCount = newlyWonAuctions.length;
        if (currentWonCount > previousWonCount && previousWonCount >= 0) {
          // New auction won
          const newWins = newlyWonAuctions.slice(previousWonCount);
          newWins.forEach(auction => {
            sendWinNotification(auction);
          });
          
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 5000);
          triggerPulseAnimation();
        }

        setPreviousWonCount(currentWonCount);
        setWonAuctions(newlyWonAuctions);
        loadedItems.sort((a, b) => a.endTime - b.endTime);
        setItems(loadedItems);
      } else {
        setPreviousWonCount(0);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId, previousWonCount]);

  // Send payment reminder every 30 minutes for unpaid auctions
  useEffect(() => {
    const unpaidCount = wonAuctions.filter(a => !a.paymentInfo?.hasPaid).length;
    
    if (unpaidCount > 0) {
      const reminderInterval = setInterval(() => {
        sendPaymentReminder(unpaidCount);
      }, 30 * 60 * 1000); // 30 minutes

      return () => clearInterval(reminderInterval);
    }
  }, [wonAuctions]);

  const triggerPulseAnimation = () => {
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.2,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1.1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    let updatedItems = [...items];
    
    if (searchQuery.trim()) {
      const lowercasedQuery = searchQuery.toLowerCase();
      updatedItems = updatedItems.filter(item =>
        item.title.toLowerCase().includes(lowercasedQuery) ||
        item.description.toLowerCase().includes(lowercasedQuery)
      );
    }

    if (selectedCategory !== 'All') {
      updatedItems = updatedItems.filter(item => item.category === selectedCategory);
    }

    setFilteredItems(updatedItems);
  }, [searchQuery, selectedCategory, items]);

  const unpaidCount = wonAuctions.filter(a => !a.paymentInfo?.hasPaid).length;

  const handleCartPress = () => {
    if (unpaidCount > 0) {
      Alert.alert(
        'Pending Payments',
        `You have ${unpaidCount} unpaid auction(s). Complete your payments in the checkout screen.`,
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Go to Checkout', onPress: () => router.push('/checkout') }
        ]
      );
    } else {
      router.push('/checkout');
    }
  };

  const formatTimeLeft = (endTime: number) => {
    const now = Date.now();
    const timeLeft = endTime - now;
    if (timeLeft <= 0) return 'Ended';
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  const handleAuctionPress = (auctionId: string) => {
    router.push(`/auctionDetails?id=${auctionId}`);
  };

  const getDisplayImage = (images: Item['images']) => {
    if (!images || !Array.isArray(images) || images.length === 0) return null;
    const firstImage = images[0];
    if (!firstImage) return null;
    
    if (typeof firstImage === 'object' && 
        !Array.isArray(firstImage) && 
        ('url' in firstImage || 'displayUrl' in firstImage || 'thumbUrl' in firstImage)) {
      const imageUrl = firstImage.displayUrl || firstImage.url || firstImage.thumbUrl;
      if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
        return imageUrl;
      }
      return null;
    }
    
    if (typeof firstImage === 'string' && firstImage.trim().length > 0) {
      return firstImage;
    }
    
    return null;
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      
      {showConfetti && (
        <ConfettiCannon
          count={200}
          origin={{ x: -10, y: 0 }}
          fadeOut={true}
          autoStart={true}
        />
      )}

      <ScrollView style={styles.scroll}>
        <View style={styles.container}>
          {wonAuctions.length > 0 && (
            <View style={styles.winningBanner}>
              <Text style={styles.winningText}>
                🎉 You've won {wonAuctions.length} auction(s)! {unpaidCount > 0 && `${unpaidCount} need payment.`}
              </Text>
            </View>
          )}

          <View style={styles.header}>
            <Text style={styles.headerText}>Active Auctions</Text>
            
            {unpaidCount > 0 && (
              <View style={styles.notificationTextContainer}>
                <Text style={styles.notificationText}>
                  {unpaidCount} unpaid
                </Text>
              </View>
            )}
            
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity 
                style={styles.cartButton}
                onPress={handleCartPress}
              >
                <View style={styles.cartIconContainer}>
                  <View style={styles.cartIcon}>
                    <View style={styles.cartBody} />
                    <View style={styles.cartHandle} />
                    <View style={styles.cartWheel1} />
                    <View style={styles.cartWheel2} />
                  </View>
                  {unpaidCount > 0 && (
                    <View style={[
                      styles.badge,
                      unpaidCount > 9 && styles.badgeLarge
                    ]}>
                      <Text style={styles.badgeText}>
                        {unpaidCount > 9 ? '9+' : unpaidCount}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>
          
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by keyword..."
              placeholderTextColor="#888"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          
          <View style={styles.categoryFilterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {CATEGORIES.map(category => (
                <TouchableOpacity
                  key={category}
                  style={[
                    styles.categoryButton,
                    selectedCategory === category && styles.selectedCategoryButton
                  ]}
                  onPress={() => setSelectedCategory(category)}
                >
                  <Text style={[
                    styles.categoryButtonText,
                    selectedCategory === category && styles.selectedCategoryButtonText
                  ]}>
                    {category}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007bff" />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.noItemsContainer}>
              <Text style={styles.noItemsText}>No active auctions available right now.</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.noItemsContainer}>
              <Text style={styles.noItemsText}>No auctions match your search criteria.</Text>
              <Text style={styles.debugText}>Try changing your search or category filter.</Text>
            </View>
          ) : (
            filteredItems.map((item) => {
              const displayImage = getDisplayImage(item.images);
              return (
                <TouchableOpacity 
                  key={item.id} 
                  style={styles.card}
                  onPress={() => handleAuctionPress(item.id)}
                  activeOpacity={0.7}
                >
                  {displayImage ? (
                    <Image 
                      source={{ uri: displayImage }} 
                      style={styles.image}
                      onError={(error) => console.log('Image failed to load:', displayImage, error.nativeEvent.error)}
                    />
                  ) : (
                    <View style={styles.placeholderImage}>
                      <Text style={styles.placeholderText}>No Image</Text>
                    </View>
                  )}
                  <Text style={styles.name}>{item.title}</Text>
                  <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
                  <View style={styles.categoryContainer}>
                    <Text style={styles.category}>{item.category}</Text>
                    <Text style={styles.condition}>{item.condition}</Text>
                  </View>
                  <View style={styles.priceContainer}>
                    <Text style={styles.startPrice}>Starting: Ksh {item.startingBid.toLocaleString()}</Text>
                    <Text style={styles.currentBid}>Current Bid: Ksh {item.currentBid.toLocaleString()}</Text>
                  </View>
                  <Text style={styles.auctioneer}>By: {item.auctioneerName}</Text>
                  <Text style={styles.timeLeft}>{formatTimeLeft(item.endTime)}</Text>
                  <View style={styles.tapHint}>
                    <Text style={styles.tapHintText}>Tap to view details & bid</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  container: {
    paddingBottom: 16,
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '95%',
    paddingTop: 50,
    paddingBottom: 10,
  },
  headerText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  cartButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    position: 'relative',
    backgroundColor: '#f8f9fa',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  cartIconContainer: {
    position: 'relative',
    width: 24,
    height: 20,
  },
  cartIcon: {
    width: 24,
    height: 20,
    position: 'relative',
  },
  cartBody: {
    width: 20,
    height: 14,
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 2,
    position: 'absolute',
    top: 2,
    left: 2,
  },
  cartHandle: {
    width: 8,
    height: 8,
    borderWidth: 2,
    borderColor: '#333',
    borderBottomWidth: 0,
    borderRadius: 4,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  cartWheel1: {
    width: 4,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    position: 'absolute',
    bottom: 0,
    left: 6,
  },
  cartWheel2: {
    width: 4,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    position: 'absolute',
    bottom: 0,
    right: 4,
  },
  badge: {
    position: 'absolute',
    right: -12,
    top: -12,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeLarge: {
    minWidth: 28,
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  notificationTextContainer: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  notificationText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  searchContainer: {
    width: '95%',
    marginBottom: 16,
  },
  searchInput: {
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E1E5E9',
    color: '#333',
  },
  categoryFilterContainer: {
    width: '100%',
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  categoryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#007bff',
  },
  selectedCategoryButton: {
    backgroundColor: '#007bff',
  },
  categoryButtonText: {
    color: '#007bff',
    fontWeight: '600',
    fontSize: 14,
  },
  selectedCategoryButtonText: {
    color: '#fff',
  },
  card: {
    width: '95%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#E1E5E9',
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#E1E5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#999',
    fontSize: 16,
    fontWeight: '500',
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    color: '#333',
    lineHeight: 24,
  },
  description: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  categoryContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  category: {
    fontSize: 12,
    color: '#007bff',
    backgroundColor: '#E8F4FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontWeight: '500',
  },
  condition: {
    fontSize: 12,
    color: '#28a745',
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontWeight: '500',
  },
  priceContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  startPrice: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  currentBid: {
    fontSize: 18,
    color: '#007bff',
    fontWeight: 'bold',
  },
  auctioneer: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  timeLeft: {
    fontSize: 14,
    color: '#ff6b35',
    fontWeight: '600',
    marginTop: 4,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tapHint: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#007bff',
    borderRadius: 20,
  },
  tapHintText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  noItemsContainer: {
    marginTop: 50,
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  noItemsText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '500',
  },
  debugText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  winningBanner: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    width: '95%',
  },
  winningText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});