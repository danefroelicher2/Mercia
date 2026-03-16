import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import Purchases from 'react-native-purchases';
import { initializePurchases, getSubscriptionStatus } from '../services/purchases';
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
  const [isSubscribed, setIsSubscribed] = useState(false);
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
          console.log('[SubscriptionContext] Logging in to RevenueCat with userId:', user.id);
          await Purchases.logIn(user.id);
          console.log('[SubscriptionContext] RevenueCat logIn complete');
        } else {
          console.log('[SubscriptionContext] No user.id at init — checking anonymous customerInfo');
        }
      } catch (error) {
        console.error('[SubscriptionContext] Error initializing RevenueCat:', error);
      }
      try {
        await refreshSubscriptionStatus();
      } catch (error) {
        console.error('[SubscriptionContext] Error fetching initial subscription status:', error);
        setIsSubscribed(false);
      } finally {
        setIsLoadingSubscription(false);
        console.log('[SubscriptionContext] Initialization complete, isLoadingSubscription = false');
      }
    };
    initialize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // logIn / logOut when auth state changes after initial mount
  useEffect(() => {
    if (isFirstAuthChange.current) {
      isFirstAuthChange.current = false;
      return;
    }
    if (user?.id) {
      console.log('[SubscriptionContext] Auth changed: logging in to RevenueCat with userId:', user.id);
      Purchases.logIn(user.id)
        .then(() => {
          console.log('[SubscriptionContext] Auth-change logIn complete, refreshing subscription');
          return refreshSubscriptionStatus();
        })
        .catch((e) => console.error('[SubscriptionContext] RevenueCat logIn error:', e));
    } else {
      console.log('[SubscriptionContext] Auth changed: logging out of RevenueCat');
      Purchases.logOut().catch((e) => console.error('[SubscriptionContext] RevenueCat logOut error:', e));
    }
  }, [user?.id]);

  // Register customerInfo listener on mount, remove on unmount
  useEffect(() => {
    const removeListener = Purchases.addCustomerInfoUpdateListener((info) => {
      console.log('[SubscriptionContext] customerInfoUpdateListener fired. active entitlements:',
        Object.keys(info.entitlements.active));
      refreshSubscriptionStatus();
    });
    return removeListener;
  }, [refreshSubscriptionStatus]);

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
