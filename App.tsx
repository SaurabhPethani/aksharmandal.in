/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import LoginPage from './src/pages/LoginPage';
import DashboardPage from './src/pages/DashboardPage';
import { useAuth } from './src/hooks/core';

function App() {
  return (
    <SafeAreaProvider style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// Insets are applied once here, so screens must not add their own
// SafeAreaView or the padding doubles up.
function AppContent() {
  const insets = useSafeAreaInsets();
  const { status } = useAuth();

  return (
    <View
      style={[
        styles.content,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {status === 'booting' ? <ActivityIndicator size="large" color="#003158" /> : status === 'authed' ? <DashboardPage /> : <LoginPage />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Painted behind the status bar and home indicator areas.
  content: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
});

export default App;
