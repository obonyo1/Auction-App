import { View, Image, Button } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
export default function HomeScreen() {
  const router = useRouter();

  return (
    <>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={{ flex: 1, backgroundColor: 'black', alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={require('./assets/images/Auction-rafiki(1).png')}
        style={{ width: 300, height: 300, marginBottom: 40 }}
        resizeMode="contain"
      />

      <View style={{ width: '80%' }}>
        <Button title="Login" onPress={() => router.push('/login')} />
        <View style={{ height: 20 }} />
        <Button title="Sign Up" onPress={() => router.push('/signup')} />
      </View>
    </View>
    </>
  );
}
