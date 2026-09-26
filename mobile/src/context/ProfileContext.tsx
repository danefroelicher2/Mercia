import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { MyProfile, fetchMyProfile } from '../services/profile';

// The signed-in user's own profile (username, display name), loaded from the
// server after sign-in. `loaded` flips true once it's in — or once loading
// has failed, so a flaky network never locks anyone out (the username screen
// then shows next launch if it's still needed).

interface ProfileContextValue {
  profile: MyProfile | null;
  loaded: boolean;
  refresh: () => Promise<void>;
  setProfile: (p: MyProfile) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Bumped on every sign-in/out, so a slow response from a previous session
  // can never land in the next one.
  const session = useRef(0);

  const refresh = useCallback(async () => {
    const mine = session.current;
    // Bounded: ~1 minute worst case (the first try is long enough for a
    // server waking from sleep), then the app lets the user in.
    const timeouts = [30000, 15000, 10000];
    for (let attempt = 0; attempt < timeouts.length; attempt++) {
      try {
        const p = await fetchMyProfile(timeouts[attempt]);
        if (session.current !== mine) return;
        setProfile(p);
        break;
      } catch {
        if (attempt < timeouts.length - 1) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    if (session.current === mine) setLoaded(true);
  }, []);

  useEffect(() => {
    session.current += 1;
    setProfile(null);
    setLoaded(false);
    if (isAuthenticated) refresh();
  }, [isAuthenticated, refresh]);

  return <ProfileContext.Provider value={{ profile, loaded, refresh, setProfile }}>{children}</ProfileContext.Provider>;
};

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
}
