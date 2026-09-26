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
  // The hierarchy is required on its step, so without the ids the form cannot
  // be stepped FORWARD past Sabha Details.
  pradesh_id: 1,
  mandal_id: 2,
  sabha_id: 3,
  gender: 'Male',
  dob: '1995-04-12',
  // Both carry the id AND the name, and the name is spelled `<field>_name`
  // rather than swapping `_id` for `_name`.
  reference_by_id: 42,
  reference_by_id_name: 'Nikunj Bhai',
  followup_by_id: 43,
  followup_by_id_name: 'Jigar Bhai',
  pincode: '400058',
  area: 'Andheri West',
  suburb: 'Andheri',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
};

// Skeleton pulses with Animated.loop, which never settles under `act`.
jest.spyOn(Animated, 'loop').mockReturnValue({
  start: () => {},
  stop: () => {},
  reset: () => {},
} as never);

jest.mock('../src/api/client', () => ({
  api: {
    get: jest.fn(async (url: string) => {
      if (url.includes('/features')) return { resume: true };
      if (url.includes('/profile-image')) return { image_url: null };
      // The address master nests TWO levels: a PIN-code row holds suburbs,
      // and each suburb holds areas.
      if (url.includes('/address-master'))
        return [
          {
            pincode: '400058',
            city: 'Mumbai',
            state: 'Maharashtra',
            country: 'India',
            suburbs: [
              {
                name: 'Andheri',
                areas: [{ area: 'Versova' }, { area: 'Andheri West' }],
              },
              { name: 'Jogeshwari', areas: [{ area: 'Lokhandwala' }] },
            ],
          },
        ];
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

// Pressable passes accessibilityRole down to its inner views too, so the
// pressable itself is the one that also carries onPress.
const tabsOf = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll(
    n =>
      n.props?.accessibilityRole === 'tab' &&
      typeof n.props?.onPress === 'function',
    { deep: true },
  );

/** Every string rendered under one instance, label included. */
function labelsUnder(node: ReactTestRenderer.ReactTestInstance): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === 'string') {
      out.push(n);
      return;
    }
    const kids = (n as { children?: unknown[] })?.children;
    if (Array.isArray(kids)) kids.forEach(walk);
  };
  walk(node);
  return out;
}

/** The pressable carrying a given label — hero buttons are found by text. */
function pressByText(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  const hit = tree.root.findAll(
    n =>
      n.props?.accessibilityRole === 'button' &&
      typeof n.props?.onPress === 'function' &&
      labelsUnder(n).includes(label),
    { deep: true },
  );
  if (!hit.length) throw new Error(`no button labelled ${label}`);
  // Pressable passes the role to its inner views, so the LAST match is the
  // innermost — the one that is really the button.
  hit[hit.length - 1].props.onPress();
}

/** Every value sitting in a text input, read-only ones included. */
const inputValues = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root
    .findAll(n => typeof n.type === 'string' && 'value' in (n.props ?? {}), {
      deep: true,
    })
    .map(n => String(n.props.value ?? ''));

/**
 * Pump real time until `check` holds.
 *
 * `settle` only drains microtasks, which is enough for a query that fires at
 * once. The PIN-code lookup is debounced by 400ms of WALL CLOCK, so anything
 * waiting on it has to actually wait — draining ticks made those assertions
 * pass or fail on how loaded the machine happened to be.
 */
async function waitFor(check: () => boolean, timeoutMs = 4000) {
  const started = Date.now();
  for (;;) {
    if (check()) return;
    if (Date.now() - started > timeoutMs) {
      throw new Error('timed out waiting for the expected state');
    }
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(done => setTimeout(done, 25));
    });
  }
}

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

test('Edit Profile edits in place, and Cancel returns to the record', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(wrap(<ProfilePage />));
  });
  trees.push(tree);
  await settle();

  // Reading: the record's own tabs, and no form.
  expect(texts(tree)).toContain('My QR Code');
  expect(texts(tree)).not.toContain('Personal Details');

  await ReactTestRenderer.act(async () => {
    pressByText(tree, 'Edit Profile');
  });
  await settle();

  // Editing: the same screen, now holding the form's seven steps.
  const shown = texts(tree);
  expect(shown).toContain('Personal Details');
  expect(shown).toContain('Save');
  expect(shown).toContain('Cancel');
  expect(shown).toContain('Save and Exit');
  // The generated tabs are gone — Save applies to the record, not to them.
  expect(shown).not.toContain('My QR Code');
  // Family is readable but not editable, so the strip is six, not seven.
  expect(tabsOf(tree)).toHaveLength(6);
  expect(shown).not.toContain('Family');
  // The step buttons name the tabs rather than saying Back and Next.
  expect(shown).toContain('Sabha Details');
  expect(shown).not.toContain('Next');

  await ReactTestRenderer.act(async () => {
    pressByText(tree, 'Cancel');
  });
  await settle();

  // Back to the record, with nothing dirty so no discard prompt.
  expect(texts(tree)).toContain('My QR Code');
  expect(texts(tree)).toContain('Edit Profile');
});

