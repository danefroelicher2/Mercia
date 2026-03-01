import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { PurchasesPackage, PurchasesOfferings } from 'react-native-purchases';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getOfferings, purchasePackage } from '../services/purchases';
import { useSubscription } from '../context/SubscriptionContext';

const BENEFITS = [
  'Daily questions that learn who you are',
  'AI memory that grows with every conversation',
  'Full access to your Oasis',
];

const PaywallScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
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
        navigation.goBack();
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Purchase Failed', e.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const priceString = monthlyPackage?.product.priceString ?? '$4.99';
  const isCtaDisabled = isPurchasing || isLoading || !!error;

  return (
    <SafeAreaView style={styles.container}>
      {/* Close button */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close" size={22} color="#666666" />
      </TouchableOpacity>

      <View style={styles.inner}>
        {/* Top section */}
        <View style={styles.topSection}>
          <Text style={styles.headline}>Oasis Premium</Text>
          <Text style={styles.subheadline}>Unlock your AI growth companion</Text>

          <View style={styles.divider} />

          <View style={styles.benefits}>
            {BENEFITS.map((benefit, i) => (
              <Text key={i} style={styles.benefitText}>{benefit}</Text>
            ))}
          </View>
        </View>

        {/* Bottom section */}
        <View style={styles.bottomSection}>
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" size="large" style={styles.priceLoader} />
          ) : error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={fetchOfferings} style={styles.retryButton}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.price}>
              {priceString}{' '}
              <Text style={styles.pricePeriod}>/ month</Text>
            </Text>
          )}

          <TouchableOpacity
            style={[styles.ctaButton, isCtaDisabled && styles.ctaDisabled]}
            onPress={handlePurchase}
            disabled={isCtaDisabled}
            activeOpacity={0.85}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaText}>Get Oasis Premium</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.cancelText}>Cancel anytime</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    padding: 4,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
  },
  headline: {
    fontSize: 38,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  subheadline: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 22,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: '#333333',
    marginVertical: 36,
  },
  benefits: {
    alignItems: 'center',
    gap: 18,
  },
  benefitText: {
    fontSize: 15,
    color: '#CCCCCC',
    textAlign: 'center',
    lineHeight: 22,
  },
  bottomSection: {
    alignItems: 'center',
  },
  priceLoader: {
    marginBottom: 32,
  },
  price: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 32,
  },
  pricePeriod: {
    fontSize: 20,
    fontWeight: '400',
    color: '#888888',
  },
  errorBlock: {
    alignItems: 'center',
    marginBottom: 32,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#FF453A',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#555555',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CCCCCC',
  },
  ctaButton: {
    width: '100%',
    backgroundColor: '#E8622A',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
    marginBottom: 14,
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  cancelText: {
    fontSize: 13,
    color: '#555555',
    textAlign: 'center',
  },
});

export default PaywallScreen;
