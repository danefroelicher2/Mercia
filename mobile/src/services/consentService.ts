import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = 'oasis_ai_consent';

export const getConsent = async (): Promise<boolean> => {
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
```

**2 -- Create `mobile / src / screens / ConsentScreen.tsx`**

Dark screen matching app theme with:
- Headline: "Before You Continue"
- Body: "Oasis AI uses Groq, a third-party AI service, to power your conversations and generate personalized insights. Before using Oasis, we need your permission to send your conversation messages and question responses to Groq for processing. Without this, the Oasis AI features will not be available."
- A tappable "Privacy Policy" link using `Linking.openURL('https://tranquil-marigold-3d7831.netlify.app')`
- Full width orange button "I Agree" -- calls `setConsent(true)` then sets a local state to dismiss
- Muted gray text link "Decline" below -- calls `setConsent(false)` then sets local state to dismiss
- This screen must be a modal that cannot be dismissed by swiping

**3 -- Modify `mobile / src / navigation / RootNavigator.tsx`**

Add consent checking to the authenticated flow. The logic must be:
```
if (isAuthenticated) {
    if (consentAnswered === false) → show ConsentScreen(fullScreenModal, no back gesture)
    if (consentAnswered === true) → show MainNavigator
}