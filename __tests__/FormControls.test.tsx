import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OverlayHost, OverlayProvider } from '../src/contexts/OverlayContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { useToast } from '../src/hooks/core';
import * as Form from '../src/components/form';
import RawImageCropDialog from '../src/components/ImageCropDialog';
import { Text as RawText } from '../src/components/Typography';

// The components under test are untyped JS, so TS infers their props from the
// destructuring rather than from a contract. Treat them as open here.
type Props = Record<string, unknown>;
const asComponent = (c: unknown) => c as React.ComponentType<Props>;

const Select = asComponent(Form.Select);
const Combobox = asComponent(Form.Combobox);
const DatePicker = asComponent(Form.DatePicker);
const Checkbox = asComponent(Form.Checkbox);
const ImageCropDialog = asComponent(RawImageCropDialog);
const Text = asComponent(RawText);

function wrap(node: React.ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 400, height: 800 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <OverlayProvider>
        <ToastProvider>
          {node}
          <OverlayHost />
        </ToastProvider>
      </OverlayProvider>
    </SafeAreaProvider>
  );
}

const texts = (tree: ReactTestRenderer.ReactTestRenderer) => {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === 'string') {
      out.push(n);
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    const node = n as { children?: unknown };
    if (node?.children) walk(node.children);
  };
  walk(tree.toJSON());
  return out;
};

const pressable = (tree: ReactTestRenderer.ReactTestRenderer, label: string) =>
  tree.root.find(
    n =>
      n.props?.accessibilityLabel === label &&
      typeof n.props?.onPress === 'function',
  );

/** The nearest pressable ancestor of the node carrying this text. */
function pressableWithText(
  tree: ReactTestRenderer.ReactTestRenderer,
  label: string,
) {
  const leaf = tree.root.findAll(
    n => n.children.length === 1 && n.children[0] === label,
    { deep: true },
  )[0];
  let at: typeof leaf | null = leaf;
  while (at && typeof at.props?.onPress !== 'function') at = at.parent;
  if (!at) throw new Error(`No pressable around "${label}"`);
  return at;
}

const trees: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(async () => {
  while (trees.length) {
    const tree = trees.pop()!;
     
    await ReactTestRenderer.act(async () => tree.unmount());
  }
});

const OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
];

test('Select opens its list and reports the pick', async () => {
  const onChange = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      wrap(
        <Select
          label="Gender"
          value=""
          options={OPTIONS}
          placeholder="Select gender"
          onChange={onChange}
        />,
      ),
    );
  });
  trees.push(tree);

  expect(texts(tree)).toContain('Select gender');

  await ReactTestRenderer.act(async () => {
    pressable(tree, 'Gender').props.onPress();
  });
  expect(texts(tree)).toContain('Female');

  await ReactTestRenderer.act(async () => {
    pressableWithText(tree, 'Male').props.onPress();
  });
  expect(onChange).toHaveBeenCalledWith('Male');
});

test('Combobox filters as you type', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      wrap(
        <Combobox
          label="Member"
          value=""
          options={[
            { value: '1', label: 'Amit Limbasia', meta: '9876543210' },
            { value: '2', label: 'Nirav Patel', meta: '9000000000' },
          ]}
          placeholder="Search Mandal users…"
          onChange={jest.fn()}
        />,
      ),
    );
  });
  trees.push(tree);

  await ReactTestRenderer.act(async () => {
    pressable(tree, 'Member').props.onPress();
  });
  expect(texts(tree)).toContain('Nirav Patel');

  const search = tree.root.findAll(n => typeof n.props?.onChangeText === 'function')[0];
  await ReactTestRenderer.act(async () => {
    search.props.onChangeText('nirav');
  });
  const shown = texts(tree);
  expect(shown).toContain('Nirav Patel');
  expect(shown).not.toContain('Amit Limbasia');
});

test('DatePicker opens a calendar and returns yyyy-MM-dd', async () => {
  const onChange = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      wrap(
        <DatePicker
          label="Date of Birth"
          value="1995-04-12"
          max="2026-09-20"
          onChange={onChange}
        />,
      ),
    );
  });
  trees.push(tree);

  // The trigger shows the human form, not the ISO one.
  expect(texts(tree)).toContain('12 Apr 1995');

  await ReactTestRenderer.act(async () => {
    pressable(tree, 'Date of Birth').props.onPress();
  });
  const open = texts(tree);
  expect(open).toContain('April');
  expect(open).toContain('1995');

  await ReactTestRenderer.act(async () => {
    pressable(tree, '1995-04-20').props.onPress();
  });
  expect(onChange).toHaveBeenCalledWith('1995-04-20');
});

test('DatePicker will not offer a day past max', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      wrap(<DatePicker label="DOB" value="2026-09-10" max="2026-09-20" onChange={jest.fn()} />),
    );
  });
  trees.push(tree);
  trees.push(tree);
  await ReactTestRenderer.act(async () => {
    pressable(tree, 'DOB').props.onPress();
  });

  expect(pressable(tree, '2026-09-19').props.accessibilityState.disabled).toBe(false);
  expect(pressable(tree, '2026-09-21').props.accessibilityState.disabled).toBe(true);
});

test('Checkbox toggles', async () => {
  const onChange = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      wrap(<Checkbox label="Doing Pooja" checked={false} onChange={onChange} />),
    );
  });
  trees.push(tree);
  await ReactTestRenderer.act(async () => {
    pressable(tree, 'Doing Pooja').props.onPress();
  });
  expect(onChange).toHaveBeenCalledWith(true);
});

test('ImageCropDialog crops to a 512 square', async () => {
  const onCropped = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      wrap(
        <ImageCropDialog
          file={{
            uri: 'file:///tmp/pic.jpg',
            width: 1200,
            height: 800,
            fileName: 'pic.jpg',
          }}
          onCancel={jest.fn()}
          onCropped={onCropped}
        />,
      ),
    );
  });
  trees.push(tree);

  expect(texts(tree)).toContain('Adjust your photo');

  await ReactTestRenderer.act(async () => {
    await pressableWithText(tree, 'Save photo').props.onPress();
  });

  const ImageEditor = require('@react-native-community/image-editor').default;
  expect(ImageEditor.cropImage).toHaveBeenCalled();
  const [uri, crop] = ImageEditor.cropImage.mock.calls[0];
  expect(uri).toBe('file:///tmp/pic.jpg');
  expect(crop.displaySize).toEqual({ width: 512, height: 512 });
  // A square out of the middle of a 1200x800 photo: 800 tall, inset by 200.
  expect(Math.round(crop.size.width)).toBe(800);
  expect(Math.round(crop.offset.x)).toBe(200);
  expect(Math.round(crop.offset.y)).toBe(0);
  expect(onCropped).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'pic.jpg', type: 'image/jpeg' }),
  );
});

function Toaster() {
  const toast = useToast();
  return (
    <Text accessibilityRole="button" onPress={() => toast.success('Saved.')}>
      go
    </Text>
  );
}

test('useToast shows a message', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(wrap(<Toaster />));
  });
  trees.push(tree);

  const go = tree.root.find(
    n => n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function',
  );
  await ReactTestRenderer.act(async () => {
    go.props.onPress();
  });
  expect(texts(tree)).toContain('Saved.');
});
