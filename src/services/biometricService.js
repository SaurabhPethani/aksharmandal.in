import * as Keychain from 'react-native-keychain';

const BIOMETRIC_SERVICE = 'in.aksharconnect.biometric';

const AUTH_PROMPT = {
  title: 'Akshar Connect',
  subtitle: 'Biometric authentication',
  description: 'Authenticate to access your account.',
  cancel: 'Cancel',
};

/**
 * Returns the biometric type supported by
 * the current device.
 */
export async function getBiometricType() {
  try {
    return await Keychain.getSupportedBiometryType();
  } catch (error) {
    console.warn('Unable to detect biometric type:', error);

    return null;
  }
}

/**
 * Returns true when the device has usable
 * biometric authentication.
 */
export async function isBiometricAvailable() {
  try {
    const type = await Keychain.getSupportedBiometryType();

    return type != null;
  } catch {
    return false;
  }
}

/**
 * Returns true when the user has configured
 * biometric login for Akshar Connect.
 */
export async function isBiometricLoginEnabled() {
  try {
    return await Keychain.hasGenericPassword({
      service: BIOMETRIC_SERVICE,
    });
  } catch {
    return false;
  }
}

/**
 * Store access token protected by biometric
 * authentication.
 */
export async function enableBiometricLogin(token) {
  if (!token) {
    throw new Error('Cannot enable biometric login without an access token.');
  }

  const available = await isBiometricAvailable();

  if (!available) {
    throw new Error(
      'Biometric authentication is not available on this device.',
    );
  }

  await Keychain.setGenericPassword('akshar-user', token, {
    service: BIOMETRIC_SERVICE,

    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,

    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,

    authenticationType: Keychain.AUTHENTICATION_TYPE.BIOMETRICS,

    authenticationPrompt: AUTH_PROMPT,
  });

  return true;
}

/**
 * Ask the OS for biometric authentication
 * and retrieve the protected access token.
 */
export async function authenticateWithBiometric() {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: BIOMETRIC_SERVICE,

      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,

      authenticationType: Keychain.AUTHENTICATION_TYPE.BIOMETRICS,

      authenticationPrompt: AUTH_PROMPT,
    });

    if (!credentials) {
      return null;
    }

    return {
      username: credentials.username,

      token: credentials.password,
    };
  } catch (error) {
    console.warn('Biometric authentication failed:', error);

    return null;
  }
}

/**
 * Remove biometric credentials.
 *
 * Does NOT log the user out.
 */
export async function disableBiometricLogin() {
  try {
    await Keychain.resetGenericPassword({
      service: BIOMETRIC_SERVICE,
    });

    return true;
  } catch (error) {
    console.error('Failed to disable biometric login:', error);

    return false;
  }
}

/**
 * Update the biometric token after
 * access-token refresh/account switching.
 */
export async function updateBiometricToken(token) {
  try {
    if (!token) {
      return false;
    }

    const enabled = await isBiometricLoginEnabled();

    if (!enabled) {
      return false;
    }

    await Keychain.setGenericPassword('akshar-user', token, {
      service: BIOMETRIC_SERVICE,

      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,

      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,

      authenticationType: Keychain.AUTHENTICATION_TYPE.BIOMETRICS,

      authenticationPrompt: AUTH_PROMPT,
    });

    return true;
  } catch (error) {
    console.warn('Unable to update biometric token:', error);

    return false;
  }
}
