import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import api from '../services/api';
import { colors, spacing } from '../constants/theme';
import { getConsent, setConsent } from '../services/consentService';

const ProfileScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { isSubscribed } = useSubscription();
  const navigation = useNavigation<any>();

  // Change Password state
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Delete Account state
  const [deletingAccount, setDeletingAccount] = useState(false);

  // AI Data Consent state
  const [aiConsent, setAiConsent] = useState(false);

  useEffect(() => {
    getConsent().then(setAiConsent);
  }, []);

  const handleConsentToggle = async (value: boolean) => {
    if (!value) {
      // Toggling OFF — apply immediately, no disclosure needed
      setAiConsent(false);
      await setConsent(false);
      return;
    }

    // Toggling ON — require full disclosure acknowledgement first
    Alert.alert(
      'AI Data Consent',
      'Mercia sends your conversation messages to Groq, a third-party AI service, to generate responses. Groq does not use your data to train AI models. Do you consent to this data processing?',
      [
        { text: 'Decline', style: 'cancel' },
        {
          text: 'I Agree',
          onPress: async () => {
            setAiConsent(true);
            await setConsent(true);
          },
        },
      ]
    );
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    try {
      setChangingPassword(true);
      const response = await api.post('/api/auth/change-password', {
        currentPassword,
        newPassword,
      });
      if (response.data.success) {
        Alert.alert('Success', 'Password changed successfully');
        setChangePasswordVisible(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to change password';
      Alert.alert('Error', errorMessage);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete all your data including chats, routines, and stats. This cannot be undone.\n\nAre you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: confirmDeleteAccount,
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    try {
      setDeletingAccount(true);
      await api.delete('/api/auth/account');
      logout();
    } catch (error: any) {
      Alert.alert('Error', 'Failed to delete account. Please try again.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setIsSigningOut(true);
            try {
              await logout();
            } catch (error) {
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            } finally {
              setIsSigningOut(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.email?.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          </View>

          <View style={styles.infoContainer}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{user?.email || 'Unknown'}</Text>
          </View>

          {user?.username && (
            <View style={styles.infoContainer}>
              <Text style={styles.label}>Username</Text>
              <Text style={styles.value}>{user.username}</Text>
            </View>
          )}
        </View>

        {/* ACCOUNT SECTION */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Account</Text>
        </View>

        <View style={styles.navGroup}>
          <TouchableOpacity
            style={[styles.navRow, !isSubscribed && styles.navRowLast]}
            onPress={() => setChangePasswordVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.navRowLabel}>Change Password</Text>
            <Text style={styles.navRowChevron}>›</Text>
          </TouchableOpacity>

          {isSubscribed && (
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => navigation.navigate('GymMemory')}
              activeOpacity={0.7}
            >
              <Text style={styles.navRowLabel}>Gym Memory</Text>
              <Text style={styles.navRowChevron}>›</Text>
            </TouchableOpacity>
          )}

          {isSubscribed && (
            <TouchableOpacity
              style={[styles.navRow, styles.navRowLast]}
              onPress={() => navigation.navigate('SummaryData')}
              activeOpacity={0.7}
            >
              <Text style={styles.navRowLabel}>Summary Data</Text>
              <Text style={styles.navRowChevron}>›</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* PREFERENCES SECTION */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Preferences</Text>
        </View>

        <View style={styles.navGroup}>
          <TouchableOpacity
            style={[styles.navRow, styles.navRowLast]}
            onPress={() => navigation.navigate('RoutinePreferences')}
            activeOpacity={0.7}
          >
            <Text style={styles.navRowLabel}>Routine Tab</Text>
            <Text style={styles.navRowChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* SETTINGS SECTION */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Settings</Text>
        </View>

        <View style={styles.navGroup}>
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => navigation.navigate('NotificationSettings')}
            activeOpacity={0.7}
          >
            <Text style={styles.navRowLabel}>Notifications</Text>
            <Text style={styles.navRowChevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.navRow}>
            <View style={styles.consentLabelContainer}>
              <Text style={styles.navRowLabel}>AI Data Consent</Text>
              <Text style={styles.consentSubtitle}>Allow Mercia to process your data with Groq AI</Text>
            </View>
            <Switch
              value={aiConsent}
              onValueChange={handleConsentToggle}
              trackColor={{ false: '#333333', true: '#1D9E75' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.navRow, styles.navRowLast]}>
            <Text style={styles.navRowLabel}>Version</Text>
            <Text style={styles.versionValue}>{Constants.expoConfig?.version ?? '1.0.2'}</Text>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={[styles.signOutButton, isSigningOut && styles.buttonDisabled]}
          onPress={handleSignOut}
          disabled={isSigningOut}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Delete Account */}
        <TouchableOpacity
          style={[styles.deleteButton, deletingAccount && styles.buttonDisabled]}
          onPress={handleDeleteAccount}
          disabled={deletingAccount}
        >
          {deletingAccount ? (
            <ActivityIndicator color="#ff3b30" />
          ) : (
            <Text style={styles.deleteText}>Delete Account</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={changePasswordVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setChangePasswordVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>

            <TextInput
              style={styles.input}
              placeholder="Current Password"
              placeholderTextColor={colors.textTertiary}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="New Password"
              placeholderTextColor={colors.textTertiary}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm New Password"
              placeholderTextColor={colors.textTertiary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setChangePasswordVisible(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                disabled={changingPassword}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, changingPassword && styles.saveButtonDisabled]}
                onPress={handleChangePassword}
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <ActivityIndicator color={colors.textPrimary} />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#E8E8E8',
  },

  // Profile Card
  profileCard: {
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#232323',
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1D9E75',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  infoContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  value: {
    fontSize: 15,
    color: '#E8E8E8',
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    marginTop: 4,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    backgroundColor: '#1D9E75',
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    color: '#777',
    fontWeight: '500',
  },

  // Grouped nav cards
  navGroup: {
    backgroundColor: '#161616',
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#232323',
    overflow: 'hidden',
  },
  navRow: {
    backgroundColor: '#161616',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
  },
  navRowLast: {
    borderBottomWidth: 0,
  },
  navRowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E8E8E8',
  },
  navRowChevron: {
    fontSize: 20,
    color: '#666',
  },
  versionValue: {
    fontSize: 15,
    color: '#888',
  },
  consentLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  consentSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },

  // Sign out / delete
  signOutButton: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#ff3b30',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  signOutText: {
    color: '#ff3b30',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#161616',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  deleteText: {
    color: '#ff3b30',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#232323',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 20,
    color: '#E8E8E8',
  },
  input: {
    backgroundColor: '#1F1F1F',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
    color: '#E8E8E8',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#1F1F1F',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#888',
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#1D9E75',
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});

export default ProfileScreen;
