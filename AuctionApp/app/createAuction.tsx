import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
  Platform
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ref, push, set, serverTimestamp } from 'firebase/database';
import { auth, rtdb } from './firebase/firebaseConfig';

const IMGBB_API_KEY = 'ff41b9395ae4b0f2851b0048671c9db1';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

export default function CreateAuction() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startingBid: '',
    duration: '60', // minutes
    category: 'Electronics',
    condition: 'New'
  });
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const categories = ['Electronics', 'Fashion', 'Home & Garden', 'Sports', 'Collectibles', 'Other'];
  const conditions = ['New', 'Like New', 'Good', 'Fair', 'Poor'];

  // Helper function to determine auction status based on end time
  const getAuctionStatus = (endTime) => {
    const now = Date.now();
    if (now >= endTime) {
      return 'completed';
    }
    return 'active';
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant photo library access to add images');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8, // Slightly higher quality for better ImgBB results
        aspect: [4, 3],
        allowsEditing: false,
        base64: true, // We need base64 for ImgBB
      });

      if (!result.canceled && result.assets) {
        const remainingSlots = 5 - images.length;
        const newImages = result.assets.slice(0, remainingSlots);
        setImages(prevImages => [...prevImages, ...newImages]);
        
        if (result.assets.length > remainingSlots) {
          Alert.alert('Image limit', `Only ${remainingSlots} more images can be added (max 5 total)`);
        }
      }
    } catch (error) {
      console.error('Error picking images:', error);
      Alert.alert('Error', 'Failed to pick images');
    }
  };

  const removeImage = (index) => {
    setImages(prevImages => prevImages.filter((_, i) => i !== index));
  };

  // ImgBB upload function with comprehensive error handling
  const uploadImageToImgBB = async (base64Image, filename = 'auction_image') => {
    try {
      const formData = new FormData();
      formData.append('key', IMGBB_API_KEY);
      formData.append('image', base64Image);
      formData.append('name', filename);
      formData.append('expiration', '15552000'); // 6 months in seconds

      const response = await fetch(IMGBB_UPLOAD_URL, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || `HTTP ${response.status}: Upload failed`);
      }

      return {
        url: result.data.url,
        displayUrl: result.data.display_url,
        thumbUrl: result.data.thumb.url,
        deleteUrl: result.data.delete_url,
      };
    } catch (error) {
      console.error('ImgBB upload error:', error);
      throw new Error(`Image upload failed: ${error.message}`);
    }
  };

  const uploadImages = async (auctionId) => {
    const imageData = [];
    const failedUploads = [];
    
    for (let i = 0; i < images.length; i++) {
      try {
        const image = images[i];
        setUploadProgress(((i + 1) / images.length) * 100);
        
        if (!image.base64) {
          throw new Error('No base64 data available for image');
        }

        // Create filename with auction context
        const timestamp = Date.now();
        const fileExtension = image.uri.split('.').pop()?.toLowerCase() || 'jpg';
        const filename = `auction_${auctionId}_${timestamp}_${i}`;
        
        const uploadResult = await uploadImageToImgBB(image.base64, filename);
        
        imageData.push({
          url: uploadResult.url,
          displayUrl: uploadResult.displayUrl,
          thumbUrl: uploadResult.thumbUrl,
          deleteUrl: uploadResult.deleteUrl,
          originalName: image.fileName || `image_${i}`,
          uploadedAt: new Date().toISOString(),
          index: i
        });
        
        console.log(`Successfully uploaded image ${i + 1}/${images.length} to ImgBB`);
        
      } catch (error) {
        console.error(`Error uploading image ${i}:`, error);
        failedUploads.push({ index: i, error: error.message });
      }
    }
    
    setUploadProgress(0);
    
    // Warn about failed uploads but don't block auction creation
    if (failedUploads.length > 0) {
      const failedCount = failedUploads.length;
      const successCount = imageData.length;
      Alert.alert(
        'Upload Warning', 
        `${failedCount} image(s) failed to upload. Proceeding with ${successCount} successfully uploaded image(s).`
      );
    }
    
    return imageData;
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      Alert.alert('Validation Error', 'Please enter an auction title');
      return false;
    }
    
    if (formData.title.trim().length < 3) {
      Alert.alert('Validation Error', 'Auction title must be at least 3 characters long');
      return false;
    }
    
    if (!formData.description.trim()) {
      Alert.alert('Validation Error', 'Please enter a description');
      return false;
    }
    
    if (formData.description.trim().length < 10) {
      Alert.alert('Validation Error', 'Description must be at least 10 characters long');
      return false;
    }
    
    const bidValue = parseFloat(formData.startingBid);
    if (!formData.startingBid || isNaN(bidValue) || bidValue <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid starting bid amount');
      return false;
    }
    
    if (bidValue < 0.01) {
      Alert.alert('Validation Error', 'Starting bid must be at least $0.01');
      return false;
    }
    
    if (bidValue > 10000) {
      Alert.alert('Validation Error', 'Starting bid cannot exceed $10,000');
      return false;
    }
    
    return true;
  };

  const createAuction = async () => {
    if (!validateForm()) {
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      Alert.alert('Authentication Error', 'Please log in to create an auction');
      return;
    }

    setLoading(true);
    let auctionRef = null;
    
    try {
      // Create auction reference first
      auctionRef = push(ref(rtdb, 'auctions'));
      const auctionId = auctionRef.key;

      // Upload images to ImgBB if any
      let imageData = [];
      if (images.length > 0) {
        console.log(`Starting upload of ${images.length} images to ImgBB...`);
        imageData = await uploadImages(auctionId);
        console.log(`Successfully uploaded ${imageData.length} images to ImgBB`);
      }

      // Calculate end time
      const endTime = Date.now() + (parseInt(formData.duration) * 60 * 1000);
      
      // Prepare auction data with dynamic status based on end time
      const auctionData = {
        id: auctionId,
        title: formData.title.trim(),
        description: formData.description.trim(),
        startingBid: parseFloat(formData.startingBid),
        currentBid: parseFloat(formData.startingBid),
        category: formData.category,
        condition: formData.condition,
        images: imageData, // Array of ImgBB image objects
        imageCount: imageData.length,
        auctioneerId: user.uid,
        auctioneerName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
        auctioneerEmail: user.email,
        status: getAuctionStatus(endTime), // Dynamic status based on end time
        createdAt: serverTimestamp(),
        endTime: endTime,
        duration: parseInt(formData.duration),
        bidders: {},
        bids: {},
        totalBids: 0,
        highestBidder: null,
        watchers: {},
        views: 0,
        // Additional metadata
        platform: Platform.OS,
        version: '1.0.0',
        imageProvider: 'imgbb'
      };

      // Save auction to Firebase Realtime Database
      await set(auctionRef, auctionData);

      // Add to user's auctions list for efficient querying with dynamic status
      const userAuctionRef = ref(rtdb, `users/${user.uid}/auctions/${auctionId}`);
      await set(userAuctionRef, {
        auctionId: auctionId,
        title: formData.title.trim(),
        status: getAuctionStatus(endTime), // Also update user's auction list with dynamic status
        createdAt: serverTimestamp(),
        endTime: endTime,
        imageCount: imageData.length,
        startingBid: parseFloat(formData.startingBid)
      });

      // Success handling
      const successMessage = imageData.length > 0 
        ? `Auction created successfully with ${imageData.length} image(s)!`
        : 'Auction created successfully!';

      Alert.alert(
        'Success', 
        successMessage,
        [
          { 
            text: 'OK', 
            onPress: () => {
              // Reset form
              setFormData({
                title: '',
                description: '',
                startingBid: '',
                duration: '60',
                category: 'Electronics',
                condition: 'New'
              });
              setImages([]);
              router.back();
            }
          }
        ]
      );

    } catch (error) {
      console.error('Error creating auction:', error);
      
      // Enhanced error handling with specific ImgBB and Firebase errors
      let errorMessage = 'Failed to create auction. Please try again.';
      
      if (error.message.includes('Image upload failed')) {
        errorMessage = 'Failed to upload images. Please check your internet connection and try again.';
      } else if (error.code === 'database/permission-denied') {
        errorMessage = 'Database permission denied. Please check your Firebase database rules.';
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'User not authenticated. Please log in again.';
      } else if (error.message.includes('Network')) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error.message.includes('quota')) {
        errorMessage = 'Upload quota exceeded. Please try again later.';
      }
      
      // If auction was partially created, we should ideally clean up
      // This is a limitation of using external services - consider implementing
      // a cleanup mechanism or transaction-like behavior
      
      Alert.alert('Error', errorMessage);

    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ 
        headerShown: true, 
        title: 'Create Auction',
        headerStyle: { backgroundColor: '#007BFF' },
        headerTitleStyle: { color: '#FFF' },
        headerTintColor: '#FFF'
      }} />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.form}>
          {/* Title Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Auction Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter auction title"
              value={formData.title}
              onChangeText={(text) => setFormData({...formData, title: text})}
              maxLength={100}
            />
            <Text style={styles.charCounter}>{formData.title.length}/100</Text>
          </View>

          {/* Description */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe your item in detail"
              value={formData.description}
              onChangeText={(text) => setFormData({...formData, description: text})}
              multiline
              numberOfLines={4}
              maxLength={500}
            />
            <Text style={styles.charCounter}>{formData.description.length}/500</Text>
          </View>

          {/* Starting Bid */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Starting Bid ($) *</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              value={formData.startingBid}
              onChangeText={(text) => {
                // Enhanced input validation for currency
                const cleanedText = text.replace(/[^0-9.]/g, '');
                const parts = cleanedText.split('.');
                if (parts.length > 2) {
                  return;
                }
                if (parts[1] && parts[1].length > 2) {
                  return;
                }
                setFormData({...formData, startingBid: cleanedText});
              }}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Category */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.categoryContainer}>
                {categories.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.categoryButton,
                      formData.category === category && styles.categoryButtonActive
                    ]}
                    onPress={() => setFormData({...formData, category})}
                  >
                    <Text style={[
                      styles.categoryText,
                      formData.category === category && styles.categoryTextActive
                    ]}>
                      {category}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Condition */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Condition</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.categoryContainer}>
                {conditions.map((condition) => (
                  <TouchableOpacity
                    key={condition}
                    style={[
                      styles.categoryButton,
                      formData.condition === condition && styles.categoryButtonActive
                    ]}
                    onPress={() => setFormData({...formData, condition})}
                  >
                    <Text style={[
                      styles.categoryText,
                      formData.condition === condition && styles.categoryTextActive
                    ]}>
                      {condition}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Duration */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Auction Duration</Text>
            <View style={styles.durationContainer}>
              {[
                { value: '3', label: '3m' },
                { value: '60', label: '1h' },
                { value: '120', label: '2h' },
                { value: '240', label: '4h' },
                { value: '480', label: '8h' },
                { value: '1440', label: '24h' }
              ].map((duration) => (
                <TouchableOpacity
                  key={duration.value}
                  style={[
                    styles.durationButton,
                    formData.duration === duration.value && styles.durationButtonActive
                  ]}
                  onPress={() => setFormData({...formData, duration: duration.value})}
                >
                  <Text style={[
                    styles.durationText,
                    formData.duration === duration.value && styles.durationTextActive
                  ]}>
                    {duration.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Images */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Images ({images.length}/5)</Text>
            <TouchableOpacity 
              style={[styles.imageButton, images.length >= 5 && styles.imageButtonDisabled]} 
              onPress={pickImage}
              disabled={images.length >= 5}
            >
              <Ionicons name="camera-outline" size={24} color={images.length >= 5 ? "#CCC" : "#007BFF"} />
              <Text style={[styles.imageButtonText, images.length >= 5 && styles.imageButtonTextDisabled]}>
                {images.length >= 5 ? 'Maximum Images Added' : 'Add Photos'}
              </Text>
            </TouchableOpacity>
            
            {/* Upload Progress */}
            {loading && uploadProgress > 0 && (
              <View style={styles.progressContainer}>
                <Text style={styles.progressText}>Uploading to ImgBB... {Math.round(uploadProgress)}%</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                </View>
              </View>
            )}
            
            {images.length > 0 && (
              <ScrollView horizontal style={styles.imagePreview} showsHorizontalScrollIndicator={false}>
                {images.map((image, index) => (
                  <View key={index} style={styles.imageContainer}>
                    <Image source={{ uri: image.uri }} style={styles.previewImage} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => removeImage(index)}
                    >
                      <Ionicons name="close-circle" size={24} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Create Button */}
          <TouchableOpacity
            style={[styles.createButton, loading && styles.createButtonDisabled]}
            onPress={createAuction}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="hammer-outline" size={20} color="#FFF" />
                <Text style={styles.createButtonText}>Create Auction</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  form: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E1E5E9',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFF',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  charCounter: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 4,
  },
  categoryContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E1E5E9',
    backgroundColor: '#FFF',
  },
  categoryButtonActive: {
    backgroundColor: '#007BFF',
    borderColor: '#007BFF',
  },
  categoryText: {
    fontSize: 14,
    color: '#666',
  },
  categoryTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  durationContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  durationButton: {
    flex: 1,
    minWidth: 60,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E1E5E9',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  durationButtonActive: {
    backgroundColor: '#007BFF',
    borderColor: '#007BFF',
  },
  durationText: {
    fontSize: 14,
    color: '#666',
  },
  durationTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderWidth: 2,
    borderColor: '#007BFF',
    borderStyle: 'dashed',
    borderRadius: 8,
    gap: 8,
  },
  imageButtonDisabled: {
    borderColor: '#CCC',
  },
  imageButtonText: {
    color: '#007BFF',
    fontSize: 16,
    fontWeight: '600',
  },
  imageButtonTextDisabled: {
    color: '#CCC',
  },
  progressContainer: {
    marginTop: 12,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E1E5E9',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007BFF',
    borderRadius: 2,
  },
  imagePreview: {
    marginTop: 12,
  },
  imageContainer: {
    position: 'relative',
    marginRight: 8,
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FFF',
    borderRadius: 12,
  },
  createButton: {
    backgroundColor: '#007BFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    gap: 8,
    marginTop: 20,
  },
  createButtonDisabled: {
    backgroundColor: '#CCC',
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
});