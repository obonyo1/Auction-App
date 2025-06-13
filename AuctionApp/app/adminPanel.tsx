import { View, Image, Button } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
export default function adminPanel() {
  const router = useRouter();

  return (
    <>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={{ flex: 1, backgroundColor: 'pink', alignItems: 'center', justifyContent: 'center' }}>


    </View>
    </>
  );
}



