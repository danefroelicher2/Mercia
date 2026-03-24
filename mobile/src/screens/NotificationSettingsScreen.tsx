import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing } from '../constants/theme';
import {
  NotificationPrefs,
  DEFAULT_NOTIFICATION_PREFS,
  applyNotificationPreferences,
  registerForPushNotifications,
} from '../services/notifications';

const NOTIFICATION_PREFS_KEY = 'mercia_notification_prefs';

const NotificationSettingsScreen: React.FC = () => {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    loadPrefs();
  }, []);

  const loadPrefs = async () => {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
      if (stored) {
        setPrefs(JSON.parse(stored));
      }
    } catch {
      // use defaults
    }
  };

  const updatePref = <K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  const updateTime = (field: 'hour' | 'minute', delta: number) => {
    setPrefs(prev => {
      const current = prev.dailyQuestionTime[field];
      let next: number;
      if (field === 'hour') {
        next = (current + delta + 24) % 24;
      } else {
        next = (current + delta + 60) % 60;
      }
      return { ...prev, dailyQuestionTime: { ...prev.dailyQuestionTime, [field]: next } };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await registerForPushNotifications();
      await applyNotificationPreferences(prefs);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2000);
    } catch (err) {
      Alert.alert('Error', 'Failed to save notification preferences.');
    } finally {
      setSaving(false);
    }
  };

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Row 1: Daily Question Reminder */}
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Daily Question Reminder</Text>
              <Text style={styles.rowDesc}>Get reminded to answer your daily question</Text>
            </View>
            <Switch
              value={prefs.dailyQuestionReminder}
              onValueChange={val => updatePref('dailyQuestionReminder', val)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.textPrimary}
            />
          </View>

          {prefs.dailyQuestionReminder && (
            <View style={styles.timePicker}>
              <Text style={styles.timeLabel}>Remind me at</Text>
              <View style={styles.timeControls}>
                {/* Hour */}
                <View style={styles.timeUnit}>
                  <TouchableOpacity onPress={() => updateTime('hour', 1)} style={styles.timeBtn}>
                    <Text style={styles.timeBtnText}>+</Text>
                  </TouchableOpacity>
                  <Text style={styles.timeValue}>{pad(prefs.dailyQuestionTime.hour)}</Text>
                  <TouchableOpacity onPress={() => updateTime('hour', -1)} style={styles.timeBtn}>
                    <Text style={styles.timeBtnText}>−</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.timeSeparator}>:</Text>
                {/* Minute */}
                <View style={styles.timeUnit}>
                  <TouchableOpacity onPress={() => updateTime('minute', 5)} style={styles.timeBtn}>
                    <Text style={styles.timeBtnText}>+</Text>
                  </TouchableOpacity>
                  <Text style={styles.timeValue}>{pad(prefs.dailyQuestionTime.minute)}</Text>
                  <TouchableOpacity onPress={() => updateTime('minute', -5)} style={styles.timeBtn}>
                    <Text style={styles.timeBtnText}>−</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Row 2: Weekly Summary Ready */}
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Weekly Summary Ready</Text>
              <Text style={styles.rowDesc}>Know when your Monday summary is ready</Text>
            </View>
            <Switch
              value={prefs.weeklySummaryReady}
              onValueChange={val => updatePref('weeklySummaryReady', val)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.textPrimary}
            />
          </View>
        </View>

        {/* Row 3: Inactivity Reminder */}
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Inactivity Reminder</Text>
              <Text style={styles.rowDesc}>A nudge if you haven't opened the app in 24 hours</Text>
            </View>
            <Switch
              value={prefs.inactivityReminder}
              onValueChange={val => updatePref('inactivityReminder', val)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.textPrimary}
            />
          </View>
        </View>

        {/* Row 4: Streak At Risk */}
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Streak At Risk</Text>
              <Text style={styles.rowDesc}>Alert before your streak is about to break</Text>
            </View>
            <Switch
              value={prefs.streakAtRisk}
              onValueChange={val => updatePref('streakAtRisk', val)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.textPrimary}
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {savedMessage && (
          <Text style={styles.savedText}>Settings saved!</Text>
        )}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: 24,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  rowDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  timePicker: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  timeControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeUnit: {
    alignItems: 'center',
  },
  timeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeBtnText: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '600',
    lineHeight: 22,
  },
  timeValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginVertical: 6,
    minWidth: 36,
    textAlign: 'center',
  },
  timeSeparator: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginHorizontal: 6,
  },
  footer: {
    padding: spacing.screenPadding,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  savedText: {
    textAlign: 'center',
    color: colors.success,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
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

export default NotificationSettingsScreen;
