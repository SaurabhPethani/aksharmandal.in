import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Modal } from './Overlays';
import { Button } from './ui';
import { COLORS, RADII, space } from '../constants/theme';

const MAX_VIEWPORT = 280; // the on-screen crop frame
const OUTPUT = 512; // the saved square, ample for an avatar
const MAX_ZOOM = 4;

/**
 * Loaded on use, not at import: the module calls
 * `TurboModuleRegistry.getEnforcing` at the top level, so on a binary built
 * before the package was installed a plain import takes the whole app down at
 * startup instead of just this dialog.
 */
function imageEditor() {
  try {
    return require('@react-native-community/image-editor').default;
  } catch {
    throw new Error(
      'The image cropper is not in this build. Rebuild the app (npm run android) and try again.',
    );
  }
}

/**
 * Crop-and-zoom before upload. `file` is a picked asset —
 * `{ uri, width, height, fileName, type }` — and `onCropped` is handed the
 * square JPEG as `{ uri, name, type, size }`, ready for FormData.
 */
export default function ImageCropDialog({
  file,
  onCancel,
  onCropped,
  onError,
  busy = false,
}) {
  const { width: screenWidth } = useWindowDimensions();
  const viewport = Math.min(MAX_VIEWPORT, screenWidth - space(16));

  const [nat, setNat] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  // Read inside the pan responder, which is created once.
  const live = useRef({ offset, zoom, nat, viewport });
  live.current = { offset, zoom, nat, viewport };

  const baseScale = nat ? Math.max(viewport / nat.w, viewport / nat.h) : 1;
  const displayScale = baseScale * zoom;
  const dW = nat ? nat.w * displayScale : 0;
  const dH = nat ? nat.h * displayScale : 0;

  useEffect(() => {
    if (!file) {
      setNat(null);
      return;
    }
    const centre = (w, h) => {
      const bs = Math.max(viewport / w, viewport / h);
      setNat({ w, h });
      setZoom(1);
      setOffset({ x: (viewport - w * bs) / 2, y: (viewport - h * bs) / 2 });
    };

    if (file.width && file.height) {
      centre(file.width, file.height);
      return;
    }
    Image.getSize(
      file.uri,
      (w, h) => centre(w, h),
      () => setNat(null),
    );
  }, [file, viewport]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        live.current.start = live.current.offset;
      },
      onPanResponderMove: (_, g) => {
        const { start, nat: n, zoom: z, viewport: v } = live.current;
        if (!n || !start) return;
        const scale = Math.max(v / n.w, v / n.h) * z;
        setOffset(
          clamp(
            { x: start.x + g.dx, y: start.y + g.dy },
            n.w * scale,
            n.h * scale,
            v,
          ),
        );
      },
    }),
  ).current;

  // Zoom about the frame centre, so the middle of the photo stays put.
  const applyZoom = next => {
    if (!nat) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const prevScale = baseScale * zoom;
    const nextScale = baseScale * z;
    const cx = (viewport / 2 - offset.x) / prevScale;
    const cy = (viewport / 2 - offset.y) / prevScale;
    setZoom(z);
    setOffset(
      clamp(
        {
          x: viewport / 2 - cx * nextScale,
          y: viewport / 2 - cy * nextScale,
        },
        nat.w * nextScale,
        nat.h * nextScale,
        viewport,
      ),
    );
  };

  const save = async () => {
    if (!file || !nat) return;
    setSaving(true);
    try {
      const srcSize = viewport / displayScale;
      const cropped = await imageEditor().cropImage(file.uri, {
        offset: {
          x: clampSource(-offset.x / displayScale, nat.w, srcSize),
          y: clampSource(-offset.y / displayScale, nat.h, srcSize),
        },
        size: { width: srcSize, height: srcSize },
        displaySize: { width: OUTPUT, height: OUTPUT },
        format: 'jpeg',
        quality: 0.9,
      });
      const base = String(file.fileName || 'photo').replace(/\.[^.]+$/, '');
      await onCropped({
        uri: cropped.uri,
        name: `${base}.jpg`,
        type: 'image/jpeg',
        size: cropped.size,
      });
    } catch (err) {
      onError?.(err);
    } finally {
      setSaving(false);
    }
  };

  const working = saving || busy;

  return (
    <Modal
      isOpen={Boolean(file)}
      onClose={working ? () => {} : onCancel}
      title="Adjust your photo"
      description="Drag to reposition, and zoom to fit."
      size="sm"
      dismissible={!working}
      footer={
        <>
          <Button variant="ghost" onPress={onCancel} disabled={working}>
            Cancel
          </Button>
          <Button variant="primary" onPress={save} busy={working}>
            Save photo
          </Button>
        </>
      }
    >
      <View style={styles.centre}>
        <View
          {...pan.panHandlers}
          style={[styles.frame, { width: viewport, height: viewport }]}
        >
          {file?.uri && nat ? (
            <Image
              source={{ uri: file.uri }}
              style={[
                styles.photo,
                { left: offset.x, top: offset.y, width: dW, height: dH },
              ]}
            />
          ) : null}

          {/* Circular guide — how the avatar will show. The crop itself is the
              square frame; the ring only marks the visible circle. */}
          <View
            pointerEvents="none"
            style={[styles.guide, { borderWidth: viewport }]}
          />
        </View>

        <View style={[styles.zoomRow, { width: viewport }]}>
          <MaterialCommunityIcons
            name="magnify-plus-outline"
            size={space(4)}
            color={COLORS.textMuted}
          />
          <ZoomSlider
            value={zoom}
            disabled={!nat}
            onChange={applyZoom}
          />
        </View>
      </View>
    </Modal>
  );
}

