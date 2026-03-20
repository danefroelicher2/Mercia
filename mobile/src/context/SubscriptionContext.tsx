import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';
import { initializePurchases, getSubscriptionStatus, loginAndGetStatus, extractSubscriptionStatus } from '../services/purchases';
import { useAuth } from './AuthContext';

interface SubscriptionContextType {
  isSubscribed: boolean;
  isLoadingSubscription: boolean;
  refreshSubscriptionStatus: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

interface SubscriptionProviderProps {
  children: ReactNode;
}

export const SubscriptionProvider: React.FC<SubscriptionProviderProps> = ({ children }) => {
  const isExpoGo = Constants.appOwnership === 'expo';
  const [isSubscribed, setIsSubscribed] = useState(isExpoGo ? true : false);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const { user } = useAuth();
  const isFirstAuthChange = useRef(true);

  const refreshSubscriptionStatus = useCallback(async () => {
    try {
      const status = await getSubscriptionStatus();
      console.log('[SubscriptionContext] refreshSubscriptionStatus →', {
        isSubscribed: status.isSubscribed,
        expirationDate: status.expirationDate,
        productIdentifier: status.productIdentifier,
      });
      setIsSubscribed(status.isSubscribed);
    } catch (error) {
      console.error('[SubscriptionContext] Error fetching subscription status:', error);
      setIsSubscribed(false);
    }
  }, []);

  // Initialize RevenueCat on mount, logIn if user is already authenticated
  useEffect(() => {
    const initialize = async () => {
      try {
        initializePurchases();
        console.log('[SubscriptionContext] RevenueCat configured. user?.id =', user?.id);
        if (user?.id) {
          // Use loginAndGetStatus so we read the fresh customerInfo returned by logIn()
          // directly, rather than a separate getCustomerInfo() call that may return
          // stale cached data before RevenueCat has synced the user's entitlements.
          console.log('[SubscriptionContext] Logging in to RevenueCat with userId:', user.id);
          const status = await loginAndGetStatus(user.id);
          setIsSubscribed(status.isSubscribed);
          console.log('[SubscriptionContext] logIn complete, isSubscribed:', status.isSubscribed,
            '| expirationDate:', status.expirationDate);
        } else {
          console.log('[SubscriptionContext] No user.id at init — checking anonymous customerInfo');
          await refreshSubscriptionStatus();
        }
      } catch (error) {
        console.error('[SubscriptionContext] Error initializing RevenueCat:', error);
        // Fallback: try a plain getCustomerInfo() so we don't get stuck in loading
        await refreshSubscriptionStatus();
      } finally {
        setIsLoadingSubscription(false);
        console.log('[SubscriptionContext] Initialization complete, isLoadingSubscription = false');
      }
    };
    if (isExpoGo) {
      console.log('[SubscriptionContext] Expo Go detected, skipping RevenueCat initialization');
      setIsLoadingSubscription(false);
      return;
    }
    initialize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // logIn / logOut when auth state changes after initial mount
  useEffect(() => {
    if (isExpoGo) {
      console.log('[SubscriptionContext] Expo Go: skipping auth-change RevenueCat login');
      return;
    }
    if (isFirstAuthChange.current) {
      isFirstAuthChange.current = false;
      return;
    }
    if (user?.id) {
      // Set loading=true so the Oasis tab is silently blocked (no paywall flash)
      // while we wait for RevenueCat to return the fresh subscription status.
      setIsLoadingSubscription(true);
      console.log('[SubscriptionContext] Auth changed: logging in to RevenueCat with userId:', user.id);
      loginAndGetStatus(user.id)
        .then((status) => {
          setIsSubscribed(status.isSubscribed);
          console.log('[SubscriptionContext] Auth-change logIn complete, isSubscribed:', status.isSubscribed);
        })
        .catch((e) => {
          console.error('[SubscriptionContext] RevenueCat logIn error:', e);
          setIsSubscribed(false);
        })
        .finally(() => {
          setIsLoadingSubscription(false);
          console.log('[SubscriptionContext] Auth-change login done, isLoadingSubscription = false');
        });
    } else {
      console.log('[SubscriptionContext] Auth changed: logging out of RevenueCat');
      Purchases.logOut()
        .then(() => refreshSubscriptionStatus())
        .catch((e) => console.error('[SubscriptionContext] RevenueCat logOut error:', e));
    }
  }, [user?.id]);

  // Register customerInfo listener on mount, remove on unmount.
  // Use the `info` object passed directly by the listener instead of calling
  // getCustomerInfo() again — this avoids a redundant round-trip and ensures
  // we act on exactly the data RevenueCat just pushed to us.
  useEffect(() => {
    const removeListener = Purchases.addCustomerInfoUpdateListener((info) => {
      const status = extractSubscriptionStatus(info);
      console.log('[SubscriptionContext] customerInfoUpdateListener fired. active entitlements:',
        Object.keys(info.entitlements.active), '→ isSubscribed:', status.isSubscribed);
      setIsSubscribed(status.isSubscribed);
    });
    return removeListener;
  }, []);

  return (
    <SubscriptionContext.Provider value={{ isSubscribed, isLoadingSubscription, refreshSubscriptionStatus }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = (): SubscriptionContextType => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export default SubscriptionContext;
