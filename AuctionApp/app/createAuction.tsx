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
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, rtdb, storage } from './firebase/firebaseConfig';

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

  const pickImage = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant photo library access to add images');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.7, // Reduced quality for faster upload
        aspect: [4, 3],
        allowsEditing: false,
        base64: false, // We don't need base64
      });

      if (!result.canceled && result.assets) {
        // Limit to 5 images total
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

  // Improved image upload function with better error handling
  const uploadImages = async (auctionId) => {
    const imageUrls = [];
    
    for (let i = 0; i < images.length; i++) {
      try {
        const image = images[i];
        setUploadProgress(((i + 1) / images.length) * 100);
        
        // Create a blob from the image URI
        const response = await fetch(image.uri);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        
        const blob = await response.blob();
        
        // Validate blob
        if (!blob || blob.size === 0) {
          throw new Error('Invalid image data');
        }
        
        // Create unique filename with better naming
        const timestamp = Date.now();
        const fileExtension = image.uri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `image_${timestamp}_${i}.${fileExtension}`;
        const imageRef = storageRef(storage, `auctions/${auctionId}/${fileName}`);
        
        // Upload with metadata
        const metadata = {
          contentType: `image/${fileExtension}`,
          customMetadata: {
            uploadedBy: auth.currentUser?.uid || 'unknown',
            uploadedAt: new Date().toISOString(),
            originalName: image.fileName || `image_${i}`
          }
        };
        
        await uploadBytes(imageRef, blob, metadata);
        const url = await getDownloadURL(imageRef);
        imageUrls.push(url);
        
        console.log(`Successfully uploaded image ${i + 1}/${images.length}`);
        
      } catch (error) {
        console.error(`Error uploading image ${i}:`, error);
        
        // Show specific error message
        Alert.alert(
          'Upload Warning', 
          `Failed to upload image ${i + 1}. The auction will be created with the successfully uploaded images.`
        );
        
        // Continue with other images even if one fails
      }
    }
    
    setUploadProgress(0);
    return imageUrls;
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      Alert.alert('Validation Error', 'Please enter an auction title');
      return false;
    }
    
    if (!formData.description.trim()) {
      Alert.alert('Validation Error', 'Please enter a description');
      return false;
    }
    
    const bidValue = parseFloat(formData.startingBid);
    if (!formData.startingBid || isNaN(bidValue) || bidValue <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid starting bid amount');
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
    
    try {
      // Create auction reference
      const auctionRef = push(ref(rtdb, 'auctions'));
      const auctionId = auctionRef.key;

      // Upload images if any
      let imageUrls = [];
      if (images.length > 0) {
        console.log(`Starting upload of ${images.length} images...`);
        imageUrls = await uploadImages(auctionId);
        console.log(`Successfully uploaded ${imageUrls.length} images`);
      }

      // Calculate end time
      const endTime = Date.now() + (parseInt(formData.duration) * 60 * 1000);
      
      // Prepare auction data
      const auctionData = {
        id: auctionId,
        title: formData.title.trim(),
        description: formData.description.trim(),
        startingBid: parseFloat(formData.startingBid),
        currentBid: parseFloat(formData.startingBid),
        category: formData.category,
        condition: formData.condition,
        images: imageUrls, // This will be an array of URLs
        imageCount: imageUrls.length, // Add image count for easy reference
        auctioneerId: user.uid,
        auctioneerName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
        auctioneerEmail: user.email,
        status: 'active',
        createdAt: serverTimestamp(),
        endTime: endTime,
        duration: parseInt(formData.duration),
        bidders: {},
        bids: {},
        totalBids: 0,
        highestBidder: null,
        watchers: {},
        views: 0
      };

      // Save auction to database
      await set(auctionRef, auctionData);

      // Also add to user's auctions list for easy querying
      const userAuctionRef = ref(rtdb, `users/${user.uid}/auctions/${auctionId}`);
      await set(userAuctionRef, {
        auctionId: auctionId,
        title: formData.title.trim(),
        status: 'active',
        createdAt: serverTimestamp(),
        endTime: endTime,
        imageCount: imageUrls.length
      });

      Alert.alert(
        'Success', 
        `Auction created successfully with ${imageUrls.length} image(s)!`, 
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
      
      let errorMessage = 'Failed to create auction. Please try again.';
      
      if (error.code === 'storage/unauthorized') {
        errorMessage = 'Permission denied. Please check your Firebase storage rules.';
      } else if (error.code === 'database/permission-denied') {
        errorMessage = 'Database permission denied. Please check your Firebase database rules.';
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'User not authenticated. Please log in again.';
      } else if (error.code === 'storage/quota-exceeded') {
        errorMessage = 'Storage quota exceeded. Please try with fewer or smaller images.';
      }
      
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
                // Only allow numbers and one decimal point
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
                { value: '30', label: '30m' },
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
                <Text style={styles.progressText}>Uploading images... {Math.round(uploadProgress)}%</Text>
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