import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, StyleSheet, View } from 'react-native';
import DashboardPage, { Drawer } from '../pages/DashboardPage';
import HelpPage from '../pages/HelpPage';
import BirthdaysPage from '../pages/BirthdaysPage';
import NotLoggedInPage from '../pages/NotLoggedInPage';
import EventsPage from '../pages/EventsPage';
import YuvaSevaPage from '../pages/YuvaSevaPage';
import NotificationsPage from '../pages/NotificationsPage';
import LegalPage from '../pages/LegalPage';
import ProfilePage from '../pages/ProfilePage';
import { useAuth } from '../hooks/core';
import { canReadHelp, canSeeYuvaSeva } from '../constants/roles';

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
  | 'legal-delete'
  | 'profile';

type AppNavigatorProps = {
  initialRoute?: RouteName;
};

export default function AppNavigator({
  initialRoute = 'dashboard',
}: AppNavigatorProps) {
  const [history, setHistory] = useState<RouteName[]>([initialRoute]);
  // Opened through its ref, so opening it does not re-render the screen.
  const drawerRef = useRef<{ open: () => void; close: () => void }>(null);
  const openDrawer = useCallback(() => drawerRef.current?.open(), []);
  const [roleName, setRoleName] = useState('');
  const [roleId, setRoleId] = useState<number | null>(null);
  // The tab the profile opens on; null is its first one.
  const [profileTab, setProfileTab] = useState<string | null>(null);
  const { signOut } = useAuth();
  const transition = useRef(new Animated.Value(1)).current;
  const route = history[history.length - 1];
  const canOpenHelp = canReadHelp(roleId);
  const canOpenYuvaSeva = canSeeYuvaSeva(roleId);
  const blocked =
    (route === 'help' && !canOpenHelp) ||
    (route === 'yuva-seva' && !canOpenYuvaSeva);
  const openHelp = canOpenHelp ? () => navigate('help') : undefined;
  const legalLinks = {
    onOpenPrivacy: () => navigate('legal-privacy'),
    onOpenTerms: () => navigate('legal-terms'),
    onOpenDeleteAccount: () => navigate('legal-delete'),
  };
  const displayedRoute = blocked ? 'dashboard' : route;

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
  const openProfile = () => {
    setProfileTab(null);
    navigate('profile');
  };

  const openSecurity = () => {
    setProfileTab('security');
    navigate('profile');
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
        if (history.length > 1) {
          setHistory(previous => previous.slice(0, -1));
          return true;
        }

        // Android closes the app when the dashboard is the root screen.
        return false;
      },
    );

    return () => subscription.remove();
  }, [history.length]);

  const screen =
    displayedRoute === 'dashboard' ? (
      <DashboardPage
        onOpenHelp={openHelp}
        onOpenMenu={openDrawer}
        onOpenBirthdays={() => navigate('birthdays')}
        onOpenNotLoggedIn={() => navigate('not-logged-in')}
        onOpenEvents={() => navigate('events')}
        onOpenUntouchedUsers={() => navigate('yuva-seva')}
        onOpenNotifications={() => navigate('notifications')}
        onOpenProfile={openProfile}
        onOpenSecurity={openSecurity}
        onRoleNameChange={setRoleName}
        onRoleIdChange={setRoleId}
        onOpenYuvaSeva={() => navigate('yuva-seva')}
        {...legalLinks}
      />
    ) : displayedRoute === 'birthdays' ? (
      // Opened from the dashboard's birthday tiles; back returns there.
      <BirthdaysPage
        onBack={goBack}
        onMenu={openDrawer}
        onHelp={openHelp}
        onNotifications={() => navigate('notifications')}
        onProfile={openProfile}
        {...legalLinks}
      />
    ) : displayedRoute === 'not-logged-in' ? (
      <NotLoggedInPage
        onBack={goBack}
        onOpenMenu={openDrawer}
        onOpenHelp={openHelp}
        onNotifications={() => navigate('notifications')}
        {...legalLinks}
        onProfile={openProfile}
      />
    ) : displayedRoute === 'events' ? (
      <EventsPage
        onBack={goBack}
        onMenu={openDrawer}
        onHelp={openHelp}
        onNotifications={() => navigate('notifications')}
        {...legalLinks}
        onProfile={openProfile}
      />
    ) : displayedRoute === 'yuva-seva' ? (
      <YuvaSevaPage
        onBack={goBack}
        onMenu={openDrawer}
        onHelp={openHelp}
        onNotifications={() => navigate('notifications')}
        {...legalLinks}
        onProfile={openProfile}
      />
    ) : displayedRoute === 'notifications' ? (
      <NotificationsPage
        onBack={goBack}
        onMenu={openDrawer}
        onHelp={openHelp}
        {...legalLinks}
        onProfile={openProfile}
      />
    ) : route === 'profile' ? (
      <ProfilePage
        onBack={goBack}
        onMenu={openDrawer}
        onHelp={openHelp}
        onNotifications={() => navigate('notifications')}
        initialTab={profileTab}
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
        onBack={goBack}
        onMenu={openDrawer}
        onNotifications={() => navigate('notifications')}
        {...legalLinks}
        onProfile={openProfile}
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
        ref={drawerRef}
        onSignOut={signOut}
        onDashboard={() => setHistory(['dashboard'])}
        onOpenEvents={() => navigate('events')}
        onOpenYuvaSeva={() => navigate('yuva-seva')}
        activeRoute={route}
        roleName={roleName}
        showYuvaSeva={canOpenYuvaSeva}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screen: { flex: 1 },
});
