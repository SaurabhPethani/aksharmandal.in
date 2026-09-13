/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginPage from './src/pages/LoginPage';

function App() {
  return (
    <SafeAreaProvider style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  return <LoginPage />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
