import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { initializePurchases, getSubscriptionStatus } from '../services/purchases';

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

  const refreshSubscriptionStatus = useCallback(async () => {
    try {
      const status = await getSubscriptionStatus();
      setIsSubscribed(status.isSubscribed);
      console.log('isSubscribed set to:', status.isSubscribed);
    } catch (error) {
      console.log('RevenueCat error, defaulting to not subscribed:', error);
      setIsSubscribed(false);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      console.log('SubscriptionContext mounted, initializing...');
      try {
        initializePurchases();
      } catch (error) {
        console.error('Error initializing RevenueCat:', error);
      }
      try {
        await refreshSubscriptionStatus();
      } catch (error) {
        console.error('Error fetching initial subscription status:', error);
        setIsSubscribed(false);
      } finally {
        console.log('Final isSubscribed:', isSubscribed);
        setIsLoadingSubscription(false);
      }
    };
    initialize();
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
