import Purchases, { PurchasesPackage, CustomerInfo } from 'react-native-purchases';

export interface SubscriptionStatus {
  isSubscribed: boolean;
  expirationDate: string | null;
  productIdentifier: string | null;
}

const ENTITLEMENT_ID = 'Oasis Pro';

export const initializePurchases = (): void => {
  Purchases.configure({ apiKey: 'appl_dOKvJLyzkasdLQSMzVbifZDcJQX' });
};

const extractSubscriptionStatus = (customerInfo: CustomerInfo): SubscriptionStatus => {
  const activeKeys = Object.keys(customerInfo.entitlements.active);
  console.log('[purchases] extractSubscriptionStatus — active entitlement keys:', activeKeys);
  console.log('[purchases] looking for entitlement ID:', JSON.stringify(ENTITLEMENT_ID));
  const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
  if (entitlement) {
    console.log('[purchases] entitlement found → isSubscribed: true, expiry:', entitlement.expirationDate);
    return {
      isSubscribed: true,
      expirationDate: entitlement.expirationDate,
      productIdentifier: entitlement.productIdentifier,
    };
  }
  console.log('[purchases] entitlement NOT found → isSubscribed: false');
  return {
    isSubscribed: false,
    expirationDate: null,
    productIdentifier: null,
  };
};

export const getSubscriptionStatus = async (): Promise<SubscriptionStatus> => {
  const customerInfo = await Purchases.getCustomerInfo();
  return extractSubscriptionStatus(customerInfo);
};

export const getOfferings = async () => {
  return await Purchases.getOfferings();
};

export const purchasePackage = async (pkg: PurchasesPackage): Promise<SubscriptionStatus> => {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return extractSubscriptionStatus(customerInfo);
};

export const restorePurchases = async (): Promise<SubscriptionStatus> => {
  const customerInfo = await Purchases.restorePurchases();
  return extractSubscriptionStatus(customerInfo);
};
