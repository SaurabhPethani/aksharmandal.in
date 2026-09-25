import React from 'react';
import { Animated } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RawDialog, {
  clampTranslate,
  cropRect,
} from '../src/components/ImageCropDialog';
import { OverlayHost, OverlayProvider } from '../src/contexts/OverlayContext';

// Untyped JS whose callbacks TS reads as required.
type Props = Record<string, unknown>;
const ImageCropDialog = RawDialog as unknown as React.ComponentType<Props>;

// A portrait photo: at a 280 frame it covers 280x560, so it may travel 140
// either way vertically and not at all horizontally.
const FILE = {
  uri: 'file:///photo.jpg',
  width: 1000,
  height: 2000,
  fileName: 'photo.jpg',
};
const VIEWPORT = 280;
const BASE_SCALE = VIEWPORT / FILE.width;

/**
 * A one-finger touch history, in the shape `PanResponder` reads to work out
 * `dx` / `dy`. Driving the real handlers is the only way to catch a drag that
 * grants correctly and then stops tracking.
 */
function touchEvent(
  x: number,
  y: number,
  prevX: number,
  prevY: number,
  t: number,
) {
  return {
    nativeEvent: {
      touches: [{ identifier: 1, pageX: x, pageY: y }],
      changedTouches: [],
      pageX: x,
      pageY: y,
      timestamp: t,
    },
    touchHistory: {
      touchBank: [
        undefined,
        {
          touchActive: true,
          startPageX: 0,
          startPageY: 0,
          startTimeStamp: 0,
          currentPageX: x,
          currentPageY: y,
          currentTimeStamp: t,
          previousPageX: prevX,
          previousPageY: prevY,
          previousTimeStamp: t - 16,
        },
      ],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 1,
      mostRecentTimeStamp: t,
    },
  };
}

async function settle() {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(done => setTimeout(done, 0));
  });
}

function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 400, height: 800 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <OverlayProvider>
          <ImageCropDialog
            file={FILE}
            onCancel={() => {}}
            onCropped={async () => {}}
          />
          <OverlayHost />
        </OverlayProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

/** The crop frame (it takes the drag) and the photo's live transform values. */
function partsOf(tree: ReactTestRenderer.ReactTestRenderer) {
  const photo = tree.root.findAllByType(Animated.Image)[0];
  const style = Object.assign({}, ...[].concat(photo.props.style as never));
  const transform = style.transform as Array<Record<string, Animated.Value>>;
  const valueOf = (key: string) =>
    (
      transform.find(t => key in t)![key] as never as { __getValue(): number }
    ).__getValue();

  let frame: ReactTestRenderer.ReactTestInstance | null = photo.parent;
  while (frame && typeof frame.props?.onResponderMove !== 'function') {
    frame = frame.parent;
  }

  return {
    frame: frame!,
    tx: () => valueOf('translateX'),
    ty: () => valueOf('translateY'),
    zoom: () => valueOf('scale'),
  };
}

test('dragging moves the photo for the whole gesture, not just the first step', async () => {
  const tree = render();
  await settle();

  const { frame, ty } = partsOf(tree);
  expect(ty()).toBe(0);

  await ReactTestRenderer.act(async () => {
    frame.props.onStartShouldSetResponder(touchEvent(100, 100, 100, 100, 1000));
    frame.props.onResponderGrant(touchEvent(100, 100, 100, 100, 1000));
  });

  // Three moves. The origin of the drag has to survive between them — when it
  // lived on an object rebuilt every render, only the first move counted.
  for (let i = 1; i <= 3; i += 1) {
    await ReactTestRenderer.act(async () => {
      frame.props.onResponderMove(
        touchEvent(100, 100 + i * 20, 100, 100 + (i - 1) * 20, 1000 + i * 16),
      );
    });
  }

  expect(ty()).toBe(60);
  ReactTestRenderer.act(() => tree.unmount());
});

test('a drag cannot pull a frame edge past the photo', async () => {
  const tree = render();
  await settle();

  const { frame, tx, ty } = partsOf(tree);

  await ReactTestRenderer.act(async () => {
    frame.props.onStartShouldSetResponder(touchEvent(100, 100, 100, 100, 1000));
    frame.props.onResponderGrant(touchEvent(100, 100, 100, 100, 1000));
    // Far further than the photo can travel, and sideways where it cannot
    // travel at all: the photo is exactly frame-width at rest.
    frame.props.onResponderMove(touchEvent(900, 900, 100, 100, 1016));
  });

  expect(ty()).toBe(140);
  expect(tx()).toBe(0);
  ReactTestRenderer.act(() => tree.unmount());
});

test('the crop frame refuses to hand the gesture to anything above it', async () => {
  const tree = render();
  await settle();

  const { frame } = partsOf(tree);
  expect(frame.props.onResponderTerminationRequest({ nativeEvent: {} })).toBe(
    false,
  );
  expect(frame.props.onStartShouldSetResponder(touchEvent(0, 0, 0, 0, 0))).toBe(
    true,
  );
  ReactTestRenderer.act(() => tree.unmount());
});

describe('crop geometry', () => {
  const nat = { w: FILE.width, h: FILE.height };
  const common = { nat, baseScale: BASE_SCALE, zoom: 1, viewport: VIEWPORT };

  // The maths runs through a scale of 0.28, so compare to the pixel rather
  // than to the bit.
  const expectRect = (
    rect: { x: number; y: number; size: number },
    want: { x: number; y: number; size: number },
  ) => {
    expect(rect.x).toBeCloseTo(want.x, 6);
    expect(rect.y).toBeCloseTo(want.y, 6);
    expect(rect.size).toBeCloseTo(want.size, 6);
  };

  test('at rest the frame holds the middle of the photo', () => {
    expectRect(cropRect({ ...common, tx: 0, ty: 0 }), {
      x: 0,
      y: 500,
      size: 1000,
    });
  });

  test('dragged fully down, the frame holds the top of the photo', () => {
    expectRect(cropRect({ ...common, tx: 0, ty: 140 }), {
      x: 0,
      y: 0,
      size: 1000,
    });
  });

  test('dragged fully up, the frame holds the bottom of the photo', () => {
    expectRect(cropRect({ ...common, tx: 0, ty: -140 }), {
      x: 0,
      y: 1000,
      size: 1000,
    });
  });

  test('zooming in takes a smaller square from the middle', () => {
    expectRect(cropRect({ ...common, zoom: 2, tx: 0, ty: 0 }), {
      x: 250,
      y: 750,
      size: 500,
    });
  });

  test('travel is capped by the overhang on each axis', () => {
    const far = clampTranslate(999, 999, 280, 560, 280);
    expect(far.tx).toBeCloseTo(0, 6);
    expect(far.ty).toBeCloseTo(140, 6);

    const back = clampTranslate(-999, -999, 280, 560, 280);
    expect(back.tx).toBeCloseTo(0, 6);
    expect(back.ty).toBeCloseTo(-140, 6);

    // A photo no bigger than the frame on an axis cannot move along it.
    const tight = clampTranslate(50, 50, 280, 280, 280);
    expect(tight.tx).toBeCloseTo(0, 6);
    expect(tight.ty).toBeCloseTo(0, 6);
  });
});
