// Small JSON values kept on the device — the app's stand-in for the web's
// localStorage. Every call fails soft: a value that cannot be read is simply
// not there, and one that cannot be written is asked for again next time.

function nativeStorage() {
  try {
    // Required on use, to keep the native-only dependency out of Jest.
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    return null;
  }
}

export async function readStored(key) {
  try {
    const raw = await nativeStorage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function writeStored(key, value) {
  try {
    await nativeStorage()?.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export async function removeStored(key) {
  try {
    await nativeStorage()?.removeItem(key);
  } catch {
    // ignore
  }
}
