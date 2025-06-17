import React, { useEffect, useState } from 'react';
import { View, Text, Button, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase/firebaseConfig'; // Adjust the import path to your Firestore config

export default function AdminPanel() {
  const router = useRouter();

  const [auctioneers, setAuctioneers] = useState([]);
  const [biddersCount, setBiddersCount] = useState(0);
  const [auctioneersCount, setAuctioneersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
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

      const auctioneerList = auctioneerSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      setAuctioneers(auctioneerList);
      setAuctioneersCount(auctioneerSnap.size);
      setBiddersCount(bidderSnap.size);
    } catch (err) {
      console.error('Error fetching users:', err);
      Alert.alert('Error', 'Could not fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAuctioneer = async (userId: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this auctioneer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'users', userId));
              fetchUsers(); // Refresh list
              Alert.alert('Deleted', 'Auctioneer deleted successfully');
            } catch (err) {
              console.error('Delete error:', err);
              Alert.alert('Error', 'Failed to delete auctioneer');
            }
          }
        }
      ]
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Admin Panel' }} />
      <View style={styles.container}>
        <Text style={styles.title}>User Summary</Text>
        {loading ? (
          <Text>Loading...</Text>
        ) : (
          <>
            <Text>Total Auctioneers: {auctioneersCount}</Text>
            <Text>Total Bidders: {biddersCount}</Text>

            <Text style={styles.subTitle}>Auctioneers:</Text>
            <ScrollView style={styles.scrollView}>
              {auctioneers.map((user: any) => (
                <View key={user.id} style={styles.userCard}>
                  <Text>{user.email || 'No email'}</Text>
                  <Button
                    title="Delete"
                    color="red"
                    onPress={() => handleDeleteAuctioneer(user.id)}
                  />
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffe4e1',
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  subTitle: {
    fontSize: 20,
    marginTop: 20,
    marginBottom: 10,
  },
  scrollView: {
    marginTop: 10,
  },
  userCard: {
    backgroundColor: '#fff',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    elevation: 1,
  },
});
