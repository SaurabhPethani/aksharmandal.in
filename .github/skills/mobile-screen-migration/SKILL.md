---
name: mobile-screen-migration
description: "Use when migrating a screen or feature from the Akshar Connect web app to React Native, especially pages, forms, dashboards, attendance, events, members, reports, or administration. Covers web-to-mobile code mapping, asset reuse, API/auth parity, responsive styling, navigation handoff, and Android validation."
---

# Mobile Screen Migration

Migrate one web screen at a time while preserving behavior, backend contracts, visual language, and the user's route through the app.

## Source Of Truth

Start from the matching web page and its nearest dependencies:

- `aksharmandal.in-main-web/src/pages/<Screen>Page.jsx`
- `aksharmandal.in-main-web/src/components/<domain>/**`
- `aksharmandal.in-main-web/src/hooks/**`
- `aksharmandal.in-main-web/src/services/**`
- `aksharmandal.in-main-web/src/constants/**`
- `aksharmandal.in-main-web/src/index.css` and the nearest component styles

Do not infer behavior from screenshots alone. Use screenshots to validate proportions after reading the source.

## Target Structure

Place the mobile port in the matching domain:

```text
src/
  api/                 shared axios client, envelope handling, refresh, errors
  assets/              local image/font/icon assets and one import boundary
  components/          reusable cross-feature controls
  constants/           shared messages, roles, permissions, pagination
  contexts/            auth, permissions, toast, session state
  hooks/               reusable data and UI behavior
  navigation/          route definitions and authenticated handoff
  pages/               screen-level composition
  services/            domain API adapters
  features/<domain>/   feature-specific components, hooks, and models when a
                       domain grows beyond one page
```

For a small screen, `src/pages/<Screen>Page.jsx` plus existing shared components is enough. Create a feature folder when the screen introduces domain-specific components, hooks, or services that will be reused.

## Migration Steps

1. **Inventory the web surface.** List the page, imported components, hooks, services, constants, assets, and route guards. Identify the smallest vertical slice that can be rendered and tested.
2. **Map the state machine.** Record every step, loading state, validation rule, error shape, success state, retry path, and back path. Keep backend messages and lockout/permission metadata intact.
3. **Reuse assets exactly.** Copy only assets actually used by the web screen into mobile `src/assets/`. Preserve filenames where possible. Use a single asset export module instead of scattering `require()` paths through screens.
4. **Port transport before UI.** Put endpoint paths and request bodies in a mobile service. Keep envelope unwrapping, token attachment, refresh, timeout, `ApiError`, field errors, and structured failure data in `src/api/client.js`.
5. **Port shared controls.** Extract repeated field, segmented input, table/list row, card, dialog, loader, and footer patterns into `src/components/`. A screen should compose controls, not contain every control implementation.
6. **Port the visual system.** Translate web CSS tokens into named React Native style constants. Match the web's actual dimensions, padding, border widths, radii, typography hierarchy, colors, shadows, and disabled/focused states. Avoid arbitrary oversized heights added to compensate for an unmeasured layout.
7. **Handle device layout.** Apply safe-area insets once at the app shell. Use `KeyboardAvoidingView`, scrollable content, stable touch targets, and bounded rows for narrow phones. Check short-height and keyboard-open states.
8. **Wire navigation.** A successful API call must lead to the corresponding authenticated or child screen. Do not leave `App.tsx` rendering the migrated login/page unconditionally after the screen is complete. Keep route selection outside the page where practical.
9. **Preserve accessibility.** Add accessibility labels/roles to icon-only actions, segmented controls, inputs, code digits, and destructive actions. Use the icon library already installed rather than text glyph substitutes.
10. **Validate behavior and appearance.** Run the checks below and compare a device screenshot with the web screen at the same viewport proportions.

## Login Migration Reference

The completed login port established these patterns:

- `src/pages/LoginPage.jsx` owns the main/OTP/setup flow and client-side validation.
- `src/components/form/LoginField.jsx` and `CodeInput` provide reusable field and digit-input chrome.
- `src/services/authService.js` mirrors `login-init`, PIN/password login, OTP verification, credential setup, logout, `/me`, and account switching.
- `src/api/client.js` normalizes standard response envelopes, refreshes access tokens, handles timeout/offline errors, and preserves structured login failures.
- `src/contexts/AuthContext.jsx` establishes sessions, handles logout/auth loss, and parks the scoped OTP token without treating it as a full session.
- `src/components/SiteFooter.jsx` centralizes copyright/version rendering.
- `App.tsx` applies safe-area insets once and provides `AuthProvider`.
- `MaterialCommunityIcons` is used for native icons instead of Unicode glyphs.

Use this as the pattern for future screens, but do not copy login-specific state or endpoint names into unrelated features.

## Review Checklist

Before declaring a migration complete, verify:

- [ ] Matching web page and dependencies were read.
- [ ] All local image assets used by the web screen are present in mobile.
- [ ] API paths, request bodies, response envelopes, auth headers, and error metadata match the web contract.
- [ ] Loading, empty, error, disabled, focused, success, and retry states exist.
- [ ] Back navigation and successful navigation are wired.
- [ ] Shared controls are extracted when reused.
- [ ] Safe-area and keyboard behavior work without double padding.
- [ ] Text and touch targets fit on narrow and short screens.
- [ ] No screen relies on placeholder text, Unicode icons, or a copied web-only DOM pattern.
- [ ] Web and mobile screenshots have comparable hierarchy and proportions.
- [ ] TypeScript/checker, lint, tests, and Android build have been run.

## Validation Commands

Run from `c:\aksharmandal.in-main\aksharmandal.in-main`:

```powershell
npx tsc --noEmit
npm test -- --runInBand
npm run lint
npm run android
```

If the native app is already running Metro on port `8081`, use another port explicitly:

```powershell
npm run android -- --port 8082
```

For visual validation, install the debug build on a connected device or emulator and compare the resulting screen at the same device dimensions as the web reference. Check the initial state, focused input, validation error, loading state, and the longest content state.

## Common Failure Modes

- **Everything in `App.tsx`:** move screen logic into `src/pages`, reusable UI into `src/components`, and domain requests into `src/services`.
- **Copied web CSS dimensions:** translate the visual tokens and then validate on a real phone; CSS pixels and React Native points are not interchangeable in every layout.
- **Hidden API contract differences:** preserve boolean `status_code` envelopes and structured `detail` objects; do not reduce every failure to a string.
- **Double safe-area padding:** if `App.tsx` owns insets, pages must not add another safe-area wrapper.
- **Login/page remains after success:** make the root render route from auth status and add the target screen before calling the migration complete.
- **Placeholder icons:** use the installed native icon package and add accessibility labels.
- **Empty spacer drift:** do not reserve fixed message height when no message exists; conditional feedback should take no layout space.
