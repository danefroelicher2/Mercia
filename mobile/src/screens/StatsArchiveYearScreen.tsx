import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useRoute } from '@react-navigation/native';
import { SECTION_COLORS } from '../utils/timeOfDay';
import YearStats from '../components/YearStats';
import { ArchivedYear } from './statsArchiveData';

// One finished year: a cover, then the same layout as the Stats tab.

const StatsArchiveYearScreen: React.FC = () => {
  const { entry } = useRoute<any>().params as { entry: ArchivedYear };
  const d = entry.data;
  const coverHeight = Math.round(useWindowDimensions().height * 0.2);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Cover: the year over the day's three colors. */}
      <View style={styles.cover}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <RadialGradient id="m" cx="6%" cy="20%" r="55%">
              <Stop offset="0" stopColor={SECTION_COLORS.morning} stopOpacity={0.55} />
              <Stop offset="1" stopColor={SECTION_COLORS.morning} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="a" cx="50%" cy="-10%" r="45%">
              <Stop offset="0" stopColor={SECTION_COLORS.afternoon} stopOpacity={0.4} />
              <Stop offset="1" stopColor={SECTION_COLORS.afternoon} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="n" cx="94%" cy="22%" r="55%">
              <Stop offset="0" stopColor={SECTION_COLORS.night} stopOpacity={0.62} />
              <Stop offset="1" stopColor={SECTION_COLORS.night} stopOpacity={0} />
            </RadialGradient>
            <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.55" stopColor="#161616" stopOpacity={0} />
              <Stop offset="1" stopColor="#161616" stopOpacity={0.9} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="#161616" />
          <Rect width="100%" height="100%" fill="url(#m)" />
          <Rect width="100%" height="100%" fill="url(#a)" />
          <Rect width="100%" height="100%" fill="url(#n)" />
          <Rect width="100%" height="100%" fill="url(#fade)" />
        </Svg>
        <View style={[styles.coverTop, { height: coverHeight }]}>
          {/* The sun's path across the day, faint behind the year. */}
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
            <Path d="M 4 92 Q 50 -8 96 92" stroke="#FFFFFF" strokeOpacity={0.09} strokeWidth={0.6} fill="none" />
          </Svg>
          <Text style={styles.coverLabel}>YEAR IN REVIEW</Text>
          <Text style={styles.coverYear}>{entry.year}</Text>
          {!d.final ? <Text style={[styles.tag, styles.coverTag]}>FINALIZING</Text> : null}
        </View>
      </View>

      <YearStats data={d} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  cover: { borderRadius: 18, overflow: 'hidden' },
  coverTop: { alignItems: 'center', justifyContent: 'center' },
  coverLabel: { fontSize: 11, letterSpacing: 3, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  coverYear: {
    fontFamily: 'Palatino', fontStyle: 'italic', fontWeight: '700', fontSize: 100, lineHeight: 110, marginTop: -2,
    color: '#FFFFFF', fontVariant: ['lining-nums'],
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12,
  },
  coverTag: { position: 'absolute', top: 12, right: 12 },
  tag: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#999',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#444', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden',
  },
});

export default StatsArchiveYearScreen;
