import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons/static';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import SiteFooter from '../components/SiteFooter';
import ScrollViewWithTop from '../components/ScrollToTop';
import { Text, TextInput } from '../components/Typography';
import { FONT_DISPLAY } from '../constants/typography';
import { useAuth } from '../hooks/core';
import { AUTH, LOGIN_LOCKOUT_LIMIT } from '../constants/messages';
import { ErrorBanner } from '../components/form/LoginField';

const PIN_LENGTH = 6;
const MIN_PASSWORD_LENGTH = 6;
const LOCKOUT_LIMIT = 5;

// The biometric prompt opens by itself only when the app is opened, not when
// this page comes back after a sign-out or a legal page.
let launchPromptDue = true;

const iconNames = {
  eye: 'eye',
  eyeOff: 'eye-off',
  key: 'key-variant',
  lock: 'lock-outline',
  message: 'message-outline',
  phone: 'phone-outline',
  shield: 'shield-check-outline',
  fingerprint: 'fingerprint',
  check: 'check-circle',
};

function NativeIcon({ name, size = 20, color = '#9BB5CB' }) {
  return (
    <MaterialDesignIcons name={iconNames[name]} size={size} color={color} />
  );
}

const Field = forwardRef(function Field(
  {
    label,
    icon,
    rightElement,
    value,
    valid = false,
    statusElement,
    error = false,
    onChangeText,
    secureTextEntry,
    keyboardType = 'default',
    placeholder,
    editable = true,
    onSubmitEditing,
    returnKeyType,
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={[
        styles.field,
        focused && styles.fieldFocused,
        error && styles.fieldError,
      ]}
    >
      <View style={styles.fieldIcon}>{icon}</View>
      <View style={styles.fieldContent}>
        <Text style={[styles.fieldLabel, focused && styles.fieldLabelFocused]}>
          {label}
        </Text>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor="#A7BACA"
          editable={editable}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
        />
      </View>
      <View style={styles.fieldTrailing}>
        <View style={styles.fieldStatus}>
          {statusElement ||
            (valid ? (
              <NativeIcon name="check" size={20} color="#22A06B" />
            ) : null)}
        </View>
        {rightElement ? (
          <View style={styles.fieldAction}>{rightElement}</View>
        ) : null}
      </View>
    </Pressable>
  );
});

const CodeInput = forwardRef(function CodeInput(
  {
    label,
    value,
    onChangeText,
    secureTextEntry = false,
    editable = true,
    rightElement,
  },
  ref,
) {
  const inputRefs = useRef([]);
  const [focusedIndex, setFocusedIndex] = useState(null);
  const digits = Array.from(
    { length: PIN_LENGTH },
    (_, index) => value[index] || '',
  );

  // Lands on the first empty box.
  useImperativeHandle(ref, () => ({
    focus: () =>
      inputRefs.current[Math.min(value.length, PIN_LENGTH - 1)]?.focus(),
  }));

  const updateDigits = (index, rawValue) => {
    const cleanValue = rawValue.replace(/\D/g, '');
    const nextDigits = [...digits];

    if (cleanValue.length > 1) {
      cleanValue
        .slice(0, PIN_LENGTH - index)
        .split('')
        .forEach((digit, offset) => {
          nextDigits[index + offset] = digit;
        });
      onChangeText(nextDigits.join(''));
      inputRefs.current[
        Math.min(index + cleanValue.length, PIN_LENGTH - 1)
      ]?.focus();
      return;
    }

    nextDigits[index] = cleanValue;
    onChangeText(nextDigits.join(''));
    if (cleanValue && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeLabelRow}>
        <View style={styles.fieldIcon}>
          <NativeIcon name="lock" size={17} color="#FF862A" />
        </View>
        <Text
          style={[
            styles.fieldLabel,
            styles.codeLabel,
            focusedIndex !== null && styles.fieldLabelFocused,
          ]}
        >
          {label}
        </Text>
        {rightElement}
      </View>
      <View style={styles.digitRow}>
        {digits.map((digit, index) => (
          <TextInput
            key={index}
            ref={input => {
              inputRefs.current[index] = input;
            }}
            value={digit}
            onChangeText={text => updateDigits(index, text)}
            onKeyPress={({ nativeEvent }) => {
              // An empty box has nothing to delete, so the press takes the
              // digit before it.
              if (
                nativeEvent.key === 'Backspace' &&
                !digits[index] &&
                index > 0
              ) {
                const nextDigits = [...digits];
                nextDigits[index - 1] = '';
                onChangeText(nextDigits.join(''));
                inputRefs.current[index - 1]?.focus();
              }
            }}
            secureTextEntry={secureTextEntry}
            keyboardType="number-pad"
            maxLength={1}
            editable={editable}
            selectTextOnFocus
            onFocus={() => setFocusedIndex(index)}
            onBlur={() =>
              setFocusedIndex(current => (current === index ? null : current))
            }
            style={[
              styles.digitInput,
              focusedIndex === index && styles.digitInputFocused,
            ]}
            accessibilityLabel={`${label} digit ${index + 1}`}
          />
        ))}
      </View>
    </View>
  );
});

