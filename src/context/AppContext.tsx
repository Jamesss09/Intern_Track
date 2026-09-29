/**
 * App-wide state: the signed-in user, the active internship, and the derived
 * progress summary.
 *
 * `useReducer` rather than a state library, because the state is small and
 * almost every transition is "a service call finished, now put the result in
 * state". See vault note `Architecture` -> "Decision 3".
 *
 * v1 has no session token: the app requires a login on every cold launch, so
 * there is nothing to rehydrate and no "is the stored session still valid?"
 * branch to get wrong. A remembered login is post-v1.
 */

import React, { createContext, useCallback, useEffect, useMemo, useReducer } from 'react';
import type { Internship, InternshipSummary, User } from '@/types';
import * as authService from '@/services/authService';
import * as internshipService from '@/services/internshipService';
import * as timeRecordService from '@/services/timeRecordService';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AppState {
  status: AuthStatus;
  user: User | null;
  internship: Internship | null;
  summary: InternshipSummary | null;
  busy: boolean;
  error: string | null;
}

const initialState: AppState = {
  status: 'loading',
  user: null,
  internship: null,
  summary: null,
  busy: false,
  error: null,
};

type Action =
  | { type: 'ready' }
  | { type: 'busy'; busy: boolean }
  | { type: 'error'; error: string | null }
  | { type: 'signedIn'; user: User; internship: Internship | null }
  | { type: 'signedOut' }
  | { type: 'internship'; internship: Internship | null }
  | { type: 'summary'; summary: InternshipSummary | null }
  | { type: 'profile'; user: User };

export const appReducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'ready':
      return { ...state, status: 'unauthenticated' };

    case 'busy':
      return { ...state, busy: action.busy };

    case 'error':
      return { ...state, error: action.error, busy: false };

    case 'signedIn':
      return {
        ...state,
        status: 'authenticated',
        user: action.user,
        internship: action.internship,
        summary: null,
        error: null,
        busy: false,
      };

    case 'signedOut':
      return { ...initialState, status: 'unauthenticated' };

    case 'internship':
      return { ...state, internship: action.internship, summary: null };

    case 'summary':
      return { ...state, summary: action.summary };

    case 'profile':
      return { ...state, user: action.user };

    default:
      return state;
  }
};

export interface AppContextValue extends AppState {
  login: (email: string, password: string) => Promise<void>;
  register: (input: authService.RegisterInput) => Promise<void>;
  logout: () => void;
  saveInternship: (input: internshipService.CreateInternshipInput) => Promise<void>;
  /** Edits the active placement in place, keeping its id and its time records. */
  updateInternship: (
    id: number,
    fields: Omit<internshipService.CreateInternshipInput, 'user_id'>,
  ) => Promise<void>;
  updateProfile: (fields: {
    full_name: string;
    student_id: string | null;
    course: string | null;
    year_level: string | null;
    block: string | null;
  }) => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshSummary: () => Promise<void>;
  clearError: () => void;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

const message = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Opening the database here means a schema error surfaces once, at launch,
  // instead of on whichever screen happens to query first.
  useEffect(() => {
    import('@/database/database')
      .then(({ getDatabase }) => getDatabase())
      .then(() => dispatch({ type: 'ready' }))
      .catch((error) => dispatch({ type: 'error', error: message(error) }));
  }, []);

  const { user, internship } = state;

  const refreshSummary = useCallback(async () => {
    if (!user || !internship) {
      dispatch({ type: 'summary', summary: null });
      return;
    }

    const summary = await timeRecordService.getSummary(internship.id, internship.required_hours);
    dispatch({ type: 'summary', summary });
  }, [user, internship]);

  const login = useCallback(async (email: string, password: string) => {
    dispatch({ type: 'busy', busy: true });
    try {
      const user = await authService.login(email, password);
      const internship = await internshipService.getActiveInternship(user.id);
      dispatch({ type: 'signedIn', user, internship });
    } catch (error) {
      dispatch({ type: 'error', error: message(error) });
      throw error;
    }
  }, []);

  const register = useCallback(async (input: authService.RegisterInput) => {
    dispatch({ type: 'busy', busy: true });
    try {
      await authService.register(input);
      const user = await authService.login(input.email, input.password);
      dispatch({ type: 'signedIn', user, internship: null });
    } catch (error) {
      dispatch({ type: 'error', error: message(error) });
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    dispatch({ type: 'signedOut' });
  }, []);

  const saveInternship = useCallback(
    async (input: internshipService.CreateInternshipInput) => {
      dispatch({ type: 'busy', busy: true });
      try {
        await internshipService.createInternship(input);
        const internship = await internshipService.getActiveInternship(input.user_id);
        dispatch({ type: 'internship', internship });
      } catch (error) {
        dispatch({ type: 'error', error: message(error) });
        throw error;
      }
    },
    [],
  );

  /**
   * Edits the active placement in place.
   *
   * Deliberately **not** routed through `saveInternship`. Creating archives the
   * current placement and inserts a new row, so an "edit" made through it left
   * every time record attached to the archived row while the app only ever
   * reads the active one — a student who fixed a typo in the company name
   * opened Records to find every logged hour gone. Updating by id keeps the
   * row, and with it the `internship_id` on every record pointing at it.
   */
  const updateInternship = useCallback(
    async (id: number, fields: Omit<internshipService.CreateInternshipInput, 'user_id'>) => {
      const userId = state.user?.id;
      if (!userId) return;

      dispatch({ type: 'busy', busy: true });
      try {
        await internshipService.updateInternship(id, fields);
        // Re-read rather than patching the local copy: the service trims the
        // text and rounds the hours, so the screen should show what was stored.
        const internship = await internshipService.getActiveInternship(userId);
        dispatch({ type: 'internship', internship });
      } catch (error) {
        dispatch({ type: 'error', error: message(error) });
        throw error;
      }
    },
    [state.user],
  );

  const updateProfile = useCallback(
    async (fields: {
      full_name: string;
      student_id: string | null;
      course: string | null;
      year_level: string | null;
      block: string | null;
    }) => {
      if (!state.user) return;
      dispatch({ type: 'busy', busy: true });
      try {
        await authService.updateProfile(state.user.id, fields);
        const user = await authService.getUserById(state.user.id);
        if (user) dispatch({ type: 'profile', user });
      } catch (error) {
        dispatch({ type: 'error', error: message(error) });
        throw error;
      }
    },
    [state.user],
  );

  const deleteAccount = useCallback(async () => {
    if (!state.user) return;
    dispatch({ type: 'busy', busy: true });
    try {
      await authService.deleteAccount(state.user.id);
      dispatch({ type: 'signedOut' });
    } catch (error) {
      dispatch({ type: 'error', error: message(error) });
      throw error;
    }
  }, [state.user]);

  const clearError = useCallback(() => dispatch({ type: 'error', error: null }), []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      login,
      register,
      logout,
      saveInternship,
      updateInternship,
      updateProfile,
      deleteAccount,
      refreshSummary,
      clearError,
    }),
    [
      state,
      login,
      register,
      logout,
      saveInternship,
      updateInternship,
      updateProfile,
      deleteAccount,
      refreshSummary,
      clearError,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
