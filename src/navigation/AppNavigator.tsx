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
import MembersPage from '../pages/MembersPage';
import UserDetailsPage from '../pages/UserDetailsPage';
import MemberFormPage from '../pages/MemberFormPage';
import { useAuth } from '../hooks/core';
import { useMyPermissions } from '../hooks/useMyPermissions';
import { canReadHelp, canSeeYuvaSeva } from '../constants/roles';
import { ACTIONS, MODULES } from '../constants/permissions';

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
  | 'profile'
  | 'users'
  | 'user-details'
  | 'user-new'
  | 'user-edit';

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
  // The tab the Birthdays page opens on; null is its first one.
  const [birthdaysTab, setBirthdaysTab] = useState<string | null>(null);
  // The member the details screen is showing.
  const [memberId, setMemberId] = useState<number | null>(null);
  const { signOut, activeUserId } = useAuth();
  // The Users entry follows the caller's own grant, as the web's menu does.
  const permissions = useMyPermissions().data;
  const usersModule = permissions?.byName?.[MODULES.USERS];
  const showUsers = Boolean(
    usersModule?.navVisible && permissions?.can(MODULES.USERS, ACTIONS.READ),
  );
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

  const openMember = (id: number) => {
    setMemberId(id);
    navigate('user-details');
  };

  // Your own record is edited on the profile, where some changes go for
  // approval; anyone else's opens the member form.
  const openMemberEdit = (id: number) => {
    if (String(id) === String(activeUserId)) {
      openProfile();
      return;
    }
    setMemberId(id);
    navigate('user-edit');
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
        onOpenBirthdays={() => {
          setBirthdaysTab(null);
          navigate('birthdays');
        }}
        onOpenMyWishes={() => {
          setBirthdaysTab('received');
          navigate('birthdays');
        }}
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
        initialTab={birthdaysTab}
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
    ) : displayedRoute === 'users' ? (
      <MembersPage
        onOpenMember={openMember}
        onAddUser={() => navigate('user-new')}
        onEditMember={openMemberEdit}
        onBack={goBack}
        onMenu={openDrawer}
        onHelp={openHelp}
        onNotifications={() => navigate('notifications')}
        {...legalLinks}
        onProfile={openProfile}
      />
    ) : displayedRoute === 'user-details' ? (
      // Opened from the Users list; back returns there.
      <UserDetailsPage
        userId={memberId}
        onBack={goBack}
        onEdit={openMemberEdit}
        onMenu={openDrawer}
        onHelp={openHelp}
        onNotifications={() => navigate('notifications')}
        {...legalLinks}
        onProfile={openProfile}
      />
    ) : displayedRoute === 'user-new' || displayedRoute === 'user-edit' ? (
      // Saving returns to wherever the form was opened from.
      <MemberFormPage
        userId={displayedRoute === 'user-edit' ? memberId : null}
        onBack={goBack}
        onDone={goBack}
        onMenu={openDrawer}
        onHelp={openHelp}
        onNotifications={() => navigate('notifications')}
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
        onOpenUsers={() => navigate('users')}
        activeRoute={route}
        roleName={roleName}
        showYuvaSeva={canOpenYuvaSeva}
        showUsers={showUsers}
        usersLabel={usersModule?.label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screen: { flex: 1 },
});
