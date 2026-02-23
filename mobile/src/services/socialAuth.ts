import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

GoogleSignin.configure({
  webClientId: '569611512008-mq71v2a6ut8ognkrugk53o5b8cqcis4d.apps.googleusercontent.com',
  iosClientId: '569611512008-qp85oac30v529f05337kodb6ugtevfsl.apps.googleusercontent.com',
  offlineAccess: false,
});

export interface SocialAuthResult {
  idToken: string;
  nonce?: string;
}

export const signInWithGoogle = async (): Promise<SocialAuthResult> => {
  await GoogleSignin.hasPlayServices();
  const { data } = await GoogleSignin.signIn();
  if (!data?.idToken) {
    throw new Error('No ID token received from Google');
  }
  return { idToken: data.idToken };
};

export const signInWithApple = async (): Promise<SocialAuthResult> => {
  try {
    // Check if Apple Authentication is available
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Apple Sign-In is not available on this device');
    }

    // Generate nonce for security
    const nonce = Math.random().toString(36).substring(2, 10);
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      nonce
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error('No identity token received from Apple');
    }

    return {
      idToken: credential.identityToken,
      nonce,
    };
  } catch (error: any) {
    console.error('Apple Sign-In Error:', error);

    if (error.code === 'ERR_REQUEST_CANCELED') {
      throw new Error('Apple sign-in was canceled');
    }

    throw new Error(error.message || 'Apple sign-in failed');
  }
};

export const isAppleAuthAvailable = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') return false;
  return await AppleAuthentication.isAvailableAsync();
};