/**
 * @typedef {Object} LoginPageProps
 * @property {(() => void) | undefined} [onOpenPrivacy]
 * @property {(() => void) | undefined} [onOpenTerms]
 * @property {(() => void) | undefined} [onOpenDeleteAccount]
 */

/**
 * @param {LoginPageProps} props
 */
export default function LoginPage({
  onOpenPrivacy,
  onOpenTerms,
  onOpenDeleteAccount,
}) {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('main');
  const [tab, setTab] = useState('pin');
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [purpose, setPurpose] = useState('SETUP');
  const [newPassword, setNewPassword] = useState('');
  const [showSetupPass, setShowSetupPass] = useState(false);
  const [showSetupPin, setShowSetupPin] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState(null);
  const [biometricBusy, setBiometricBusy] = useState(false);
  // Biometric login is switched on and off in Profile → Security. This only
  // keeps it on across a PIN/password sign-in, which saves a fresh token.
  const [useBiometric, setUseBiometric] = useState(auth.biometricEnabled);
  const biometricStateLoaded = useRef(auth.biometricEnabled);
  const credentialRef = useRef(null);

  useEffect(() => {
    if (auth.biometricEnabled && !biometricStateLoaded.current) {
      setUseBiometric(true);
    }
    biometricStateLoaded.current = auth.biometricEnabled;
  }, [auth.biometricEnabled]);

  const mobileValid = mobile.length === 10;
  const locked = failure?.isLocked === true;
  const attemptsLeft =
    !locked && failure?.failedAttempts != null
      ? Math.max(0, LOCKOUT_LIMIT - failure.failedAttempts)
      : null;
  const canLogin =
    mobileValid &&
    !locked &&
    (tab === 'pin'
      ? pin.length === PIN_LENGTH
      : password.length >= MIN_PASSWORD_LENGTH);
  const canVerifyOtp = otp.length === PIN_LENGTH;
  const canCompleteSetup =
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword === newPassword &&
    newPin.length === PIN_LENGTH &&
    confirmPin === newPin;

  const clearMessages = () => {
    setError('');
    setNotice('');
  };
  const switchTab = nextTab => {
    clearMessages();
    if (nextTab === tab) return;
    setTab(nextTab);
    setPin('');
    setPassword('');
    setShowPassword(false);
  };
  const run = async operation => {
    if (busy) return;
    setBusy(true);
    clearMessages();
    try {
      await operation();
    } catch (caught) {
      if (caught.failure) setFailure(caught.failure);
      setError(caught.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const biometricLogin = async ({ quiet = false } = {}) => {
    if (biometricBusy || !auth.biometricAvailable || !auth.biometricEnabled) {
      return;
    }

    setBiometricBusy(true);
    setError('');

    try {
      await auth.loginWithBiometric();

      setNotice('Signed in successfully.');
    } catch (biometricError) {
      // The saved token was revoked and removed; the next PIN/password
      // sign-in saves a fresh one.
      if (biometricError?.biometricExpired) setUseBiometric(true);
      // Cancelling a prompt the app opened by itself is not an error.
      if (!(quiet && biometricError?.biometricCancelled)) {
        setError(biometricError?.message || 'Biometric authentication failed.');
      }
    } finally {
      setBiometricBusy(false);
    }
  };

  useEffect(() => {
    if (!launchPromptDue) return;
    launchPromptDue = false;
    biometricLogin({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (pinValue = pin) =>
    run(async () => {
      if (!mobileValid) throw new Error('Enter a valid 10-digit mobile number');
      if (locked) return;
      const biometric = auth.biometricAvailable && useBiometric;
      let result;
      if (tab === 'pin') {
        if (pinValue.length !== PIN_LENGTH)
          throw new Error(`Enter all ${PIN_LENGTH} PIN digits`);
        result = await auth.loginWithPin(mobile, pinValue, { biometric });
      } else {
        if (!password) throw new Error('Enter your password');
        result = await auth.loginWithPassword(mobile, password, { biometric });
      }
      if (biometric && result?.biometricSaved === false) {
        Alert.alert(
          'Biometric login',
          'You are signed in, but biometric login could not be kept on. You can turn it on again from Profile → Security.',
        );
      }
      setNotice('Signed in successfully.');
    });

  const startSetup = () =>
    run(async () => {
      if (!mobileValid) throw new Error('Enter your mobile number first');
      const result = await auth.loginInit(mobile, true);
      setPurpose(result?.purpose || 'RESET');
      setNotice(result?.message || 'OTP sent to your WhatsApp number.');
      setOtp('');
      setStep('otp');
    });

  const verifyOtp = (otpValue = otp) =>
    run(async () => {
      if (otpValue.length !== PIN_LENGTH)
        throw new Error(`Enter all ${PIN_LENGTH} OTP digits`);
      await auth.verifyOtp(mobile, otpValue, purpose);
      setStep('setup');
    });

  // Auto-submit only when the last digit goes in, so editing a digit of a
  // full code does not fire another attempt.
  const changePin = value => {
    const completed = value.length === PIN_LENGTH && pin.length < PIN_LENGTH;
    setPin(value);
    if (completed && mobileValid && !locked) {
      Keyboard.dismiss();
      login(value);
    }
  };

  const changeOtp = value => {
    const completed = value.length === PIN_LENGTH && otp.length < PIN_LENGTH;
    setOtp(value);
    if (completed) {
      Keyboard.dismiss();
      verifyOtp(value);
    }
  };

  const completeSetup = () =>
    run(async () => {
      if (newPassword.length < MIN_PASSWORD_LENGTH)
        throw new Error(
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        );
      if (newPassword !== confirmPassword)
        throw new Error('Passwords do not match');
      if (newPin.length !== PIN_LENGTH)
        throw new Error(`PIN must be exactly ${PIN_LENGTH} digits`);
      if (newPin !== confirmPin) throw new Error('PINs do not match');
      await auth.completeSetup(mobile, newPassword, newPin);
      setStep('main');
      setTab('pin');
      setPin('');
      setPassword('');
      setFailure(null);
      setNotice('Setup complete. Please sign in with your new credentials.');
    });

  // Shared by the PIN and Confirm PIN rows, like the password fields' toggle.
  const setupPinToggle = (
    <Pressable
      onPress={() => setShowSetupPin(value => !value)}
      hitSlop={8}
      style={({ pressed }) => [styles.pinToggle, pressed && styles.pressedLink]}
      accessibilityRole="button"
      accessibilityLabel={showSetupPin ? 'Hide PIN' : 'Show PIN'}
    >
      <NativeIcon name={showSetupPin ? 'eyeOff' : 'eye'} size={18} />
      <Text style={styles.pinToggleText}>{showSetupPin ? 'Hide' : 'Show'}</Text>
    </Pressable>
  );

  const title =
    step === 'otp'
      ? 'Check WhatsApp'
      : step === 'setup'
        ? 'Account Setup'
        : 'Welcome Back';

  // Shown directly above each step's submit button.
  const showAttempts = !locked && attemptsLeft != null && attemptsLeft > 0;
  const feedback =
    error || locked || showAttempts || notice ? (
      <View style={styles.feedback}>
        <ErrorBanner message={error} />
        {locked ? <Text style={styles.error}>{AUTH.locked}</Text> : null}
        {showAttempts ? (
          <Text style={styles.warning}>{AUTH.attemptsLeft(attemptsLeft)}</Text>
        ) : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </View>
    ) : null;

  return (
    <View style={styles.safe}>
      <View pointerEvents="none" style={styles.topGlow}>
        <Svg width="100%" height="220" viewBox="0 0 360 220">
          <Defs>
            <RadialGradient id="login-top-glow" cx="50%" cy="0%" r="72%">
              <Stop offset="0%" stopColor="#FF862A" stopOpacity="0.34" />
              <Stop offset="0.55" stopColor="#FF862A" stopOpacity="0.14" />
              <Stop offset="1" stopColor="#FF862A" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="180" cy="0" r="170" fill="url(#login-top-glow)" />
        </Svg>
      </View>
      {/* `padding` on Android too: the window is no longer resized for the
          keyboard there, so the form would sit under it. The screen starts
          below the status bar, which the offset accounts for. */}
      <KeyboardAvoidingView
        style={styles.safe}
        behavior="padding"
        keyboardVerticalOffset={insets.top}
      >
        <ScrollViewWithTop
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandRow}>
            <Image
              source={require('../assets/akshar-satsang-mandal.png')}
              style={styles.mandalLogo}
              resizeMode="contain"
            />
            <Text style={styles.presents}>PRESENTS</Text>
            <Image
              source={require('../assets/Akshar-Connect-Blue-logo.png')}
              style={styles.connectLogo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              {step === 'otp'
                ? `OTP sent to +91 ${mobile}`
                : step === 'setup'
                  ? `Choose a password and a ${PIN_LENGTH}-digit PIN`
                  : 'Sign in to continue to your Mandal'}
            </Text>

            {step === 'main' && (
              <>
                <View style={styles.tabs}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.tab,
                      tab === 'pin' && styles.activeTab,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => switchTab('pin')}
                  >
                    <View style={styles.tabInner}>
                      <NativeIcon name="lock" size={15} color="#003158" />
                      <Text style={styles.tabText}>PIN</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.tab,
                      tab === 'password' && styles.activeTab,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => switchTab('password')}
                  >
                    <View style={styles.tabInner}>
                      <NativeIcon name="key" size={15} color="#003158" />
                      <Text style={styles.tabText}>Password</Text>
                    </View>
                  </Pressable>
                </View>
                <Field
                  label="Mobile Number"
                  icon={<NativeIcon name="phone" size={19} />}
                  valid={mobileValid}
                  error={mobile.length > 0 && !mobileValid}
                  value={mobile}
                  onChangeText={text => {
                    const next = text.replace(/\D/g, '').slice(0, 10);
                    setMobile(next);
                    setFailure(null);
                    clearMessages();
                    // Move on once the tenth digit goes in.
                    if (next.length === 10 && mobile.length < 10) {
                      credentialRef.current?.focus();
                    }
                  }}
                  keyboardType="number-pad"
                  placeholder="Enter mobile number"
                  editable={!busy}
                />
                {mobile.length > 0 && !mobileValid && (
                  <Text style={styles.mobileError}>
                    Enter a valid 10-digit number
                  </Text>
                )}
                {tab === 'pin' ? (
                  <CodeInput
                    ref={credentialRef}
                    label={`${PIN_LENGTH}-digit PIN`}
                    value={pin}
                    onChangeText={changePin}
                    secureTextEntry
                    editable={!busy}
                  />
                ) : (
                  <Field
                    ref={credentialRef}
                    label="Password"
                    icon={<NativeIcon name="lock" size={19} />}
                    valid={password.length >= MIN_PASSWORD_LENGTH}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    rightElement={
                      <Pressable
                        onPress={() => setShowPassword(value => !value)}
                        hitSlop={8}
                      >
                        {showPassword ? (
                          <NativeIcon name="eyeOff" size={18} />
                        ) : (
                          <NativeIcon name="eye" size={18} />
                        )}
                      </Pressable>
                    }
                    placeholder="Enter your password"
                    editable={!busy}
                    onSubmitEditing={() => login()}
                    returnKeyType="go"
                  />
                )}
                {feedback}
                <Pressable
                  style={({ pressed }) => [
                    styles.primary,
                    (busy || !canLogin) && styles.disabled,
                    pressed && styles.pressedPrimary,
                  ]}
                  onPress={() => login()}
                  disabled={busy || !canLogin}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryText}>Continue</Text>
                  )}
                </Pressable>
                {auth.biometricAvailable && auth.biometricEnabled && (
                  <>
                    <View style={styles.orRow}>
                      <View style={styles.orLine} />
                      <Text style={styles.biometricOr}>OR</Text>
                      <View style={styles.orLine} />
                    </View>

                    <Pressable
                      style={({ pressed }) => [
                        styles.biometricButton,
                        (biometricBusy || busy) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => biometricLogin()}
                      disabled={biometricBusy || busy}
                      accessibilityRole="button"
                    >
                      {biometricBusy ? (
                        <ActivityIndicator size="small" color="#003158" />
                      ) : (
                        <>
                          <NativeIcon
                            name="fingerprint"
                            size={24}
                            color="#003158"
                          />
                          <Text style={styles.biometricButtonText}>
                            Login with Biometrics
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </>
                )}
                <Pressable
                  style={({ pressed }) => pressed && styles.pressedLink}
                  onPress={startSetup}
                  disabled={busy}
                >
                  <Text style={styles.link}>
                    Forgot Password / First Time Setup
                  </Text>
                </Pressable>
              </>
            )}

            {step === 'otp' && (
              <>
                <View style={styles.stepIcon}>
                  <NativeIcon name="message" size={24} color="#FF862A" />
                </View>
                <CodeInput
                  label="6-digit OTP"
                  value={otp}
                  onChangeText={changeOtp}
                  editable={!busy}
                />
                {feedback}
                <Pressable
                  style={({ pressed }) => [
                    styles.primary,
                    (busy || !canVerifyOtp) && styles.disabled,
                    pressed && styles.pressedPrimary,
                  ]}
                  onPress={() => verifyOtp()}
                  disabled={busy || !canVerifyOtp}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryText}>Verify OTP</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => {
                    setStep('main');
                    clearMessages();
                  }}
                >
                  <Text style={styles.link}>Back to sign in</Text>
                </Pressable>
              </>
            )}

            {step === 'setup' && (
              <>
                <View style={styles.stepIcon}>
                  <NativeIcon name="shield" size={24} color="#FF862A" />
                </View>
                <Field
                  label="New Password"
                  icon={<NativeIcon name="lock" size={19} />}
                  valid={newPassword.length >= MIN_PASSWORD_LENGTH}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showSetupPass}
                  rightElement={
                    <Pressable
                      onPress={() => setShowSetupPass(value => !value)}
                      hitSlop={8}
                    >
                      {showSetupPass ? (
                        <NativeIcon name="eyeOff" size={18} />
                      ) : (
                        <NativeIcon name="eye" size={18} />
                      )}
                    </Pressable>
                  }
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  editable={!busy}
                />
                <Field
                  label="Confirm Password"
                  icon={<NativeIcon name="lock" size={19} />}
                  valid={
                    Boolean(confirmPassword) && confirmPassword === newPassword
                  }
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showSetupPass}
                  rightElement={
                    <Pressable
                      onPress={() => setShowSetupPass(value => !value)}
                      hitSlop={8}
                    >
                      {showSetupPass ? (
                        <NativeIcon name="eyeOff" size={18} />
                      ) : (
                        <NativeIcon name="eye" size={18} />
                      )}
                    </Pressable>
                  }
                  placeholder="Re-enter password"
                  editable={!busy}
                />
                <CodeInput
                  label={`${PIN_LENGTH}-digit PIN`}
                  value={newPin}
                  onChangeText={setNewPin}
                  secureTextEntry={!showSetupPin}
                  editable={!busy}
                  rightElement={setupPinToggle}
                />
                <CodeInput
                  label="Confirm PIN"
                  value={confirmPin}
                  onChangeText={setConfirmPin}
                  secureTextEntry={!showSetupPin}
                  editable={!busy}
                  rightElement={setupPinToggle}
                />
                {feedback}
                <Pressable
                  style={({ pressed }) => [
                    styles.primary,
                    (busy || !canCompleteSetup) && styles.disabled,
                    pressed && styles.pressedPrimary,
                  ]}
                  onPress={completeSetup}
                  disabled={busy || !canCompleteSetup}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryText}>Complete Setup</Text>
                  )}
                </Pressable>
              </>
            )}

            <View style={styles.footerBleed}>
              <SiteFooter
                onPrivacy={onOpenPrivacy}
                onTerms={onOpenTerms}
                onDeleteAccount={onOpenDeleteAccount}
              />
            </View>
          </View>
        </ScrollViewWithTop>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 8,
  },
  footerBleed: { marginTop: 'auto', marginHorizontal: -20, paddingTop: 14 },
  appLogo: {
    width: 78,
    height: 78,
    alignSelf: 'center',
    marginBottom: 6,
  },
  brandRow: {
    height: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mandalLogo: { width: 54, height: 54 },
  connectLogo: { width: 92, height: 64 },
  presents: {
    color: '#7894AA',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    alignItems: 'center',
  },
  content: { flex: 1, width: '100%' },
  title: {
    fontFamily: FONT_DISPLAY,
    color: '#003158',
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#7894AA',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F0F4F8',
    borderRadius: 13,
    padding: 4,
    marginBottom: 14,
  },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10 },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeTab: { backgroundColor: '#FFF', elevation: 2 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  tabText: { color: '#003158', fontWeight: '700' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DCE7F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 8,
    marginBottom: 12,
  },
  fieldError: { borderColor: '#EF4444' },
  // Border grows to 2px; padding/margin shrink by 1px so nothing shifts.
  fieldFocused: {
    borderWidth: 2,
    borderColor: '#003158',
    backgroundColor: '#F5F9FD',
    paddingHorizontal: 13,
    paddingTop: 7,
    marginBottom: 11,
    shadowColor: '#003158',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  fieldIcon: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  fieldContent: { flex: 1 },
  fieldTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  fieldStatus: { width: 24, alignItems: 'center', justifyContent: 'center' },
  fieldAction: { width: 24, alignItems: 'center', justifyContent: 'center' },
  codeBlock: { marginBottom: 12 },
  codeLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  codeLabel: { flex: 1 },
  pinToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pinToggleText: { color: '#7894AA', fontSize: 12, fontWeight: '700' },
  stepIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0E5',
    marginBottom: 10,
  },
  fieldLabel: { color: '#7894AA', fontSize: 11, fontWeight: '700' },
  fieldLabelFocused: { color: '#003158' },
  mobileError: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: -7,
    marginBottom: 8,
    paddingLeft: 4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: '#003158',
    fontSize: 16,
    paddingVertical: 7,
  },
  digitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  digitInput: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: '#DCE7F0',
    borderRadius: 12,
    color: '#003158',
    fontSize: 21,
    fontWeight: '700',
    paddingVertical: 0,
    textAlign: 'center',
  },
  digitInputFocused: {
    borderColor: '#003158',
    borderWidth: 2,
    backgroundColor: '#F5F9FD',
    shadowColor: '#003158',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  primary: {
    backgroundColor: '#003158',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 5,
  },
  disabled: { opacity: 0.55 },
  pressedPrimary: { backgroundColor: '#0A5688', transform: [{ scale: 0.98 }] },
  pressedLink: { opacity: 0.65 },
  primaryText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  feedback: { marginBottom: 12 },
  link: {
    color: '#E87522',
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 15,
  },
  error: { color: '#C53030', fontSize: 13, marginTop: 12 },
  warning: {
    color: '#C26B00',
    fontSize: 12,
    marginTop: 10,
  },
  notice: {
    color: '#56758D',
    fontSize: 13,
    marginTop: 10,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
  },
  orLine: { flex: 1, height: 1, backgroundColor: '#DCE7F0' },
  biometricOr: { color: '#7894AA', fontSize: 12, fontWeight: '700' },
  biometricButton: {
    minHeight: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#003158',
    backgroundColor: '#FFF',
  },
  biometricButtonText: { color: '#003158', fontSize: 15, fontWeight: '800' },
});
