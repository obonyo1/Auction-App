import React, { useEffect, useState } from 'react';
import { 
  View, 
  Image, 
  Text, 
  ScrollView, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator,
  TextInput // Import TextInput
} from 'react-native';
import { Stack, router } from 'expo-router';
import { 
  getDatabase, 
  ref, 
  onValue, 
  // update, // Not used in this version, can be removed
  // off // Not used in this version, can be removed
} from 'firebase/database';

// Item type remains the same
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
};

// --- NEW: Define categories for filtering ---
// Add an 'All' option to reset the filter
const CATEGORIES = ['All', 'Electronics', 'Fashion', 'Home Goods', 'Art', 'Vehicles', 'Other'];

export default function bidderHome() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // --- NEW: State for search and filtering ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);

  // This useEffect fetches all active auctions and stores them in the `items` state
  useEffect(() => {
    const db = getDatabase();
    const auctionsRef = ref(db, 'auctions');

    const unsubscribe = onValue(
      auctionsRef,
      (snapshot) => {
        const loadedItems: Item[] = [];
        
        if (snapshot.exists()) {
          const data = snapshot.val();
          const currentTime = Date.now();
          
          Object.keys(data).forEach((key) => {
            const auction = data[key];
            const isActiveAndNotEnded = auction.status === 'active' && auction.endTime > currentTime;
            
            if (isActiveAndNotEnded) {
              loadedItems.push({
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
                auctioneerName: auction.auctioneerName || 'Anonymous'
              });
            }
          });
          
          loadedItems.sort((a, b) => a.endTime - b.endTime);
        }
        
        setItems(loadedItems);
        setLoading(false);
      },
      (error) => {
        console.error('Realtime Database error:', error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // --- NEW: This useEffect filters the items whenever the search query, category, or master items list changes ---
  useEffect(() => {
    let updatedItems = [...items];

    // 1. Filter by search query (checks title and description)
    if (searchQuery.trim()) {
      const lowercasedQuery = searchQuery.toLowerCase();
      updatedItems = updatedItems.filter(item =>
        item.title.toLowerCase().includes(lowercasedQuery) ||
        item.description.toLowerCase().includes(lowercasedQuery)
      );
    }

    // 2. Filter by category
    if (selectedCategory !== 'All') {
      updatedItems = updatedItems.filter(item => item.category === selectedCategory);
    }

    setFilteredItems(updatedItems);
  }, [searchQuery, selectedCategory, items]);


  const formatTimeLeft = (endTime: number) => {
    // ... (your existing formatTimeLeft function, no changes needed)
    const now = Date.now();
    const timeLeft = endTime - now;
    if (timeLeft <= 0) return 'Ended';
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    if (minutes > 0) return `${minutes}m left`;
    return `${seconds}s left`;
  };

  const handleAuctionPress = (auctionId: string) => {
    router.push(`/auctionDetails?id=${auctionId}`);
  };

  const getDisplayImage = (images: string[]) => {
    return images && images.length > 0 ? images[0] : null;
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Loading active auctions...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.scroll}>
        <View style={styles.container}>
          <Text style={styles.headerText}>Active Auctions</Text>
          
          {/* --- NEW: Search Bar --- */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by keyword..."
              placeholderTextColor="#888"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          
          {/* --- NEW: Category Filter --- */}
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

          {/* --- UPDATED: Conditional Rendering for "No Items" --- */}
          {items.length === 0 ? (
            <View style={styles.noItemsContainer}>
              <Text style={styles.noItemsText}>No active auctions available right now.</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.noItemsContainer}>
              <Text style={styles.noItemsText}>No auctions match your search criteria.</Text>
              <Text style={styles.debugText}>Try changing your search or category filter.</Text>
            </View>
          ) : (
            // --- UPDATED: Map over `filteredItems` instead of `items` ---
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
// --- UPDATED: Add new styles for search and filter UI ---
const styles = StyleSheet.create({
  // ... (keep all your existing styles)
  scroll: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  container: {
    paddingBottom: 16, // Use paddingBottom instead of padding to allow full-width elements
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
  headerText: {
    fontSize: 28,
    fontWeight: 'bold',
    marginVertical: 20,
    color: '#333',
    textAlign: 'center',
  },
  // --- NEW STYLES START HERE ---
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
  // --- NEW STYLES END HERE ---
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
});