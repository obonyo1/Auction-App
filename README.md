# Auction-App

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
  Image,
  Dimensions,
  KeyboardAvoidingView,
  Platform
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
  images?: string;
  winnerId?: string;
  winnerName?: string;
  winningBidTime?: number;
  paymentInfo?: PaymentInfo;
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
      
      // First try the new path structure
      const bidsRef = ref(db, `auctions/${auctionId}/bids`);
      
      const snapshot = await get(bidsRef);
      
      if (snapshot.exists()) {
        // New path structure exists
        const data = snapshot.val();
        const bids: BidInfo[] = Object.keys(data).map(key => ({
          id: key,
          bidderId: data[key].bidderId,
          bidderName: data[key].bidderName || 'Anonymous',
          bidAmount: data[key].amount,
          bidTime: data[key].timestamp,
          isWinning: data[key].isWinning || false
        }));
        
        setBidHistory(bids.sort((a, b) => b.bidAmount - a.bidAmount));
      } else {
        // Fallback to old path structure
        const oldBidsRef = ref(db, `bids/${auctionId}`);
        const oldSnapshot = await get(oldBidsRef);
        
        if (oldSnapshot.exists()) {
          const oldData = oldSnapshot.val();
          const bids: BidInfo[] = Object.keys(oldData).map(key => ({
            id: key,
            bidderId: oldData[key].bidderId,
            bidderName: oldData[key].bidderName || oldData[key].bidderUsername || 'Anonymous',
            bidAmount: oldData[key].amount || oldData[key].bidAmount,
            bidTime: oldData[key].timestamp || oldData[key].bidTime,
            isWinning: oldData[key].isWinning || false
          }));
          
          setBidHistory(bids.sort((a, b) => b.bidAmount - a.bidAmount));
        } else {
          setBidHistory([]);
        }
      }
    } catch (error) {
      console.error('Error fetching bid history:', error);
      Alert.alert('Error', 'Failed to load bid history');
    } finally {
      setLoadingBids(false);
    }
  };

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
                loadedAuctions.push({
                  id: key,
                  title: auction.title || 'Unknown Product',
                  description: auction.description || 'No description',
                  startingBid: auction.startPrice || auction.startingBid || 0,
                  currentBid: auction.currentBid || auction.startPrice || auction.startingBid || 0,
                  status: auction.status || (auction.endTime <= Date.now() ? 'completed' : 'active'),
                  endTime: auction.endTime || Date.now(),
                  createdAt: auction.createdAt || Date.now(),
                  auctioneerId: auction.auctioneerId,
                  images: auction.imageUrl || auction.images || '',
                  winnerId: auction.winnerId,
                  winnerName: auction.winnerName || auction.winnerUsername,
                  winningBidTime: auction.winningBidTime,
                  paymentInfo: auction.paymentInfo || { hasPaid: false, amountPaid: 0 }
                });
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

  // ... [rest of the component code remains the same until the AuctionDetailsModal]

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
              {/* ... [previous modal content remains the same until the bid history section] */}

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