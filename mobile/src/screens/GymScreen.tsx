import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QuoteCard from '../components/QuoteCard';
import { QUOTES } from '../data/quotes';
import { DayOfWeek } from '../types/routine';

const colors = {
  screenBg: '#0D0D0D',
  cardBg: '#161616',
  inputBg: '#1F1F1F',
  textPrimary: '#E8E8E8',
  textSecondary: '#888',
  textTertiary: '#666',
  primary: '#1D9E75',
  border: '#232323',
  success: '#1D9E75',
};

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const GymScreen: React.FC = () => {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('monday');

  useEffect(() => {
    const today = new Date().getDay();
    const dayIndex = today === 0 ? 6 : today - 1;
    setSelectedDay(DAYS[dayIndex]);
  }, []);

  const currentQuote = useMemo(() => {
    const today = new Date();
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
    );
    return QUOTES[dayOfYear % QUOTES.length];
  }, []);

  const renderWeekNavigator = () => {
    const today = new Date();
    const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay();
    const weekDates = DAYS.map((_, index) => {
      const d = new Date(today);
      d.setDate(today.getDate() + mondayOffset + index);
      return d.getDate();
    });

    return (
      <View style={styles.weekNavigator}>
        {DAYS.map((day, index) => {
          const isSelected = selectedDay === day;
          return (
            <TouchableOpacity
              key={day}
              onPress={() => setSelectedDay(day)}
              style={[styles.weekDay, isSelected && styles.weekDaySelected]}
            >
              <Text style={[styles.weekDayLabel, isSelected && styles.weekDayLabelSelected]}>
                {DAY_LABELS[index].toUpperCase()}
              </Text>
              <Text style={[styles.weekDayDate, isSelected && styles.weekDayDateSelected]}>
                {weekDates[index]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <QuoteCard quote={currentQuote} />
      {renderWeekNavigator()}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderTitle}>Gym</Text>
          <Text style={styles.placeholderText}>Track your workouts, PRs and progress here.</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  weekNavigator: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 4,
  },
  weekDay: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDaySelected: {
    backgroundColor: '#1D9E75',
    shadowColor: '#1D9E75',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  weekDayLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
    fontWeight: '500',
  },
  weekDayLabelSelected: {
    color: '#B3E5D6',
  },
  weekDayDate: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  weekDayDateSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  placeholderCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#232323',
  },
  placeholderTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E8E8E8',
    marginBottom: 6,
  },
  placeholderText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
});

export default GymScreen;
