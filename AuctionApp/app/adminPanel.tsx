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
import { collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { db } from './firebase/firebaseConfig'; // Adjust the import path to your Firestore config

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

  useEffect(() => {
    fetchUsers();
    fetchAuctionsData();
  }, []);

  const fetchUsers = async () => {
    try {
      const usersRef = collection(db, 'users');
      const auctioneerQuery = query(usersRef, where('role', '==', 'auctioneer'));
      const bidderQuery = query(usersRef, where('role', '==', 'bidder'));
      
      const [auctioneerSnap, bidderSnap] = await Promise.all([
        getDocs(auctioneerQuery),
        getDocs(bidderQuery)
      ]);

      const auctioneerList = auctioneerSnap.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      
      setAuctioneers(auctioneerList);
      setAuctioneersCount(auctioneerSnap.size);
      setBiddersCount(bidderSnap.size);
    } catch (err) {
      console.error('Error fetching users:', err);
      Alert.alert('Error', 'Could not fetch users');
    }
  };

  const fetchAuctionsData = async () => {
    try {
      const auctionsRef = collection(db, 'auctions');
      const auctionsSnap = await getDocs(auctionsRef);
      
      // Initialize data for all days of the week
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const weeklyData = daysOfWeek.map(day => ({ day, auctions: 0 }));
      
      let total = 0;
      
      // Process auctions and count by day of week
      auctionsSnap.docs.forEach(doc => {
        const auction = doc.data();
        if (auction.createdAt) {
          const date = auction.createdAt.toDate ? auction.createdAt.toDate() : new Date(auction.createdAt);
          const dayIndex = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
          weeklyData[dayIndex].auctions += 1;
          total += 1;
        }
      });
      
      setAuctionsData(weeklyData);
      setTotalAuctions(total);
    } catch (err) {
      console.error('Error fetching auctions data:', err);
      Alert.alert('Error', 'Could not fetch auctions data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers();
    fetchAuctionsData();
  };

  const handleDeleteAuctioneer = async (userId, userEmail) => {
    Alert.alert(
      'Delete Auctioneer',
      `Are you sure you want to permanently delete ${userEmail}?`,
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
              await deleteDoc(doc(db, 'users', userId));
              fetchUsers();
              Alert.alert('Success', 'Auctioneer deleted successfully');
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
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  const StatCard = ({ title, count, icon, color }) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statContent}>
        <View style={styles.statTextContainer}>
          <Text style={styles.statTitle}>{title}</Text>
          <Text style={[styles.statCount, { color }]}>{count}</Text>
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
            <Text style={styles.userName}>{user.username || 'No username'}</Text>
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
    
    // Calculate points for the line
    const points = data.map((item, index) => {
      const x = padding + (index * (chartWidth - 2 * padding)) / (data.length - 1);
      const y = chartHeight - padding - ((item.auctions / maxValue) * (chartHeight - 2 * padding));
      return { x, y, value: item.auctions, day: item.day };
    });

    return (
      <View style={styles.chartSvgContainer}>
        <Svg width={chartWidth} height={chartHeight + 40}>
          {/* Grid lines */}
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
          
          {/* Main line */}
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
          
          {/* Data points */}
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
          
          {/* Y-axis labels */}
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
        
        {/* X-axis labels (using regular Text components) */}
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
          <Text style={styles.loadingText}>Loading dashboard...</Text>
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
          <Text style={styles.title}>Dashboard Overview</Text>
          <Text style={styles.subtitle}>Manage users and view statistics</Text>
        </View>

        {/* Statistics Cards */}
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
            title="Total Auctions" 
            count={totalAuctions} 
            icon="stats-chart-outline"
            color="#6F42C1"
          />
        </View>

        {/* Auctions Analytics Chart */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Auction Analytics</Text>
            <Text style={styles.sectionSubtitle}>
              Daily auction activity throughout the week
            </Text>
          </View>

          <View style={styles.chartContainer}>
            <View style={styles.chartHeader}>
              <Ionicons name="analytics-outline" size={20} color="#007BFF" />
              <Text style={styles.chartTitle}>Auctions by Day of Week</Text>
            </View>
            
            <View style={styles.chartWrapper}>
              <CustomLineChart data={auctionsData} />
            </View>

            {/* Chart Summary */}
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
                <Text style={styles.summaryLabel}>Weekly Average</Text>
                <Text style={styles.summaryValue}>
                  {(totalAuctions / 7).toFixed(1)}
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
                Auctioneers will appear here once they register
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