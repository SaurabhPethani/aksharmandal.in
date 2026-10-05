import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, PermissionsAndroid, StyleSheet, View } from 'react-native';
import { Camera } from 'react-native-camera-kit';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { Button } from '../ui';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

// QR scanning over the device camera, via react-native-camera-kit — the native
// replacement for the web's jsQR / BarcodeDetector + getUserMedia path.
//
// The data contract is preserved: `onScan(rawDecodedString)` is handed the full
// raw QR text (format `AKC1:{id}:{sig}`). The id is NOT trusted locally — the
// backend verifies the HMAC signature on mark — so the raw code travels as-is.

// A held-up code is read many times a second; the same value is ignored for this
// long so one physical scan produces one mark.
const REPEAT_MS = 2500;

async function ensureCameraPermission() {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Camera permission',
        message: 'Scanning a member’s QR code needs access to the camera.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export default function QrScanner({
  onScan,
  disabled = false,
  disabledHint,
  /** Named under the frame, so what is being marked is never in doubt. */
  sessionLabel,
  /** What the strip under the frame says after the last scan. */
  status,
  /** Colour of that strip: '' neutral, 'ok' green, 'warn' amber, 'error' red. */
  statusTone = '',
  /** Told whenever the camera goes live or stops. */
  onActiveChange,
}) {
  const [state, setState] = useState('idle'); // idle | starting | scanning | error
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(false);
  const lastRef = useRef({ value: null, at: 0 });
  const flashTimer = useRef(0);

  const active = state === 'scanning' || state === 'starting';
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  useEffect(
    () => () => {
      clearTimeout(flashTimer.current);
    },
    [],
  );

  const start = useCallback(async () => {
    if (disabled) return;
    setError(null);
    setState('starting');
    const ok = await ensureCameraPermission();
    if (!ok) {
      setState('error');
      setError('Camera permission was denied. Allow camera access in Settings, then try again.');
      return;
    }
    setState('scanning');
  }, [disabled]);

  const stop = useCallback(() => {
    clearTimeout(flashTimer.current);
    setState('idle');
  }, []);

  const onRead = useCallback(
    event => {
      const value = event?.nativeEvent?.codeStringValue;
      if (!value) return;
      const now = Date.now();
      if (lastRef.current.value === value && now - lastRef.current.at < REPEAT_MS) return;
      lastRef.current = { value, at: now };
      setFlash(true);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(false), 600);
      onScan?.(value);
    },
    [onScan],
  );

  // Idle: no camera, no preview — just the one thing to press.
  if (state === 'idle') {
    return (
      <View style={styles.stack}>
        <Button variant="primary" onPress={start} disabled={disabled} style={styles.startBtn}>
          <MaterialCommunityIcons name="camera" size={space(4)} />
          Start Scanner
        </Button>
        {disabled ? (
          <Text style={styles.disabledHint}>
            {disabledHint ?? 'Select a Sabha to enable the scanner.'}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {/* A square viewfinder, centred — a QR code is square. */}
      <View style={styles.frame}>
        {state === 'scanning' ? (
          <Camera
            style={styles.camera}
            cameraType="back"
            scanBarcode
            onReadCode={onRead}
            showFrame={false}
          />
        ) : (
          <View style={styles.cameraOff}>
            <View style={styles.offIcon}>
              <MaterialCommunityIcons name="line-scan" size={space(7)} color="rgba(255,255,255,0.8)" />
            </View>
            <Text style={styles.offTitle}>
              {state === 'starting' ? 'Starting camera…' : 'Scanner is off'}
            </Text>
            <Text style={styles.offHint}>
              {disabled
                ? disabledHint ?? 'Select a Sabha to enable the scanner.'
                : 'Start the scanner and hold a member’s QR code in view.'}
            </Text>
          </View>
        )}

        {/* Viewfinder: orange brackets at the corners of the frame, a white
            square in the middle marking where to hold the code — matching the
            web scanner so the two read as one tool. */}
        {state === 'scanning' ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={styles.reticleBox} />
            <View style={styles.bracketArea}>
              <View style={[styles.bracket, styles.bracketTL]} />
              <View style={[styles.bracket, styles.bracketTR]} />
              <View style={[styles.bracket, styles.bracketBL]} />
              <View style={[styles.bracket, styles.bracketBR]} />
            </View>
          </View>
        ) : null}

        {/* Success flash. */}
        {flash ? (
          <View pointerEvents="none" style={styles.flashOverlay}>
            <MaterialCommunityIcons name="check-circle" size={space(16)} color={COLORS.white} />
          </View>
        ) : null}
      </View>

      {/* One line for what the scanner is doing / the last scan's outcome. */}
      <View style={[styles.statusBox, TONE_BOX[statusTone] ?? styles.statusNeutral]}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              TONE_DOT[statusTone] ?? (state === 'scanning' ? styles.dotLive : styles.dotIdle),
            ]}
          />
          <Text style={[styles.statusText, TONE_TEXT[statusTone] ?? styles.statusTextNeutral]}>
            {state === 'starting'
              ? 'Starting camera…'
              : status || 'Ready — point camera at a QR code'}
          </Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.footerRow}>
        <Button variant="ghost" onPress={stop} style={styles.stopBtn} textStyle={styles.stopText}>
          <MaterialCommunityIcons name="close" size={space(4)} color={COLORS.dangerFg} />
          Stop Scanner
        </Button>
        {sessionLabel ? (
          <View style={styles.sessionCopy}>
            <Text style={styles.eyebrow}>Current session</Text>
            <Text style={styles.sessionLabel}>{sessionLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const TONE_BOX = StyleSheet.create({
  ok: { borderColor: 'rgba(21,128,61,0.3)', backgroundColor: COLORS.successBg },
  warn: { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  error: { borderColor: 'rgba(185,28,28,0.3)', backgroundColor: COLORS.dangerBg },
});
const TONE_TEXT = StyleSheet.create({
  ok: { color: COLORS.successFg },
  warn: { color: '#B45309' },
  error: { color: COLORS.dangerFg },
});
const TONE_DOT = StyleSheet.create({
  ok: { backgroundColor: COLORS.successFg },
  warn: { backgroundColor: '#F59E0B' },
  error: { backgroundColor: COLORS.dangerFg },
});

const styles = StyleSheet.create({
  stack: { gap: space(3) },
  startBtn: { width: '100%', paddingVertical: space(3.5) },
  disabledHint: { textAlign: 'center', fontSize: TEXT.sm, color: COLORS.textMuted },
  frame: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: rem26(),
    aspectRatio: 1,
    overflow: 'hidden',
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.primary,
  },
  camera: { flex: 1 },
  cameraOff: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: space(2) },
  offIcon: {
    width: space(14),
    height: space(14),
    borderRadius: RADII.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offTitle: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.white },
  offHint: {
    marginTop: space(1),
    maxWidth: '80%',
    textAlign: 'center',
    fontSize: TEXT.xs,
    color: 'rgba(255,255,255,0.7)',
  },
  // White square at the centre of the frame (web `inset-[18%]` → a 64% box).
  reticleBox: {
    position: 'absolute',
    top: '18%',
    left: '18%',
    right: '18%',
    bottom: '18%',
    borderRadius: 6,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  // Corner brackets sit just inside the frame edge (web `inset-[6%]`).
  bracketArea: { position: 'absolute', top: '6%', left: '6%', right: '6%', bottom: '6%' },
  bracket: {
    position: 'absolute',
    width: space(8),
    height: space(8),
    borderRadius: 2,
    borderColor: COLORS.accent,
  },
  bracketTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  bracketTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  bracketBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  bracketBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(21,128,61,0.25)',
  },
  statusBox: {
    borderRadius: RADII.control,
    borderWidth: 1,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  statusNeutral: { borderStyle: 'dashed', borderColor: COLORS.lineStrong, backgroundColor: COLORS.bg },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2) },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotLive: { backgroundColor: '#3B82F6' },
  dotIdle: { backgroundColor: '#C0CDE0' },
  statusText: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold },
  statusTextNeutral: { color: COLORS.primary },
  error: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.3)',
    backgroundColor: COLORS.dangerBg,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.medium,
    color: COLORS.dangerFg,
  },
  footerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space(3),
  },
  stopBtn: { paddingHorizontal: 0 },
  stopText: { color: COLORS.dangerFg, fontWeight: WEIGHT.semibold },
  sessionCopy: { alignItems: 'flex-end' },
  eyebrow: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
  },
  sessionLabel: { fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
});

// 26rem cap on the viewfinder, matching the web's `min(52vh, 26rem, 100%)`.
function rem26() {
  return 26 * 15;
}
