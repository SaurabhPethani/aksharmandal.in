import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RawAppHeader from '../src/components/AppHeader';
import { AuthContext } from '../src/contexts/AuthContext';
import { Drawer as RawDrawer } from '../src/pages/DashboardPage';

type Props = Record<string, unknown>;
const AppHeader = RawAppHeader as unknown as React.ComponentType<Props>;
const Drawer = RawDrawer as unknown as React.ComponentType<Props>;

const PHOTO = 'https://example.test/api/v1/profile-image/codes/user-7.jpg';
// `mock`-prefixed so the hoisted factory below may close over it.
let mockPhotoUrl: string | null = PHOTO;

jest.mock('../src/api/client', () => ({
  api: {
    get: jest.fn(async (url: string) =>
      url.includes('/profile-image')
        ? { user_id: 7, image_url: mockPhotoUrl }
        : {},
    ),
    post: jest.fn(async () => ({})),
  },
  apiUrl: (path: string) => `https://example.test${path}`,
  absoluteUrl: (u: string | null) => u,
  AUTH_PATHS: { me: '/api/v1/users/me' },
  setAccessToken: jest.fn(),
  setAuthLostHandler: jest.fn(),
}));

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
        <AuthContext.Provider value={{ activeUserId: 7 } as never}>
          {node}
        </AuthContext.Provider>
      </QueryClientProvider>
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

const avatarOf = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.find(
    n =>
      n.props?.accessibilityLabel === 'Profile' &&
      n.props?.accessibilityRole === 'button' &&
      'onPress' in (n.props ?? {}),
  );

const trees: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(async () => {
  while (trees.length) {
    const tree = trees.pop()!;
     
    await ReactTestRenderer.act(async () => tree.unmount());
  }
  while (clients.length) clients.pop()!.clear();
  mockPhotoUrl = PHOTO;
});

async function render(node: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(wrap(node));
  });
  trees.push(tree);
  return tree;
}

test('the header avatar opens the profile', async () => {
  const onProfile = jest.fn();
  const tree = await render(<AppHeader onMenu={jest.fn()} onProfile={onProfile} />);

  const avatar = avatarOf(tree);
  expect(avatar.props.disabled).toBe(false);

  await ReactTestRenderer.act(async () => {
    avatar.props.onPress();
  });
  expect(onProfile).toHaveBeenCalledTimes(1);
});

test('the avatar is inert on a screen that passes no handler', async () => {
  const tree = await render(<AppHeader onMenu={jest.fn()} />);
  expect(avatarOf(tree).props.disabled).toBe(true);
});

test('the drawer no longer lists My Profile', async () => {
  const tree = await render(
    <Drawer
      visible
      onClose={jest.fn()}
      onSignOut={jest.fn()}
      onDashboard={jest.fn()}
      onOpenEvents={jest.fn()}
      activeRoute="dashboard"
      roleName="Sabha DB Manager"
    />,
  );

  const shown = texts(tree);
  expect(shown).toContain('Dashboard');
  expect(shown).toContain('Events');
  expect(shown).toContain('Logout');
  expect(shown).not.toContain('My Profile');
});

test('the header avatar shows the uploaded photo', async () => {
  const tree = await render(<AppHeader onMenu={jest.fn()} onProfile={jest.fn()} />);
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(done => setTimeout(done, 0));
  });

  const image = tree.root.findAll(
    n => typeof n.type === 'string' && n.props?.source?.uri === PHOTO,
  );
  expect(image.length).toBe(1);
});

test('the avatar falls back to the mark when no photo is set', async () => {
  mockPhotoUrl = null;
  const tree = await render(<AppHeader onMenu={jest.fn()} onProfile={jest.fn()} />);
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(done => setTimeout(done, 0));
  });

  expect(
    tree.root.findAll(n => typeof n.type === 'string' && n.props?.source?.uri),
  ).toHaveLength(0);
  expect(avatarOf(tree).findAllByProps({ name: 'account' }).length).toBeGreaterThan(0);
});

test('a screen that passes onBack gets a back arrow instead of the menu', async () => {
  const onBack = jest.fn();
  const tree = await render(<AppHeader onMenu={jest.fn()} onBack={onBack} />);

  const back = tree.root.find(
    n =>
      n.props?.accessibilityLabel === 'Go back' &&
      typeof n.props?.onPress === 'function',
  );
  expect(back.findAllByProps({ name: 'arrow-left' }).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    back.props.onPress();
  });
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('without onBack the same button opens the drawer', async () => {
  const onMenu = jest.fn();
  const tree = await render(<AppHeader onMenu={onMenu} />);

  const menu = tree.root.find(
    n =>
      n.props?.accessibilityLabel === 'Open navigation' &&
      typeof n.props?.onPress === 'function',
  );
  expect(menu.findAllByProps({ name: 'menu' }).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    menu.props.onPress();
  });
  expect(onMenu).toHaveBeenCalledTimes(1);
});
