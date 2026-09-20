import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverlayHost, OverlayProvider } from '../src/contexts/OverlayContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { AuthContext } from '../src/contexts/AuthContext';
import RawProfilePage from '../src/pages/ProfilePage';
import RawUserFormPage from '../src/pages/UserFormPage';

// Both pages are untyped JS whose navigation callbacks TS reads as required.
type Props = Record<string, unknown>;
const ProfilePage = RawProfilePage as unknown as React.ComponentType<Props>;
const UserFormPage = RawUserFormPage as unknown as React.ComponentType<Props>;

const USER = {
  id: 7,
  user_name: 'Amit Limbasia',
  first_name: 'Amit',
  middle_name: 'Gordhan',
  last_name: 'Limbasia',
  role_name: 'Sabha DB Manager',
  status: true,
  mobile_number: '9876543210',
  sabha_name: 'Andheri Sabha',
  mandal_name: 'Mumbai Mandal',
  gender: 'Male',
  dob: '1995-04-12',
  pincode: '400058',
  area: 'Andheri West',
  suburb: 'Andheri',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
};

// Skeleton pulses with Animated.loop, which never settles under `act`.
jest
  .spyOn(Animated, 'loop')
  .mockReturnValue({
    start: () => {},
    stop: () => {},
    reset: () => {},
  } as never);

jest.mock('../src/api/client', () => ({
  api: {
    get: jest.fn(async (url: string) => {
      if (url.includes('/features')) return { resume: true };
      if (url.includes('/profile-image')) return { image_url: null };
      if (url.includes('/educations') || url.includes('/jobs')) return [];
      if (url.includes('/family')) return { family_id: 0, members: [] };
      if (url.includes('/resume')) return { items: [] };
      return USER;
    }),
    post: jest.fn(async () => ({ detail: 'ok' })),
    patch: jest.fn(async () => ({ detail: 'ok' })),
    delete: jest.fn(async () => ({ detail: 'ok' })),
  },
  apiUrl: (path: string) => `https://example.test${path}`,
  absoluteUrl: (url: string | null) =>
    !url ? null : /^[a-z]+:/i.test(url) ? url : `https://example.test${url}`,
  ApiError: class ApiError extends Error {},
  AUTH_PATHS: { me: '/api/v1/users/me' },
  setAccessToken: jest.fn(),
  setAuthLostHandler: jest.fn(),
  setTokenRefreshedHandler: jest.fn(),
  rememberSession: jest.fn(),
  resumeSession: jest.fn(),
  forgetSession: jest.fn(),
  getAccessToken: jest.fn(),
  refreshAccessToken: jest.fn(),
}));

const trees: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(async () => {
  while (trees.length) {
    const tree = trees.pop()!;
     
    await ReactTestRenderer.act(async () => tree.unmount());
  }
  while (clients.length) clients.pop()!.clear();
});

const auth = {
  status: 'authed',
  session: { userId: 7 },
  activeUserId: 7,
  accounts: [],
};

const clients: QueryClient[] = [];

function wrap(node: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 400, height: 800 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={auth as never}>
          <OverlayProvider>
            <ToastProvider>
              {node}
              <OverlayHost />
            </ToastProvider>
          </OverlayProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const texts = (tree: ReactTestRenderer.ReactTestRenderer) => {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const node = n as { children?: unknown };
    if (node?.children) walk(node.children);
  };
  walk(tree.toJSON());
  return out;
};

// Pressable passes accessibilityRole down to its inner views too, so the
// pressable itself is the one that also carries onPress.
const tabsOf = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll(
    n =>
      n.props?.accessibilityRole === 'tab' &&
      typeof n.props?.onPress === 'function',
    { deep: true },
  );

/** Let react-query settle — the first paint is the page loader. */
async function settle(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(done => setTimeout(done, 0));
    });
  }
}

test('ProfilePage renders every tab', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(wrap(<ProfilePage />));
  });
  trees.push(tree);
  await settle();

  const shown = texts(tree);
  expect(shown).toContain('Amit Limbasia');
  expect(shown).toContain('Edit Profile');
  expect(shown).toContain('My QR Code');

  const labels = tabsOf(tree).length;
  expect(labels).toBeGreaterThan(0);

  for (let i = 0; i < labels; i += 1) {
    const tab = tabsOf(tree)[i];
    await ReactTestRenderer.act(async () => {
      tab.props.onPress();
    });
  }
});

test('UserFormPage renders every step', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(wrap(<UserFormPage />));
  });
  trees.push(tree);
  await settle();

  expect(texts(tree)).toContain('Personal Details');

  const steps = tabsOf(tree).length;
  expect(steps).toBe(7);

  // Walk backwards: going back is always allowed, so every step renders.
  for (let i = steps - 1; i >= 0; i -= 1) {
    const tab = tabsOf(tree)[i];
    await ReactTestRenderer.act(async () => {
      tab.props.onPress();
    });
  }
});

test('the selected tab and the field values are bold', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(wrap(<ProfilePage />));
  });
  trees.push(tree);
  await settle();

  const weightOf = (label: string) => {
    const node = tree.root.findAll(
      n =>
        typeof n.type === 'string' &&
        n.children.length === 1 &&
        n.children[0] === label,
    )[0];
    return StyleSheet.flatten(node.props.style)?.fontWeight;
  };

  // Personal is the tab that opens; Sabha Details is a sibling that is not.
  expect(weightOf('Personal')).toBe('700');
  expect(weightOf('Sabha Details')).toBe('600');

  // A value on that tab, and its caption for contrast.
  expect(weightOf('Amit')).toBe('700');
  expect(weightOf('First Name')).toBeUndefined();
});
