import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  Alert, 
  TouchableOpacity, 
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Dimensions
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { ref, onValue, off, remove } from 'firebase/database';
import { collection, onSnapshot, doc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { rtdb, db } from './firebase/firebaseConfig'; // Import both databases

const { width: screenWidth } = Dimensions.get('window');

export default function AdminPanel() {
  const router = useRouter();
  const [auctioneers, setAuctioneers] = useState([]);
  const [biddersCount, setBiddersCount] = useState(0);
  const [auctioneersCount, setAuctioneersCount] = useState(0);
  const [auctionsData, setAuctionsData] = useState([]);
  const [totalAuctions, setTotalAuctions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [realTimeStats, setRealTimeStats] = useState({
    activeAuctions: 0,
    completedAuctions: 0,
    totalBids: 0,
    totalRevenue: 0
  });

  // Listener references for cleanup
  const [listeners, setListeners] = useState({
    auctionsListener: null,
    usersListener: null
  });

  useEffect(() => {
    // Set up real-time listeners for both databases
    setupRealTimeListeners();
    
    // Cleanup listeners on unmount
    return () => {
      cleanupListeners();
    };
  }, []);

  const setupRealTimeListeners = () => {
    // Listen for auction changes from Realtime Database
    const auctionsRef = ref(rtdb, 'auctions');
    const auctionsListener = onValue(auctionsRef, (snapshot) => {
      if (snapshot.exists()) {
        const auctionsData = snapshot.val();
        processAuctionsData(auctionsData);
      } else {
        // No auctions exist
        setAuctionsData(initializeWeeklyData());
        setTotalAuctions(0);
        setRealTimeStats({
          activeAuctions: 0,
          completedAuctions: 0,
          totalBids: 0,
          totalRevenue: 0
        });
      }
      setLoading(false);
      setRefreshing(false);
    }, (error) => {
      console.error('Error listening to auctions:', error);
      Alert.alert('Error', 'Failed to load real-time auction data');
      setLoading(false);
      setRefreshing(false);
    });

    // Listen for user changes from Firestore
    const usersRef = collection(db, 'users');
    const usersListener = onSnapshot(usersRef, (snapshot) => {
      try {
        const usersList = [];
        snapshot.forEach((doc) => {
          usersList.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        const auctioneersList = usersList.filter(user => user.role === 'auctioneer');
        const biddersCount = usersList.filter(user => user.role === 'bidder').length;
        
        setAuctioneers(auctioneersList);
        setAuctioneersCount(auctioneersList.length);
        setBiddersCount(biddersCount);
        
        // If this is the first load and auctions are already loaded, stop loading
        if (loading && auctionsData.length > 0) {
          setLoading(false);
        }
      } catch (error) {
        console.error('Error processing users data:', error);
        Alert.alert('Error', 'Failed to load user data');
      }
    }, (error) => {
      console.error('Error listening to users:', error);
      Alert.alert('Error', 'Failed to load real-time user data');
      setLoading(false);
      setRefreshing(false);
    });

    // Store listener references for cleanup
    setListeners({
      auctionsListener,
      usersListener
    });
  };

  const cleanupListeners = () => {
    // Clean up Realtime Database listener
    if (listeners.auctionsListener) {
      const auctionsRef = ref(rtdb, 'auctions');
      off(auctionsRef, 'value', listeners.auctionsListener);
    }
    
    // Clean up Firestore listener
    if (listeners.usersListener) {
      listeners.usersListener();
    }
  };

  const initializeWeeklyData = () => {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return daysOfWeek.map(day => ({ day, auctions: 0 }));
  };

  const processAuctionsData = (auctionsData) => {
    try {
      const auctions = Object.values(auctionsData);
      
      // Initialize weekly data
      const weeklyData = initializeWeeklyData();
      
      let totalAuctions = 0;
      let activeAuctions = 0;
      let completedAuctions = 0;
      let totalBids = 0;
      let totalRevenue = 0;
      
      const now = Date.now();
      
      // Process each auction
      auctions.forEach(auction => {
        totalAuctions += 1;
        
        // Count by creation day
        if (auction.createdAt) {
          let date;
          if (typeof auction.createdAt === 'object' && auction.createdAt.seconds) {
            // Firebase Timestamp
            date = new Date(auction.createdAt.seconds * 1000);
          } else if (typeof auction.createdAt === 'number') {
            // Unix timestamp
            date = new Date(auction.createdAt);
          } else {
            // Fallback
            date = new Date(auction.createdAt);
          }
          
          const dayIndex = date.getDay();
          weeklyData[dayIndex].auctions += 1;
        }
        
        // Calculate auction status based on end time
        const isActive = auction.endTime && now < auction.endTime;
        if (isActive) {
          activeAuctions += 1;
        } else {
          completedAuctions += 1;
        }
        
        // Count bids
        if (auction.totalBids) {
          totalBids += auction.totalBids;
        }
        
        // Calculate revenue (from completed auctions)
        if (!isActive && auction.currentBid && auction.currentBid > auction.startingBid) {
          totalRevenue += auction.currentBid;
        }
      });
      
      // Update state
      setAuctionsData(weeklyData);
      setTotalAuctions(totalAuctions);
      setRealTimeStats({
        activeAuctions,
        completedAuctions,
        totalBids,
        totalRevenue: Math.round(totalRevenue * 100) / 100 // Round to 2 decimal places
      });
      
    } catch (error) {
      console.error('Error processing auctions data:', error);
      setAuctionsData(initializeWeeklyData());
      setTotalAuctions(0);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    // Real-time listeners will automatically update the data
   
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const handleDeleteAuctioneer = async (userId, userEmail) => {
    Alert.alert(
      'Delete Auctioneer',
      `Are you sure you want to permanently delete ${userEmail}?\n\nThis will also delete all their auctions.`,
      [
        { 
          text: 'Cancel', 
          style: 'cancel' 
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(userId);
            try {
              // Delete user from Firestore
              const userRef = doc(db, 'users', userId);
              await deleteDoc(userRef);
              
              // Delete all auctions by this user from Realtime Database
              const auctionsRef = ref(rtdb, 'auctions');
              onValue(auctionsRef, async (snapshot) => {
                if (snapshot.exists()) {
                  const auctions = snapshot.val();
                  const userAuctions = Object.entries(auctions).filter(
                    ([_, auction]) => auction.auctioneerId === userId
                  );
                  
                  // Delete each auction
                  for (const [auctionId, _] of userAuctions) {
                    const auctionRef = ref(rtdb, `auctions/${auctionId}`);
                    await remove(auctionRef);
                  }
                }
              }, { onlyOnce: true });
              
              Alert.alert('Success', 'Auctioneer and their auctions deleted successfully');
            } catch (err) {
              console.error('Delete error:', err);
              Alert.alert('Error', 'Failed to delete auctioneer');
            } finally {
              setDeleting(null);
            }
          }
        }
      ]
    );
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    let date;
    if (typeof timestamp === 'object' && timestamp.seconds) {
      // Firestore Timestamp
      date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'object' && timestamp.toDate) {
      // Firestore Timestamp with toDate method
      date = timestamp.toDate();
    } else if (typeof timestamp === 'number') {
      // Unix timestamp
      date = new Date(timestamp);
    } else {
      // Fallback
      date = new Date(timestamp);
    }
    
    return date.toLocaleDateString();
  };

  const StatCard = ({ title, count, icon, color, subtitle }) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statContent}>
        <View style={styles.statTextContainer}>
          <Text style={styles.statTitle}>{title}</Text>
          <Text style={[styles.statCount, { color }]}>
            {typeof count === 'number' && title.includes('Revenue') ? `$${count.toFixed(2)}` : count}
          </Text>
          {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
        </View>
        <View style={[styles.statIcon, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
      </View>
    </View>
  );

  const UserCard = ({ user }) => (
    <View style={styles.userCard}>
      <View style={styles.userInfo}>
        <View style={styles.userHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {(user.username || user.email || 'U')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{user.username || user.displayName || 'No username'}</Text>
            <Text style={styles.userEmail}>{user.email || 'No email'}</Text>
            <Text style={styles.userMeta}>
              Joined: {formatDate(user.createdAt)}
            </Text>
            {user.emailVerified !== undefined && (
              <View style={styles.verificationContainer}>
                <Ionicons 
                  name={user.emailVerified ? 'checkmark-circle' : 'alert-circle'} 
                  size={16} 
                  color={user.emailVerified ? '#4CAF50' : '#FF9800'} 
                />
                <Text style={[
                  styles.verificationText,
                  { color: user.emailVerified ? '#4CAF50' : '#FF9800' }
                ]}>
                  {user.emailVerified ? 'Verified' : 'Unverified'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
      
      <TouchableOpacity
        style={[styles.deleteButton, deleting === user.id && styles.deleteButtonDisabled]}
        onPress={() => handleDeleteAuctioneer(user.id, user.email)}
        disabled={deleting === user.id}
      >
        {deleting === user.id ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <>
            <Ionicons name="trash-outline" size={16} color="#FFF" />
            <Text style={styles.deleteButtonText}>Delete</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  const CustomLineChart = ({ data }) => {
    const chartWidth = screenWidth - 80;
    const chartHeight = 200;
    const padding = 40;
    const maxValue = Math.max(...data.map(d => d.auctions)) || 1;
    
    const points = data.map((item, index) => {
      const x = padding + (index * (chartWidth - 2 * padding)) / (data.length - 1);
      const y = chartHeight - padding - ((item.auctions / maxValue) * (chartHeight - 2 * padding));
      return { x, y, value: item.auctions, day: item.day };
    });

    return (
      <View style={styles.chartSvgContainer}>
        <Svg width={chartWidth} height={chartHeight + 40}>
          <G>
            {[0, 1, 2, 3, 4].map((i) => {
              const y = chartHeight - padding - (i * (chartHeight - 2 * padding)) / 4;
              return (
                <Line
                  key={`grid-${i}`}
                  x1={padding}
                  y1={y}
                  x2={chartWidth - padding}
                  y2={y}
                  stroke="#E0E0E0"
                  strokeDasharray="3,3"
                />
              );
            })}
          </G>
          
          <G>
            {points.slice(0, -1).map((point, index) => (
              <Line
                key={`line-${index}`}
                x1={point.x}
                y1={point.y}
                x2={points[index + 1].x}
                y2={points[index + 1].y}
                stroke="#007BFF"
                strokeWidth="3"
              />
            ))}
          </G>
          
          <G>
            {points.map((point, index) => (
              <Circle
                key={`point-${index}`}
                cx={point.x}
                cy={point.y}
                r="5"
                fill="#007BFF"
                stroke="#FFF"
                strokeWidth="2"
              />
            ))}
          </G>
          
          <G>
            {[0, 1, 2, 3, 4].map((i) => {
              const y = chartHeight - padding - (i * (chartHeight - 2 * padding)) / 4;
              const value = Math.round((i * maxValue) / 4);
              return (
                <SvgText
                  key={`y-label-${i}`}
                  x={padding - 10}
                  y={y + 4}
                  fontSize="12"
                  fill="#666"
                  textAnchor="end"
                >
                  {value}
                </SvgText>
              );
            })}
          </G>
        </Svg>
        
        <View style={styles.xAxisLabels}>
          {data.map((item, index) => (
            <View key={`x-label-${index}`} style={styles.xAxisLabel}>
              <Text style={styles.xAxisLabelText}>
                {item.day.substring(0, 3)}
              </Text>
              <Text style={styles.xAxisValue}>
                {item.auctions}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <Stack.Screen options={{ headerShown: true, title: 'Admin Panel' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007BFF" />
          <Text style={styles.loadingText}>Loading real-time dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          title: 'Admin Panel',
          headerStyle: { backgroundColor: '#F8F9FA' },
          headerTitleStyle: { color: '#1A1A1A', fontWeight: '600' }
        }} 
      />
      
      <ScrollView 
        style={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Real-time Dashboard</Text>
          <Text style={styles.subtitle}>Live auction analytics and user management</Text>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live Updates</Text>
          </View>
        </View>

        {/* Enhanced Statistics Cards */}
        <View style={styles.statsContainer}>
          <StatCard 
            title="Total Auctioneers" 
            count={auctioneersCount} 
            icon="hammer-outline"
            color="#007BFF"
          />
          <StatCard 
            title="Total Bidders" 
            count={biddersCount} 
            icon="people-outline"
            color="#28A745"
          />
          <StatCard 
            title="Active Auctions" 
            count={realTimeStats.activeAuctions} 
            icon="time-outline"
            color="#FF6B35"
            subtitle="Currently running"
          />
          <StatCard 
            title="Completed Auctions" 
            count={realTimeStats.completedAuctions} 
            icon="checkmark-circle-outline"
            color="#6F42C1"
          />
          <StatCard 
            title="Total Bids" 
            count={realTimeStats.totalBids} 
            icon="trending-up-outline"
            color="#17A2B8"
          />
          <StatCard 
            title="Total Revenue" 
            count={realTimeStats.totalRevenue} 
            icon="cash-outline"
            color="#28A745"
            subtitle="From completed auctions"
          />
        </View>

        {/* Auctions Analytics Chart */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Auction Analytics</Text>
            <Text style={styles.sectionSubtitle}>
              Daily auction creation activity • Updates automatically
            </Text>
          </View>

          <View style={styles.chartContainer}>
            <View style={styles.chartHeader}>
              <Ionicons name="analytics-outline" size={20} color="#007BFF" />
              <Text style={styles.chartTitle}>Auctions Created by Day</Text>
              <View style={styles.realTimeChartIndicator}>
                <View style={styles.realTimeDot} />
              </View>
            </View>
            
            <View style={styles.chartWrapper}>
              <CustomLineChart data={auctionsData} />
            </View>

            <View style={styles.chartSummary}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Peak Day</Text>
                <Text style={styles.summaryValue}>
                  {auctionsData.reduce((prev, curr) => 
                    prev.auctions > curr.auctions ? prev : curr
                  ).day}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Daily Average</Text>
                <Text style={styles.summaryValue}>
                  {(totalAuctions / 7).toFixed(1)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>This Week</Text>
                <Text style={styles.summaryValue}>
                  {totalAuctions}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Auctioneers Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Auctioneers Management</Text>
            <Text style={styles.sectionSubtitle}>
              {auctioneersCount} active auctioneer{auctioneersCount !== 1 ? 's' : ''}
            </Text>
          </View>

          {auctioneers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#CCC" />
              <Text style={styles.emptyStateText}>No auctioneers found</Text>
              <Text style={styles.emptyStateSubtext}>
                Auctioneers will appear here automatically when they register
              </Text>
            </View>
          ) : (
            <View style={styles.usersList}>
              {auctioneers.map((user) => (
                <UserCard key={user.id} user={user} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#28A745',
    marginRight: 6,
  },
  liveText: {
    fontSize: 14,
    color: '#28A745',
    fontWeight: '600',
  },
  statsContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  statContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statTextContainer: {
    flex: 1,
  },
  statTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500',
  },
  statCount: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  statSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  chartContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginLeft: 8,
    flex: 1,
  },
  realTimeChartIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  realTimeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#28A745',
  },
  chartWrapper: {
    marginBottom: 16,
  },
  chartSvgContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  xAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    marginTop: 10,
  },
  xAxisLabel: {
    alignItems: 'center',
    flex: 1,
  },
  xAxisLabelText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  xAxisValue: {
    fontSize: 14,
    color: '#007BFF',
    fontWeight: 'bold',
    marginTop: 2,
  },
  chartSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007BFF',
  },
  usersList: {
    paddingBottom: 20,
  },
  userCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  userInfo: {
    flex: 1,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#007BFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  userMeta: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  verificationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationText: {
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  deleteButton: {
    backgroundColor: '#DC3545',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
    justifyContent: 'center',
  },
  deleteButtonDisabled: {
    backgroundColor: '#CCC',
  },
  deleteButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});