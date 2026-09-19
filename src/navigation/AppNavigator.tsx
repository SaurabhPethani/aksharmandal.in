import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import DashboardPage, { Drawer } from '../pages/DashboardPage';
import HelpPage from '../pages/HelpPage';
import BirthdaysPage from '../pages/BirthdaysPage';
import { useAuth } from '../hooks/core';

type RouteName = 'dashboard' | 'help' | 'birthdays';

type AppNavigatorProps = {
  initialRoute?: RouteName;
};

export default function AppNavigator({
  initialRoute = 'dashboard',
}: AppNavigatorProps) {
  const [route, setRoute] = useState<RouteName>(initialRoute);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const { signOut } = useAuth();
  const transition = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    transition.setValue(0);
    Animated.timing(transition, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [route, transition]);

  const screen =
    route === 'dashboard' ? (
      <DashboardPage
        onOpenHelp={() => setRoute('help')}
        onOpenMenu={() => setDrawerOpen(true)}
        onOpenBirthdays={() => setRoute('birthdays')}
        onRoleNameChange={setRoleName}
      />
    ) : route === 'birthdays' ? (
      // Opened from the dashboard's birthday tiles; back returns there.
      <BirthdaysPage
        onBack={() => setRoute('dashboard')}
        onMenu={() => setDrawerOpen(true)}
        onHelp={() => setRoute('help')}
      />
    ) : (
      <HelpPage onMenu={() => setDrawerOpen(true)} />
    );

  return (
    <View style={styles.container}>
      <Animated.View
        key={route}
        style={[
          styles.screen,
          {
            opacity: transition,
            transform: [
              {
                translateX: transition.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0],
                }),
              },
            ],
          },
        ]}
      >
        {screen}
      </Animated.View>
      <Drawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSignOut={signOut}
        onDashboard={() => setRoute('dashboard')}
        activeRoute={route}
        roleName={roleName}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screen: { flex: 1 },
});
