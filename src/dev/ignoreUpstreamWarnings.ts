/**
 * LogBox filters for warnings that originate in a dependency rather than in this
 * app.
 *
 * Each entry earns its place on three counts: it is not caused by `src/`, it is
 * not actionable from here, and it is loud enough in development to cover the
 * screen you are trying to work on. They are listed individually rather than by
 * switching LogBox off, so that deleting a line — when the upstream fix lands —
 * is the whole change.
 *
 * Imported for side effect from `src/app/_layout.tsx`, which is high enough in
 * the tree to run before Expo Router resolves the initial-URL promise that
 * triggers the first entry.
 */

import { LogBox } from 'react-native';

/**
 * "Can't perform a React state update on a component that hasn't mounted yet."
 *
 * Upstream: https://github.com/expo/expo/issues/49378
 *
 * Expo Router's `useLinking.native` attaches a `.then` to the promise returned by
 * `Linking.getInitialURL()` **during render**, and that continuation calls
 * `onUnhandledLinking`, which `NavigationContainer` hands straight to
 * `setLastUnhandledLink`. If the promise resolves before React commits the tree,
 * the continuation updates a fiber that has not mounted yet. `NavigationContainer`
 * is created by `ExpoRoot`, above this app's root layout, so nothing under `src/`
 * participates.
 *
 * It is a warning rather than a failure — a state update on an unmounted fiber is
 * a no-op, and React only emits this in development. It becomes a full-screen red
 * overlay only because React uses `console.error`, which Expo Router forwards to
 * the dev client.
 *
 * **What this filter costs.** The pattern also matches the identical warning if
 * it ever comes from this app's own code, which would then be hidden. Mitigating
 * facts: this app has no `Suspense` and no `use()`, which are the usual ways to
 * widen the commit window, and React dedupes per component name so it fires at
 * most once per session. If a genuine instance appears later, check the upstream
 * issue before assuming the cause is local.
 *
 * Unfixed as of expo-router 57.0.23 — the issue records that 57.0.16 and `main`
 * both still carry the forked callback. React Navigation removed the callback in
 * v8 alpha; Expo Router still forks it.
 *
 * The upstream fix is to queue the callback until `NavigationContainer`'s first
 * effect, which the reporter verified across 100 cold starts. That needs a patched
 * `node_modules` re-applied on every Expo Router upgrade, so it is deliberately
 * not done here — filter now, patch only if the warning becomes a real cost.
 */
LogBox.ignoreLogs([
  /Can't perform a React state update on a component that hasn't mounted yet/,
]);
