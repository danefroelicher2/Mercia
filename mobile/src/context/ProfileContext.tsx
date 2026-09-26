import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
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

  const refresh = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        setProfile(await fetchMyProfile());
        break;
      } catch {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
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
