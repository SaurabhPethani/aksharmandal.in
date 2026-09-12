// ---------------------------------------------------------------------------
// MODULE PRESENTATION REGISTRY
// ---------------------------------------------------------------------------
// FALLBACK presentation for modules whose full-context entry does not carry its
// own. The API is now preferred for every value here: normalizeFullContext reads
// `route`/`path`, `icon`, `sort_order` and `display_name` when the response
// carries them and only drops back to this table when it does not.
//
// STRICT RULE — what may and may not go in this file:
//   ALLOWED:     path, icon, label fallback, sort order, default list endpoint.
//   NOT ALLOWED: anything about WHO can see or do something. Every visibility and
//                action decision resolves at runtime from full-context — nav
//                visibility from `is_visible_nav`, actions from `is_granted`.
//
// TO DELETE THIS FILE: have full-context send `route`, `icon`, `sort_order` and
// a list endpoint for every module. Presentation then comes entirely from the
// API and Dashboard is the only static entry left.
//
// Keys are `module_name` values, mined from the RBAC gates documented in the
// OpenAPI endpoint descriptions.

import {
  Users, Network, Database, CalendarCheck, ShieldCheck, ArrowLeftRight,
  Briefcase, FileBarChart, CalendarDays, MapPin, ScrollText, HandHeart,
  KeySquare, Boxes, LayoutDashboard, Activity, Settings, UserPlus, Star,
  Clock, Ticket, BookOpen, BarChart2, History, Heart, Terminal, Shield,
  Key, Edit, GitMerge, User, Calendar
} from 'lucide-react';

export const MODULE_REGISTRY = {
  // `page` selects a bespoke screen instead of the generic module page; see
  // MODULE_PAGES in routes/AppRouter.jsx.
  USERS:          { path: '/users',          icon: Users,         label: 'Members',        order: 10,  listEndpoint: '/api/v1/users/list', page: 'members' },
  ATTENDANCE:     { path: '/attendance',     icon: CalendarCheck, label: 'Attendance',     order: 20,  listEndpoint: '/api/v1/attendance/sabhadetails', page: 'attendance' },
  REPORTS:        { path: '/reports',        icon: FileBarChart,  label: 'Reports',        order: 30,  page: 'reports' },
  COMPARE:        { path: '/compare',        icon: BarChart2,     label: 'Compare',        order: 35,  page: 'compare' },
  HIERARCHY:      { path: '/hierarchy',      icon: Network,       label: 'Hierarchy',      order: 40,  listEndpoint: '/api/v1/pradesh', page: 'hierarchy' },
  EVENTS:         { path: '/events',         icon: CalendarDays,  label: 'Events',         order: 50,  listEndpoint: '/api/v1/events', page: 'events' },
  JOB_PORTAL:     { path: '/jobs',           icon: Briefcase,     label: 'Job Portal',     order: 60,  listEndpoint: '/api/v1/job-posts', page: 'jobs' },
  YUVA_SEVA:      { path: '/yuva-seva',      icon: HandHeart,     label: 'Yuva Seva',      order: 70,  listEndpoint: '/api/v1/yuva-seva', page: 'yuva-seva' },
  TRANSFER:       { path: '/transfers',      icon: ArrowLeftRight,label: 'Approvals',      order: 80,  listEndpoint: '/api/v1/notifications/transfer/pending', page: 'approvals' },
  MASTER_DATA:    { path: '/master-data',    icon: Database,      label: 'Master Data',    order: 90,  listEndpoint: '/api/v1/education-levels', page: 'master-data' },
  ADDRESS_MASTER: { path: '/address-master', icon: MapPin,        label: 'Address Master', order: 100, listEndpoint: '/api/v1/address-master' },
  USER_ROLE:      { path: '/roles',          icon: ShieldCheck,   label: 'Roles',          order: 110, listEndpoint: '/api/v1/role-permissions/roles', page: 'roles' },
  USER_PERMISSION:{ path: '/permissions',    icon: KeySquare,     label: 'Permissions',    order: 120, listEndpoint: '/api/v1/role-permissions/matrix' },
  LOGS:           { path: '/logs',           icon: ScrollText,    label: 'Logs',           order: 130, listEndpoint: '/api/v1/activity-logs', page: 'logs' },
};

/** Unknown modules still render — slugged path, neutral icon, API's display_name. */
export function fallbackFor(moduleName) {
  return {
    path: `/m/${String(moduleName).toLowerCase().replace(/_/g, '-')}`,
    icon: Boxes,
    label: null, // let the API's display_name win
    order: 900,
    listEndpoint: null,
    unregistered: true,
  };
}

export const registryFor = (moduleName) => MODULE_REGISTRY[moduleName] ?? fallbackFor(moduleName);

/**
 * Icons the API may name. An icon is a React component, so it cannot travel in
 * a JSON response — the backend picks from what the bundle ships, by name.
 *
 * This is the whole set: importing all of lucide-react to resolve arbitrary
 * names would defeat tree-shaking and pull a few hundred KB of unused SVG into
 * the entry chunk. An unrecognised name falls back to the registry's icon, then
 * to the neutral one, so a new name never renders as a blank space.
 *
 * Keys should be lowercase, stripped of all non-alphanumeric characters, so that
 * both "arrow-right-left" and "arrowrightleft" resolve to the same component.
 */
const ICONS = {
  // core
  users: Users, network: Network, database: Database,
  calendarcheck: CalendarCheck, calendardayss: CalendarDays,
  shieldcheck: ShieldCheck, arrowleftright: ArrowLeftRight,
  arrowrightleft: ArrowLeftRight, // backend ships "arrow-right-left"
  briefcase: Briefcase, filebarchart: FileBarChart,
  calendardays: CalendarDays, calendar: Calendar,
  mappin: MapPin, scrolltext: ScrollText, handheart: HandHeart,
  keysquare: KeySquare, boxes: Boxes, layoutdashboard: LayoutDashboard,
  activity: Activity, settings: Settings, userplus: UserPlus, star: Star,
  clock: Clock, ticket: Ticket, bookopen: BookOpen, barchart2: BarChart2,
  history: History, heart: Heart, terminal: Terminal,
  shield: Shield, key: Key, edit: Edit,
  gitmerge: GitMerge, // backend ships "git-merge"
  user: User,
};

/** Resolves an API icon name ("file-bar-chart", "FileBarChart", "users") to a component. */
export function iconFor(name) {
  if (!name || typeof name !== 'string') return null;
  return ICONS[name.toLowerCase().replace(/[^a-z0-9]/gi, '')] ?? null;
}
