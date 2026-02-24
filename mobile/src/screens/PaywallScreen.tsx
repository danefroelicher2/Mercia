import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { PurchasesPackage, PurchasesOfferings } from 'react-native-purchases';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, buttonStyles } from '../constants/theme';
import { getOfferings, purchasePackage, restorePurchases } from '../services/purchases';
import { useSubscription } from '../context/SubscriptionContext';
import { AuthStackParamList } from '../navigation/AuthNavigator';

type PaywallScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Paywall'>;

interface PaywallScreenProps {
  navigation: PaywallScreenNavigationProp;
}

const FEATURES = [
  'Daily personalized questions that learn who you are',
  'AI that remembers your conversations and grows with you',
  'Routine tracking, goals, and weekly insights',
];

const PaywallScreen: React.FC<PaywallScreenProps> = ({ navigation }) => {
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshSubscriptionStatus } = useSubscription();

  const fetchOfferings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getOfferings();
      setOfferings(result);
      const monthly = result.current?.monthly ?? null;
      setMonthlyPackage(monthly);
    } catch (e) {
      setError('Failed to load offerings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOfferings();
  }, []);

  const handlePurchase = async () => {
    if (!monthlyPackage) return;
    setIsPurchasing(true);
    try {
      const status = await purchasePackage(monthlyPackage);
      await refreshSubscriptionStatus();
      if (status.isSubscribed) {
        // Navigation will be handled by RootNavigator observing subscription state
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Purchase Failed', e.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const status = await restorePurchases();
      await refreshSubscriptionStatus();
      if (!status.isSubscribed) {
        Alert.alert('No Purchases Found', 'No previous purchases were found for this account.');
      }
    } catch (e: any) {
      Alert.alert('Restore Failed', e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  const priceString = monthlyPackage?.product.priceString ?? '$9.99';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Logo / Name */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>Oasis AI</Text>
          <Text style={styles.tagline}>Your personal AI growth companion</Text>
        </View>

        {/* Feature bullets */}
        <View style={styles.featuresContainer}>
          {FEATURES.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <Text style={styles.checkmark}>✓</Text>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        {/* Pricing */}
        <View style={styles.pricingContainer}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} size="large" />
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchOfferings}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.price}>{priceString}</Text>
              <Text style={styles.pricePeriod}>/ month</Text>
              <Text style={styles.cancelAnytime}>Cancel anytime</Text>
            </>
          )}
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          style={[buttonStyles.primary, styles.ctaButton, (isPurchasing || isLoading || !!error) && buttonStyles.disabled]}
          onPress={handlePurchase}
          disabled={isPurchasing || isLoading || !!error}
          activeOpacity={0.8}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={buttonStyles.primaryText}>Start Free Trial</Text>
          )}
        </TouchableOpacity>

        {/* Restore link */}
        <TouchableOpacity onPress={handleRestore} disabled={isRestoring} style={styles.restoreButton}>
          {isRestoring ? (
            <ActivityIndicator color={colors.textSecondary} size="small" />
          ) : (
            <Text style={styles.restoreText}>Restore Purchases</Text>
          )}
        </TouchableOpacity>

        {/* Sign In link */}
        <TouchableOpacity onPress={() => navigation.navigate('Auth')} style={styles.signInButton}>
          <Text style={styles.signInText}>Already a subscriber? Sign In</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 60,
    paddingBottom: 40,
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoText: {
    fontSize: 42,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  featuresContainer: {
    width: '100%',
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 24,
    marginBottom: 40,
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkmark: {
    fontSize: 18,
    color: colors.success,
    fontWeight: '700',
    lineHeight: 24,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  pricingContainer: {
    alignItems: 'center',
    marginBottom: 32,
    minHeight: 80,
    justifyContent: 'center',
  },
  price: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 56,
  },
  pricePeriod: {
    fontSize: 18,
    color: colors.textSecondary,
    marginTop: 4,
  },
  cancelAnytime: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 8,
  },
  errorContainer: {
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  retryButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  ctaButton: {
    width: '100%',
    marginBottom: 16,
  },
  restoreButton: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  restoreText: {
    fontSize: 14,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  signInButton: {
    paddingVertical: 12,
    marginTop: 8,
  },
  signInText: {
    fontSize: 14,
    color: colors.textTertiary,
  },
});

export default PaywallScreen;