/** Keeps the image covering the frame: offset stays within [viewport − size, 0]. */
function clamp(o, dw, dh, viewport) {
  return {
    x: Math.min(0, Math.max(viewport - dw, o.x)),
    y: Math.min(0, Math.max(viewport - dh, o.y)),
  };
}

/** Rounding must not push the source rect past the edge of the image. */
const clampSource = (value, natural, size) =>
  Math.max(0, Math.min(value, Math.max(0, natural - size)));

function ZoomSlider({ value, disabled, onChange }) {
  const [track, setTrack] = useState(0);
  const live = useRef({ track, onChange });
  live.current = { track, onChange };

  const ratio = (value - 1) / (MAX_ZOOM - 1);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: e => seek(e),
        onPanResponderMove: e => seek(e),
      }),
    [],
  );

  function seek(e) {
    const width = live.current.track;
    if (!width) return;
    const x = Math.min(width, Math.max(0, e.nativeEvent.locationX));
    live.current.onChange(1 + (x / width) * (MAX_ZOOM - 1));
  }

  return (
    <View
      {...(disabled ? {} : pan.panHandlers)}
      onLayout={e => setTrack(e.nativeEvent.layout.width)}
      accessibilityRole="adjustable"
      accessibilityLabel="Zoom"
      style={styles.sliderHit}
    >
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${ratio * 100}%` }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.sliderThumb, { left: `${ratio * 100}%` }]}
      />
    </View>
  );
}

const THUMB = space(4);

const styles = StyleSheet.create({
  centre: { alignItems: 'center' },
  photo: { position: 'absolute' },
  frame: {
    overflow: 'hidden',
    borderRadius: RADII['2xl'],
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  // A border as thick as the frame, rounded to a circle, is the web's
  // `box-shadow: 0 0 0 9999px` cut-out.
  guide: {
    ...StyleSheet.absoluteFill,
    borderRadius: 9999,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  zoomRow: {
    marginTop: space(4),
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
  },
  sliderHit: { flex: 1, height: space(6), justifyContent: 'center' },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.lineStrong,
    overflow: 'hidden',
  },
  sliderFill: { height: '100%', backgroundColor: COLORS.primary },
  sliderThumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: THUMB / 2,
    backgroundColor: COLORS.primary,
  },
});
