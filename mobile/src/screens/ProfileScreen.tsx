import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { colors, spacing } from '../constants/theme';

const ProfileScreen: React.FC = () => {
  const { user, logout, isLoading } = useAuth();
  const navigation = useNavigation<any>();

  // Change Password state
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Delete Account state
  const [deletingAccount, setDeletingAccount] = useState(false);

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
      'This will permanently delete all your data including questions, chats, routines, and stats. This cannot be undone.\n\nAre you absolutely sure?',
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
            try {
              await logout();
            } catch (error) {
              Alert.alert('Error', 'Failed to sign out. Please try again.');
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

        {/* Change Password */}
        <TouchableOpacity
          style={styles.navRow}
          onPress={() => setChangePasswordVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.navRowLabel}>Change Password</Text>
          <Text style={styles.navRowChevron}>›</Text>
        </TouchableOpacity>

        {/* Oasis Memory */}
        <TouchableOpacity
          style={styles.navRow}
          onPress={() => navigation.navigate('OasisMemory')}
          activeOpacity={0.7}
        >
          <Text style={styles.navRowLabel}>Oasis Memory</Text>
          <Text style={styles.navRowChevron}>›</Text>
        </TouchableOpacity>

        {/* Notifications */}
        <TouchableOpacity
          style={styles.navRow}
          onPress={() => navigation.navigate('NotificationSettings')}
          activeOpacity={0.7}
        >
          <Text style={styles.navRowLabel}>Notifications</Text>
          <Text style={styles.navRowChevron}>›</Text>
        </TouchableOpacity>

        {/* Summary History */}
        <TouchableOpacity
          style={styles.navRow}
          onPress={() => navigation.navigate('SummaryHistory')}
          activeOpacity={0.7}
        >
          <Text style={styles.navRowLabel}>Summary History</Text>
          <Text style={styles.navRowChevron}>›</Text>
        </TouchableOpacity>

        {/* App Version */}
        <View style={styles.navRow}>
          <Text style={styles.navRowLabel}>Version</Text>
          <Text style={styles.versionValue}>1.0.0</Text>
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={[styles.signOutButton, isLoading && styles.buttonDisabled]}
          onPress={handleSignOut}
          disabled={isLoading}
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
    backgroundColor: colors.screenBg,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.screenPadding,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  profileCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  infoContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  navRow: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navRowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  navRowChevron: {
    fontSize: 18,
    color: colors.textTertiary,
  },
  versionValue: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  signOutButton: {
    backgroundColor: colors.cardBg,
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
    backgroundColor: colors.cardBg,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
    color: colors.textPrimary,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.inputBg,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.primary,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});

export default ProfileScreen;
