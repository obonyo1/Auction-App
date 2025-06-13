import { View, Image, Button } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
export default function auctioneerHome() {
  const router = useRouter();

  return (
    <>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={{ flex: 1, backgroundColor: 'blue', alignItems: 'center', justifyContent: 'center' }}>


    </View>
    </>
  );
}
