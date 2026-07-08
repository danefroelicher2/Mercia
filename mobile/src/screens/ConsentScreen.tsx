import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Linking,
  ScrollView,
} from 'react-native';
import { setConsent } from '../services/consentService';

interface ConsentScreenProps {
  onConsentAnswered: () => void;
}

const ConsentScreen: React.FC<ConsentScreenProps> = ({ onConsentAnswered }) => {
  const handleAgree = async () => {
    await setConsent(true);
    onConsentAnswered();
  };

  const handleDecline = async () => {
    await setConsent(false);
    onConsentAnswered();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headline}>Before You Continue</Text>

        <Text style={styles.body}>
          Mercia sends your conversation messages to Groq, a third-party AI service, to generate responses. This data is transmitted to Groq's servers for processing. Groq does not use your data to train AI models. You must agree to continue using Mercia features. You can revoke this consent at any time in your Profile settings.
        </Text>

        <TouchableOpacity
          onPress={() => Linking.openURL('https://tranquil-marigold-3d7831.netlify.app')}
        >
          <Text style={styles.privacyLink}>Mercia Privacy Policy</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => Linking.openURL('https://groq.com/privacy-policy')}
        >
          <Text style={[styles.privacyLink, styles.groqPrivacyLink]}>Groq Privacy Policy</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.agreeButton} onPress={handleAgree} activeOpacity={0.85}>
          <Text style={styles.agreeText}>I Agree</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleDecline} activeOpacity={0.7}>
          <Text style={styles.declineText}>Decline</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  headline: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 28,
  },
  body: {
    fontSize: 15,
    color: '#CCCCCC',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  privacyLink: {
    fontSize: 14,
    color: '#E8622A',
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginBottom: 12,
  },
  groqPrivacyLink: {
    marginBottom: 44,
  },
  agreeButton: {
    backgroundColor: '#E8622A',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  agreeText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  declineText: {
    fontSize: 15,
    color: '#555555',
    textAlign: 'center',
  },
});

export default ConsentScreen;
