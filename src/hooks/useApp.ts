import { useContext } from 'react';
import { AppContext, type AppContextValue } from '@/context/AppContext';

/**
 * Typed access to the app context.
 *
 * The `undefined` check is the point: without it, using this hook outside
 * `AppProvider` fails as `Cannot read property of undefined` somewhere deep in a
 * screen, instead of naming the actual problem here.
 */
export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
