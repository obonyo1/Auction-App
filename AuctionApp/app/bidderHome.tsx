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
  Pressable,
  Image,
  Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useAuth } from './context/authContext';

const { width } = Dimensions.get('window');
const cardWidth = (width - 60) / 2; 
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  limit 
} from 'firebase/firestore';
import { db } from './firebase/firebaseConfig';
import { signOut } from 'firebase/auth';
import { auth } from './firebase/firebaseConfig';

interface AuctionItem {
  id: string;
  title: string;
  description: string;
  startingBid: number;
  currentBid: number;
  category: string;
  condition: string;
  images: string[];
  status: 'active' | 'completed' | 'upcoming';
  endTime: Date;
  createdAt: Date;
}

export default function AuctioneerHome() {
  const router = useRouter();
  const { username } = useAuth();
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [menuVisible, setMenuVisible] = useState<boolean>(false);

  const fetchAuctions = async () => {
    try {
      const auctionsRef = collection(db, 'auctions');
      const q = query(
        auctionsRef,
        where('status', 'in', ['active', 'upcoming']),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      const querySnapshot = await getDocs(q);
      const auctionsList: AuctionItem[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        auctionsList.push({
          id: doc.id,
          title: data.title || 'Untitled Auction',
          description: data.description || '',
          startingBid: data.startingBid || 0,
          currentBid: data.currentBid || data.startingBid || 0,
          category: data.category || 'Other',
          condition: data.condition || 'Used',
          images: data.images || [],
          status: data.status,
          endTime: data.endTime?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date(),
        });
      });

      setAuctions(auctionsList);
    } catch (error) {
      console.error('Error fetching auctions:', error);
      Alert.alert('Error', 'Failed to load auctions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAuctions();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAuctions();
  };

  const handleLogout = async () => {
    setMenuVisible(false);
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

  const handleProfile = () => {
    setMenuVisible(false);
    router.push('/profile' as any);
  };

  const handleDeleteAccount = () => {
    setMenuVisible(false);
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            //delete account here
            Alert.alert('Info', 'Delete account functionality needs to be implemented');
          }
        }
      ]
    );
  };

  const handleCart = () => {
    router.push('/cart' as any);
  };

  const renderAuctionItem = ({ item }: { item: AuctionItem }) => (
    <TouchableOpacity 
      style={styles.auctionCard}
      onPress={() => {
        router.push(`/auctionDetails/${item.id}` as any);
      }}
    >
      <View style={styles.imageContainer}>
        {item.images && item.images.length > 0 ? (
          <Image 
            source={{ uri: item.images[0] }} 
            style={styles.auctionImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholderImage}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{item.category}</Text>
        </View>
      </View>
      
      <View style={styles.cardContent}>
        <Text style={styles.auctionTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.auctionDescription} numberOfLines={2}>
          {item.description}
        </Text>
        
        <View style={styles.conditionContainer}>
          <Text style={styles.conditionLabel}>Condition: </Text>
          <Text style={styles.conditionValue}>{item.condition}</Text>
        </View>
        
        <View style={styles.bidContainer}>
          <View style={styles.bidInfo}>
            <Text style={styles.bidLabel}>Starting Bid</Text>
            <Text style={styles.bidAmount}>${item.startingBid.toFixed(2)}</Text>
          </View>
          <View style={styles.bidInfo}>
            <Text style={styles.bidLabel}>Current Bid</Text>
            <Text style={[styles.bidAmount, styles.currentBid]}>${item.currentBid.toFixed(2)}</Text>
          </View>
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
          <Text style={styles.loadingText}>Loading auctions...</Text>
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
          
          <View style={styles.rightHeaderButtons}>
            {/* Cart Button */}
            <TouchableOpacity 
              style={styles.cartButton}
              onPress={handleCart}
            >
              <View style={styles.cartIcon}>
                <View style={styles.cartBody} />
                <View style={styles.cartHandle} />
                <View style={styles.cartWheel1} />
                <View style={styles.cartWheel2} />
              </View>
            </TouchableOpacity>

            {/* Hamburger Menu Button */}
            <TouchableOpacity 
              style={styles.menuButton}
              onPress={() => setMenuVisible(true)}
            >
              <View style={styles.menuIcon}>
                <View style={styles.menuLine} />
                <View style={styles.menuLine} />
                <View style={styles.menuLine} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hamburger Menu Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={menuVisible}
          onRequestClose={() => setMenuVisible(false)}
        >
          <Pressable 
            style={styles.modalOverlay}
            onPress={() => setMenuVisible(false)}
          >
            <View style={styles.menuContainer}>
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={handleProfile}
              >
                <Text style={styles.menuItemText}>Profile</Text>
              </TouchableOpacity>
              
              <View style={styles.menuDivider} />
              
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={handleLogout}
              >
                <Text style={styles.menuItemText}>Logout</Text>
              </TouchableOpacity>
              
              <View style={styles.menuDivider} />
              
              <TouchableOpacity 
                style={[styles.menuItem, styles.deleteMenuItem]}
                onPress={handleDeleteAccount}
              >
                <Text style={[styles.menuItemText, styles.deleteMenuItemText]}>Delete Account</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Welcome</Text>
          <Text style={styles.welcomeUsername}>{username || 'Auctioneer'}</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Auctions Grid */}
        <View style={styles.auctionsSection}>
          <Text style={styles.sectionTitle}>Live Auctions</Text>
          
          {auctions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No active auctions found. Check back later!
              </Text>
            </View>
          ) : (
            <FlatList
              data={auctions}
              renderItem={renderAuctionItem}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.row}
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
    backgroundColor: '#f8f9fa',
    paddingTop: 50, // Account for status bar
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
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
    backgroundColor: '#fff',
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
  rightHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cartButton: {
    padding: 10,
    marginRight: 10,
  },
  cartIcon: {
    width: 24,
    height: 24,
    position: 'relative',
  },
  cartBody: {
    width: 18,
    height: 12,
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 2,
    position: 'absolute',
    top: 4,
    left: 3,
  },
  cartHandle: {
    width: 6,
    height: 6,
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
  },
  cartWheel1: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    position: 'absolute',
    bottom: 2,
    left: 6,
  },
  cartWheel2: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    position: 'absolute',
    bottom: 2,
    right: 6,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    paddingTop: 100,
    paddingRight: 20,
  },
  menuContainer: {
    backgroundColor: '#fff',
    marginLeft: 'auto',
    marginRight: 0,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    minWidth: 180,
  },
  menuItem: {
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  deleteMenuItem: {
    backgroundColor: '#ffebee',
  },
  deleteMenuItemText: {
    color: '#d32f2f',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  welcomeSection: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#fff',
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
  auctionsSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    marginTop: 10,
  },
  listContainer: {
    paddingBottom: 20,
  },
  row: {
    justifyContent: 'space-between',
  },
  auctionCard: {
    width: 'cardWidth', // Note: you'll need to define cardWidth variable
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  imageContainer: {
    position: 'relative',
  },
  auctionImage: {
    width: '100%',
    height: 140,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  placeholderImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#f0f0f0',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#999',
    fontSize: 14,
  },
  categoryBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 123, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardContent: {
    padding: 12,
  },
  auctionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
    lineHeight: 20,
  },
  auctionDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
    lineHeight: 18,
  },
  conditionContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  conditionLabel: {
    fontSize: 12,
    color: '#999',
  },
  conditionValue: {
    fontSize: 12,
    color: '#28a745',
    fontWeight: '600',
  },
  bidContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bidInfo: {
    flex: 1,
  },
  bidLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
  },
  bidAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  currentBid: {
    color: '#007bff',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
});