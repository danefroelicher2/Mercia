import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = 'oasis_ai_consent';

export const getConsent = async (): Promise<boolean> => {
<<<<<<< HEAD
    const value = await AsyncStorage.getItem(CONSENT_KEY);
    return value === 'true';
};

export const setConsent = async (value: boolean): Promise<void> => {
    await AsyncStorage.setItem(CONSENT_KEY, value ? 'true' : 'false');
};

export const hasConsentBeenAnswered = async (): Promise<boolean> => {
    const value = await AsyncStorage.getItem(CONSENT_KEY);
    return value !== null;
};
=======
  const value = await AsyncStorage.getItem(CONSENT_KEY);
  return value === 'true';
};

export const setConsent = async (value: boolean): Promise<void> => {
  await AsyncStorage.setItem(CONSENT_KEY, value.toString());
};

export const hasConsentBeenAnswered = async (): Promise<boolean> => {
  const value = await AsyncStorage.getItem(CONSENT_KEY);
  return value !== null;
};
>>>>>>> da69c373f934cffa36eed77752a52ff3d68cddfe
