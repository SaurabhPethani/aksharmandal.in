import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
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
 * How far the photo may travel before a frame edge would show through.
 *
 * The photo is laid out centred and moved with a transform, so the limit is
 * symmetric: half the overhang on each axis. A side that does not overhang
 * cannot move at all.
 */
export function clampTranslate(tx, ty, displayW, displayH, viewport) {
  const limitX = Math.max(0, (displayW - viewport) / 2);
  const limitY = Math.max(0, (displayH - viewport) / 2);
  return {
    tx: Math.min(limitX, Math.max(-limitX, tx)),
    ty: Math.min(limitY, Math.max(-limitY, ty)),
  };
}

/**
 * The square of the ORIGINAL image the frame is currently showing.
 *
 * The photo sits centred, scaled by `baseScale * zoom` and shifted by
 * `(tx, ty)` screen pixels, so the frame's top-left corner lands this far into
 * the source. Rounding must not push the rect past the edge, hence the clamps.
 */
export function cropRect({ nat, baseScale, zoom, tx, ty, viewport }) {
  const scale = baseScale * zoom;
  const displayW = nat.w * scale;
  const displayH = nat.h * scale;
  // Where the photo's top-left corner sits, measured from the frame's.
  const originX = viewport / 2 + tx - displayW / 2;
  const originY = viewport / 2 + ty - displayH / 2;
  const size = viewport / scale;
  const fit = (value, natural) =>
    Math.max(0, Math.min(value, Math.max(0, natural - size)));
  return {
    x: fit(-originX / scale, nat.w),
    y: fit(-originY / scale, nat.h),
    size,
  };
}

const distanceBetween = touches => {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};

/**
 * Crop-and-zoom before upload. `file` is a picked asset —
 * `{ uri, width, height, fileName, type }` — and `onCropped` is handed the
 * square JPEG as `{ uri, name, type, size }`, ready for FormData.
 *
 * The gesture drives `Animated.Value`s rather than state: a `setState` per
 * touch move re-rendered the whole dialog sixty times a second, which is what
 * made dragging feel like it was fighting back.
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
  const [saving, setSaving] = useState(false);

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  /**
   * The same three numbers, readable synchronously.
   *
   * An `Animated.Value` has no public getter, and the responder has to know
   * where the photo is *now* to work out where to put it next. `geometry` also
   * carries what the gesture needs so the handlers can stay closed over one
   * stable object — they are created once and would otherwise capture the
   * first render's `nat`.
   */
  const live = useRef({ tx: 0, ty: 0, zoom: 1, nat: null, viewport, base: 1 });

  const baseScale = nat ? Math.max(viewport / nat.w, viewport / nat.h) : 1;
  const baseW = nat ? nat.w * baseScale : 0;
  const baseH = nat ? nat.h * baseScale : 0;

  live.current.nat = nat;
  live.current.viewport = viewport;
  live.current.base = baseScale;

  /** Put the photo back in the middle, at rest. */
  const reset = useRef(() => {
    translateX.setValue(0);
    translateY.setValue(0);
    scale.setValue(1);
    live.current.tx = 0;
    live.current.ty = 0;
    live.current.zoom = 1;
  }).current;

  useEffect(() => {
    if (!file) {
      setNat(null);
      return;
    }
    reset();
    if (file.width && file.height) {
      setNat({ w: file.width, h: file.height });
      return;
    }
    Image.getSize(
      file.uri,
      (w, h) => setNat({ w, h }),
      () => setNat(null),
    );
  }, [file, reset]);

  /** Move to `tx`/`ty`, clamped, and remember where that was. */
  const place = useRef((tx, ty, zoom) => {
    const { nat: n, viewport: v, base } = live.current;
    if (!n) return;
    const next = clampTranslate(
      tx,
      ty,
      n.w * base * zoom,
      n.h * base * zoom,
      v,
    );
    live.current.tx = next.tx;
    live.current.ty = next.ty;
    live.current.zoom = zoom;
    translateX.setValue(next.tx);
    translateY.setValue(next.ty);
    scale.setValue(zoom);
  }).current;

  /**
   * Zoom about the FRAME's centre, so the pixel under the middle stays put.
   * Scaling the photo about that point moves its centre by the same factor,
   * which is all `tx`/`ty` have to follow.
   */
  const zoomTo = useRef(next => {
    const { tx, ty, zoom } = live.current;
    const target = Math.min(MAX_ZOOM, Math.max(1, next));
    const factor = target / zoom;
    place(tx * factor, ty * factor, target);
  }).current;

  const gesture = useRef({
    tx: 0,
    ty: 0,
    zoom: 1,
    distance: 0,
    pinching: false,
  });

  const pan = useRef(
    PanResponder.create({
      // Claimed on touch-down: whoever claims first keeps the gesture, and the
      // dialog is no longer wrapped in a scroll view that could contest it.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: () => {
        gesture.current = {
          tx: live.current.tx,
          ty: live.current.ty,
          zoom: live.current.zoom,
          distance: 0,
          pinching: false,
        };
      },

      onPanResponderMove: (event, state) => {
        const touches = event.nativeEvent.touches ?? [];
        const from = gesture.current;

        if (touches.length >= 2) {
          const spread = distanceBetween(touches);
          // The pinch starts the first frame a second finger is down, not when
          // the gesture began — otherwise the photo jumps as it lands.
          if (!from.pinching) {
            from.pinching = true;
            from.distance = spread;
            from.tx = live.current.tx;
            from.ty = live.current.ty;
            from.zoom = live.current.zoom;
            return;
          }
          if (!from.distance) return;
          const wanted = from.zoom * (spread / from.distance);
          const target = Math.min(MAX_ZOOM, Math.max(1, wanted));
          const factor = target / from.zoom;
          place(from.tx * factor, from.ty * factor, target);
          return;
        }

        // Back to one finger: carry on panning from wherever the pinch left it.
        if (from.pinching) {
          from.pinching = false;
          from.tx = live.current.tx;
          from.ty = live.current.ty;
          from.zoom = live.current.zoom;
          from.dx = state.dx;
          from.dy = state.dy;
        }
        const dx = state.dx - (from.dx ?? 0);
        const dy = state.dy - (from.dy ?? 0);
        place(from.tx + dx, from.ty + dy, live.current.zoom);
      },
    }),
  ).current;

  const save = async () => {
    if (!file || !nat) return;
    setSaving(true);
    try {
      const { x, y, size } = cropRect({
        nat,
        baseScale,
        zoom: live.current.zoom,
        tx: live.current.tx,
        ty: live.current.ty,
        viewport,
      });
      const cropped = await imageEditor().cropImage(file.uri, {
        offset: { x, y },
        size: { width: size, height: size },
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
      description="Drag to reposition. Pinch, or use the slider, to zoom."
      size="sm"
      dismissible={!working}
      // The photo is dragged, so the body must not scroll — see Modal.
      scrollable={false}
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
            <Animated.Image
              source={{ uri: file.uri }}
              style={[
                styles.photo,
                {
                  left: (viewport - baseW) / 2,
                  top: (viewport - baseH) / 2,
                  width: baseW,
                  height: baseH,
                  transform: [{ translateX }, { translateY }, { scale }],
                },
              ]}
            />
          ) : null}

          <CircleGuide viewport={viewport} />
        </View>

        <View style={[styles.zoomRow, { width: viewport }]}>
          <MaterialCommunityIcons
            name="magnify-minus-outline"
            size={space(4)}
            color={COLORS.textMuted}
          />
          <ZoomSlider scale={scale} disabled={!nat} onChange={zoomTo} />
          <MaterialCommunityIcons
            name="magnify-plus-outline"
            size={space(4)}
            color={COLORS.textMuted}
          />
        </View>
      </View>
    </Modal>
  );
}

