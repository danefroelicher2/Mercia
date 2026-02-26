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
      setIsSubscribed(status.isSubscribed);
    } catch (error) {
      console.error('Error fetching subscription status:', error);
      setIsSubscribed(false);
    }
  }, []);

  // Initialize RevenueCat on mount, logIn if user is already authenticated
  useEffect(() => {
    const initialize = async () => {
      try {
        initializePurchases();
        if (user?.id) {
          await Purchases.logIn(user.id);
        }
      } catch (error) {
        console.error('Error initializing RevenueCat:', error);
      }
      try {
        await refreshSubscriptionStatus();
      } catch (error) {
        console.error('Error fetching initial subscription status:', error);
        setIsSubscribed(false);
      } finally {
        setIsLoadingSubscription(false);
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
      Purchases.logIn(user.id).catch((e) => console.error('RevenueCat logIn error:', e));
    } else {
      Purchases.logOut().catch((e) => console.error('RevenueCat logOut error:', e));
    }
  }, [user?.id]);

  // Register customerInfo listener on mount, remove on unmount
  useEffect(() => {
    const removeListener = Purchases.addCustomerInfoUpdateListener(() => {
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
