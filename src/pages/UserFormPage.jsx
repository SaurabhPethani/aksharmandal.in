import React from 'react';
import {
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import SiteFooter from '../components/SiteFooter';
import { Card, ErrorState, PageLoader } from '../components/ui';
import ProfileEditor from '../components/user-detail/ProfileEditor';
import { useAuth } from '../hooks/core';
import { useProfile } from '../hooks/useUsers';
import { useProfileForm } from '../hooks/useProfileForm';
import { LOADING } from '../constants/messages';
import { COLORS, space } from '../constants/theme';

export default function UserFormPage({
  onBack,
  onMenu,
  onHelp,
  onNotifications,
  onProfile,
  onSaved,
}) {
  const { activeUserId: userId } = useAuth();
  const profileQ = useProfile(userId);
  const form = useProfileForm(userId, profileQ.data);

  const shell = children => (
    <View style={styles.safe}>
      <AppHeader
        onBack={onBack}
        onMenu={onMenu}
        onHelp={onHelp}
        onNotifications={onNotifications}
        onProfile={onProfile}
      />
      {/* Edge-to-edge is on (see android/gradle.properties), so `adjustResize`
          no longer shrinks the window — the keyboard is drawn OVER the screen
          and would sit on top of the field being typed into. `padding`
          measures the real overlap, so it comes out as 0 anywhere the window
          does still resize. */}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={profileQ.isFetching && !profileQ.isLoading}
              onRefresh={profileQ.refetch}
            />
          }
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      <SiteFooter />
    </View>
  );

  if (profileQ.isLoading) return shell(<PageLoader label={LOADING.page} />);
  if (profileQ.isError) {
    return shell(
      <Card>
        <ErrorState
          error={profileQ.error}
          onRetry={profileQ.refetch}
          title="Could not load your profile"
        />
      </Card>,
    );
  }

  return shell(
    <View style={styles.stack}>
      <ProfileEditor
        form={form}
        onSaveAndExit={async () => {
          if (await form.submit()) onSaved?.();
        }}
      />
    </View>,
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  content: { padding: space(4) },
  stack: { gap: space(4) },
});