/**
 * The circle the avatar will be cropped to, as a hole in a dim surround.
 *
 * Drawn rather than bordered: this used to be a `borderWidth` as wide as the
 * whole frame, which React Native renders as four mitred trapezoids — visible
 * diagonal seams across the photo, re-rasterised on every drag frame.
 */
const CircleGuide = React.memo(function CircleGuide({ viewport }) {
  const radius = viewport / 2 - 1;
  const centre = viewport / 2;
  const surround = useMemo(
    () =>
      [
        `M0 0 H${viewport} V${viewport} H0 Z`,
        `M${centre - radius} ${centre}`,
        `a ${radius} ${radius} 0 1 0 ${radius * 2} 0`,
        `a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`,
        'Z',
      ].join(' '),
    [viewport, centre, radius],
  );

  return (
    <Svg
      pointerEvents="none"
      width={viewport}
      height={viewport}
      style={StyleSheet.absoluteFill}
    >
      <Path d={surround} fill="rgba(0,0,0,0.45)" fillRule="evenodd" />
      <Circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={2}
      />
    </Svg>
  );
});

/**
 * Zoom, as a track the thumb is dragged along.
 *
 * The position is taken from where the touch landed plus the gesture's own
 * `dx`. Reading `locationX` on every move was the jitter: mid-drag that is
 * measured against whichever child is under the finger, not the track.
 */
function ZoomSlider({ scale, disabled, onChange }) {
  const [track, setTrack] = useState(0);
  const live = useRef({ track, onChange, startX: 0 });
  live.current.track = track;
  live.current.onChange = onChange;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: event => {
          live.current.startX = event.nativeEvent.locationX;
          seek(live.current.startX);
        },
        onPanResponderMove: (_, state) => seek(live.current.startX + state.dx),
      }),
    [],
  );

  function seek(rawX) {
    const width = live.current.track;
    if (!width) return;
    const x = Math.min(width, Math.max(0, rawX));
    live.current.onChange(1 + (x / width) * (MAX_ZOOM - 1));
  }

  // Driven straight off the same value the photo uses, so the thumb cannot
  // drift out of step with what is on screen.
  const travelled = scale.interpolate({
    inputRange: [1, MAX_ZOOM],
    outputRange: [0, Math.max(0, track)],
    extrapolate: 'clamp',
  });

  return (
    <View
      {...(disabled ? {} : pan.panHandlers)}
      onLayout={e => setTrack(e.nativeEvent.layout.width)}
      accessibilityRole="adjustable"
      accessibilityLabel="Zoom"
      style={styles.sliderHit}
    >
      <View style={styles.sliderTrack}>
        <Animated.View style={[styles.sliderFill, { width: travelled }]} />
      </View>
      <Animated.View
        pointerEvents="none"
        style={[styles.sliderThumb, { transform: [{ translateX: travelled }] }]}
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
