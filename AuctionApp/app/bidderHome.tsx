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
const CATEGORIES = ['All', 'Electronics', 'Fashion', 'Home & Garden', 'Sports', 'Collectibles', 'Other'];

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

  const handleCartPress = () => {
    router.push('/checkout' as any);
  };

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

// Updated function to handle ImgBB image objects with proper null checks
const getDisplayImage = (images: Item['images']) => {
  // Return null immediately if no images or empty array
  if (!images || !Array.isArray(images) || images.length === 0) {
    return null;
  }
  
  const firstImage = images[0];
  
  // Handle null or undefined entries
  if (!firstImage) {
    return null;
  }
  
  // Handle ImgBB object format - check for specific properties to confirm it's an ImgBB object
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
  
  // Handle legacy string format (backward compatibility)
  if (typeof firstImage === 'string' && firstImage.trim().length > 0) {
    return firstImage;
  }
  
  // If we get here, the data format is unexpected
  console.warn('Unexpected image format:', firstImage);
  return null;
};

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.scroll}>
        <View style={styles.container}>
          {/* Header with Cart */}
          <View style={styles.header}>
            <Text style={styles.headerText}>Active Auctions</Text>
            <TouchableOpacity 
              style={styles.cartButton}
              onPress={handleCartPress}
            >
              <View style={styles.cartIcon}>
                <View style={styles.cartBody} />
                <View style={styles.cartHandle} />
                <View style={styles.cartWheel1} />
                <View style={styles.cartWheel2} />
              </View>
            </TouchableOpacity>
          </View>
          
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
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
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