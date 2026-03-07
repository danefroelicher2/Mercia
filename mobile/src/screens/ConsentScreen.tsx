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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { setConsent } from '../services/consentService';
import { RootStackParamList } from '../navigation/RootNavigator';

const ConsentScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleAgree = async () => {
    await setConsent(true);
    navigation.goBack();
  };

  const handleDecline = async () => {
    await setConsent(false);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headline}>Before You Continue</Text>

        <Text style={styles.body}>
          Oasis AI uses Groq, a third-party AI service, to power your conversations and generate personalized insights. Your conversation messages and question responses may be processed by Groq to generate responses. By continuing, you consent to this data processing. You can change this at any time in your profile settings.
        </Text>

        <TouchableOpacity
          onPress={() => Linking.openURL('https://tranquil-marigold-3d7831.netlify.app')}
        >
          <Text style={styles.privacyLink}>Privacy Policy</Text>
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
