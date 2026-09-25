import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, StyleSheet, View } from 'react-native';
import DashboardPage, { Drawer } from '../pages/DashboardPage';
import HelpPage from '../pages/HelpPage';
import BirthdaysPage from '../pages/BirthdaysPage';
import NotLoggedInPage from '../pages/NotLoggedInPage';
import EventsPage from '../pages/EventsPage';
import YuvaSevaPage from '../pages/YuvaSevaPage';
import NotificationsPage from '../pages/NotificationsPage';
import ProfilePage from '../pages/ProfilePage';
import { useAuth } from '../hooks/core';

type RouteName =
  | 'dashboard'
  | 'help'
  | 'birthdays'
  | 'not-logged-in'
  | 'events'
  | 'yuva-seva'
  | 'notifications'
  | 'profile';

type AppNavigatorProps = {
  initialRoute?: RouteName;
};

export default function AppNavigator({
  initialRoute = 'dashboard',
}: AppNavigatorProps) {
  const [history, setHistory] = useState<RouteName[]>([initialRoute]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const { signOut } = useAuth();
  const transition = useRef(new Animated.Value(1)).current;
  const route = history[history.length - 1];

  useEffect(() => {
    transition.setValue(0);
    Animated.timing(transition, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [route, transition]);

  const navigate = (nextRoute: RouteName) => {
    setHistory(previous => [...previous, nextRoute]);
  };

  // The header avatar, on every screen. Re-entering from the profile itself
  // would stack a second copy, so it is not offered there.
  const openProfile = () => navigate('profile');

  const goBack = () => {
    setHistory(previous =>
      previous.length > 1 ? previous.slice(0, -1) : previous,
    );
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (drawerOpen) {
          setDrawerOpen(false);
          return true;
        }

        if (history.length > 1) {
          setHistory(previous => previous.slice(0, -1));
          return true;
        }

        // Android closes the app when the dashboard is the root screen.
        return false;
      },
    );

    return () => subscription.remove();
  }, [drawerOpen, history.length]);

  const screen =
    route === 'dashboard' ? (
      <DashboardPage
        onOpenHelp={() => navigate('help')}
        onOpenMenu={() => setDrawerOpen(true)}
        onOpenBirthdays={() => navigate('birthdays')}
        onOpenNotLoggedIn={() => navigate('not-logged-in')}
        onOpenEvents={() => navigate('events')}
        onOpenUntouchedUsers={() => navigate('yuva-seva')}
        onOpenNotifications={() => navigate('notifications')}
        onOpenProfile={openProfile}
        onRoleNameChange={setRoleName}
      />
    ) : route === 'birthdays' ? (
      // Opened from the dashboard's birthday tiles; back returns there.
      <BirthdaysPage
        onBack={goBack}
        onMenu={() => setDrawerOpen(true)}
        onHelp={() => navigate('help')}
        onNotifications={() => navigate('notifications')}
        onProfile={openProfile}
      />
    ) : route === 'not-logged-in' ? (
      <NotLoggedInPage
        onBack={goBack}
        onOpenMenu={() => setDrawerOpen(true)}
        onOpenHelp={() => navigate('help')}
        onNotifications={() => navigate('notifications')}
        onProfile={openProfile}
      />
    ) : route === 'events' ? (
      <EventsPage
        onBack={goBack}
        onMenu={() => setDrawerOpen(true)}
        onHelp={() => navigate('help')}
        onNotifications={() => navigate('notifications')}
        onProfile={openProfile}
      />
    ) : route === 'yuva-seva' ? (
      <YuvaSevaPage
        onBack={goBack}
        onMenu={() => setDrawerOpen(true)}
        onHelp={() => navigate('help')}
        onNotifications={() => navigate('notifications')}
        onProfile={openProfile}
      />
    ) : route === 'notifications' ? (
      <NotificationsPage
        onBack={goBack}
        onMenu={() => setDrawerOpen(true)}
        onHelp={() => navigate('help')}
        onProfile={openProfile}
      />
    ) : route === 'profile' ? (
      <ProfilePage
        onBack={goBack}
        onMenu={() => setDrawerOpen(true)}
        onHelp={() => navigate('help')}
        onNotifications={() => navigate('notifications')}
      />
    ) : (
      <HelpPage
        onBack={goBack}
        onMenu={() => setDrawerOpen(true)}
        onNotifications={() => navigate('notifications')}
        onProfile={openProfile}
      />
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
        onDashboard={() => setHistory(['dashboard'])}
        onOpenEvents={() => {
          navigate('events');
          setDrawerOpen(false);
        }}
        onOpenNotifications={() => {
          navigate('notifications');
          setDrawerOpen(false);
        }}
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
