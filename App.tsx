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
import type { StyleProp, ViewStyle } from 'react-native';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/utils/queryClient';
import { AuthProvider } from './src/contexts/AuthContext';
import {
  OverlayHost,
  OverlayProvider,
  useOverlayOpen,
} from './src/contexts/OverlayContext';
import { ToastProvider } from './src/contexts/ToastContext';
import LoginPage from './src/pages/LoginPage';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuth } from './src/hooks/core';
import LegalPage from './src/pages/LegalPage';

function App() {
  return (
    <SafeAreaProvider style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OverlayProvider>
            <ToastProvider>
              <AppContent />
            </ToastProvider>
          </OverlayProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// Only the SCREENS blur. The overlay layer is their sibling, so a dialog on
// top of them stays sharp. `filter` blur is Android 12+ only; elsewhere the
// modal's dimmed backdrop is all that shows.
// A component of its own, so a dialog opening or closing re-renders this one
// view and not every screen inside it.
function Screens({
  style,
  children,
}: {
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const overlayOpen = useOverlayOpen();
  return (
    // `collapsable={false}` keeps this a stacking context at all times: were
    // the blur `filter` to turn it into one, Fabric would re-attach
    // everything underneath as the dialog opens.
    <View collapsable={false} style={[style, overlayOpen && styles.blurred]}>
      {children}
    </View>
  );
}

// Insets are applied once here, so screens must not add their own
// SafeAreaView or the padding doubles up.
function AppContent() {
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const [legalPage, setLegalPage] = useState<
    'privacy' | 'terms' | 'delete' | null
  >(null);

  return (
    <View style={styles.root}>
      <Screens
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
        {status === 'booting' ? (
          <ActivityIndicator size="large" color="#003158" />
        ) : status !== 'authed' ? (
          legalPage ? (
            <LegalPage type={legalPage} onBack={() => setLegalPage(null)} />
          ) : (
            <LoginPage
              onOpenPrivacy={() => setLegalPage('privacy')}
              onOpenTerms={() => setLegalPage('terms')}
              onOpenDeleteAccount={() => setLegalPage('delete')}
            />
          )
        ) : (
          <AppNavigator />
        )}
      </Screens>

      <OverlayHost />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Holds the screens and the overlay layer over them.
  root: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  // Painted behind the status bar and home indicator areas.
  content: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  // The web modal's `backdrop-filter: blur(4px)`.
  blurred: {
    filter: [{ blur: 4 }],
  },
});

export default App;