test('a locked person field shows the name, never the id', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(wrap(<ProfilePage />));
  });
  trees.push(tree);
  await settle();

  await ReactTestRenderer.act(async () => {
    pressByText(tree, 'Edit Profile');
  });
  await settle();

  // Sabha Details — Reference By.
  await ReactTestRenderer.act(async () => {
    tabsOf(tree)[1].props.onPress();
  });
  await settle();
  expect(inputValues(tree)).toContain('Nikunj Bhai');
  expect(inputValues(tree)).not.toContain('42');

  // Followup — Followup By.
  await ReactTestRenderer.act(async () => {
    tabsOf(tree)[3].props.onPress();
  });
  await settle();
  expect(inputValues(tree)).toContain('Jigar Bhai');
  expect(inputValues(tree)).not.toContain('43');
});

test("the member's saved area comes back picked from the PIN code's list", async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(wrap(<ProfilePage />));
  });
  trees.push(tree);
  await settle();

  await ReactTestRenderer.act(async () => {
    pressByText(tree, 'Edit Profile');
  });
  await settle();

  // Address is the third step.
  await ReactTestRenderer.act(async () => {
    tabsOf(tree)[2].props.onPress();
  });
  await settle();

  await waitFor(() =>
    texts(tree).includes('This PIN code covers several areas.'),
  );

  const shown = texts(tree);
  // The PIN code covers three areas, so the member must not be made to re-pick
  // the one their record already holds.
  expect(shown).toContain('Andheri West');
  expect(shown).not.toContain('Select area');

  // City / State / Country mirror the lookup once it resolves; Suburb follows
  // the pick, which the saved area supplied.
  expect(inputValues(tree)).toEqual(
    expect.arrayContaining(['Mumbai', 'Maharashtra', 'India', 'Andheri']),
  );
});

test('a failed PIN-code lookup leaves the saved address alone', async () => {
  const { api } = require('../src/api/client');
  const original = api.get.getMockImplementation();
  api.get.mockImplementation(async (url: string) => {
    if (url.includes('/address-master')) throw new Error('Not found');
    return original(url);
  });

  try {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(wrap(<ProfilePage />));
    });
    trees.push(tree);
    await settle();

    await ReactTestRenderer.act(async () => {
      pressByText(tree, 'Edit Profile');
    });
    await settle();
    await ReactTestRenderer.act(async () => {
      tabsOf(tree)[2].props.onPress();
    });
    await settle();

    await waitFor(() =>
      texts(tree).some(t => t.startsWith('Could not look up this PIN code.')),
    );

    // The lookup says nothing, so the record's own address must still stand —
    // blanking it here would file the blank as their address on the next save.
    // With no rows the Area field falls back to the read-only mirror, so every
    // one of the five is an input value rather than a dropdown label.
    expect(inputValues(tree)).toEqual(
      expect.arrayContaining([
        'Andheri West',
        'Andheri',
        'Mumbai',
        'Maharashtra',
        'India',
      ]),
    );
  } finally {
    api.get.mockImplementation(original);
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
  expect(steps).toBe(6);

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
