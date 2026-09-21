import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, StyleSheet, View } from 'react-native';
import DashboardPage, { Drawer } from '../pages/DashboardPage';
import HelpPage from '../pages/HelpPage';
import BirthdaysPage from '../pages/BirthdaysPage';
import NotLoggedInPage from '../pages/NotLoggedInPage';
import EventsPage from '../pages/EventsPage';
import YuvaSevaPage from '../pages/YuvaSevaPage';
import NotificationsPage from '../pages/NotificationsPage';
import LegalPage from '../pages/LegalPage';
import { useAuth } from '../hooks/core';
import { canReadHelp } from '../constants/roles';

type RouteName =
  | 'dashboard'
  | 'help'
  | 'birthdays'
  | 'not-logged-in'
  | 'events'
  | 'yuva-seva'
  | 'notifications'
  | 'legal-privacy'
  | 'legal-terms'
  | 'legal-delete';

type AppNavigatorProps = {
  initialRoute?: RouteName;
};

export default function AppNavigator({
  initialRoute = 'dashboard',
}: AppNavigatorProps) {
  const [history, setHistory] = useState<RouteName[]>([initialRoute]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleId, setRoleId] = useState<number | null>(null);
  const { signOut } = useAuth();
  const transition = useRef(new Animated.Value(1)).current;
  const route = history[history.length - 1];
  const canOpenHelp = canReadHelp(roleId);
  const openHelp = canOpenHelp ? () => navigate('help') : undefined;
  const legalLinks = {
    onOpenPrivacy: () => navigate('legal-privacy'),
    onOpenTerms: () => navigate('legal-terms'),
    onOpenDeleteAccount: () => navigate('legal-delete'),
  };
  const displayedRoute = route === 'help' && !canOpenHelp ? 'dashboard' : route;

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
    displayedRoute === 'dashboard' ? (
      <DashboardPage
        onOpenHelp={openHelp}
        onOpenMenu={() => setDrawerOpen(true)}
        onOpenBirthdays={() => navigate('birthdays')}
        onOpenNotLoggedIn={() => navigate('not-logged-in')}
        onOpenEvents={() => navigate('events')}
        onOpenUntouchedUsers={() => navigate('yuva-seva')}
        onOpenNotifications={() => navigate('notifications')}
        onRoleNameChange={setRoleName}
        onRoleIdChange={setRoleId}
        {...legalLinks}
      />
    ) : displayedRoute === 'birthdays' ? (
      // Opened from the dashboard's birthday tiles; back returns there.
      <BirthdaysPage
        onBack={goBack}
        onMenu={() => setDrawerOpen(true)}
        onHelp={openHelp}
        onNotifications={() => navigate('notifications')}
        {...legalLinks}
      />
    ) : displayedRoute === 'not-logged-in' ? (
      <NotLoggedInPage
        onBack={goBack}
        onOpenMenu={() => setDrawerOpen(true)}
        onOpenHelp={openHelp}
        onNotifications={() => navigate('notifications')}
        {...legalLinks}
      />
    ) : displayedRoute === 'events' ? (
      <EventsPage
        onBack={goBack}
        onMenu={() => setDrawerOpen(true)}
        onHelp={openHelp}
        onNotifications={() => navigate('notifications')}
        {...legalLinks}
      />
    ) : displayedRoute === 'yuva-seva' ? (
      <YuvaSevaPage
        onBack={goBack}
        onMenu={() => setDrawerOpen(true)}
        onHelp={openHelp}
        onNotifications={() => navigate('notifications')}
        {...legalLinks}
      />
    ) : displayedRoute === 'notifications' ? (
      <NotificationsPage
        onBack={goBack}
        onMenu={() => setDrawerOpen(true)}
        onHelp={openHelp}
        {...legalLinks}
      />
    ) : displayedRoute === 'legal-privacy' ? (
      <LegalPage type="privacy" onBack={goBack} {...legalLinks} />
    ) : displayedRoute === 'legal-terms' ? (
      <LegalPage type="terms" onBack={goBack} {...legalLinks} />
    ) : displayedRoute === 'legal-delete' ? (
      <LegalPage type="delete" onBack={goBack} {...legalLinks} />
    ) : (
      <HelpPage
        onMenu={() => setDrawerOpen(true)}
        onNotifications={() => navigate('notifications')}
        {...legalLinks}
      />
    );

  return (
    <View style={styles.container}>
      <Animated.View
        key={displayedRoute}
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
