import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { RoutineTask, TimeOfDay } from '../types/routine';
import {
  DayBoundaries,
  SECTION_COLORS,
  TIME_OF_DAY_LABELS,
  TIME_OF_DAY_ORDER,
  sectionRange,
  taskTimeOfDay,
  withAlpha,
} from '../utils/timeOfDay';

// The day at a glance, above the Today card: one ring per part of the day,
// in the style of the Home tab's rings. Each ring fills as that part's items
// are checked off. The ring for the part being shown is the large one; tap
// another to switch the Today card, and the rings trade sizes smoothly.

interface Props {
  tasks: RoutineTask[];
  isToday: boolean;
  now: Date;
  boundaries: DayBoundaries;
  // Section the Today card is showing (drawn as the large ring).
  shownSection: TimeOfDay;
  onSelectSection: (section: TimeOfDay) => void;
}

const BOX = 96; // large ring
const STROKE = 8;
const SMALL = 0.7; // small rings are 70% of the large one
const R = (BOX - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

const ICONS: Record<TimeOfDay, keyof typeof Ionicons.glyphMap> = {
  morning: 'sunny-outline',
  afternoon: 'partly-sunny-outline',
  night: 'moon-outline',
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function formatLeft(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m left`;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

const Ring: React.FC<{
  section: TimeOfDay;
  fraction: number;
  shown: boolean;
  caption: string;
  captionStrong: boolean;
  onPress: () => void;
  grow: Animated.Value;
}> = ({ section, fraction, shown, caption, captionStrong, onPress, grow }) => {
  const color = SECTION_COLORS[section];

  // Fill slides to its new level when items are checked or unchecked.
  const fill = useRef(new Animated.Value(fraction)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: fraction,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [fraction, fill]);

  const scale = grow.interpolate({ inputRange: [0, 1], outputRange: [SMALL, 1] });
  // Keep every ring's bottom on the same line so the labels stay put.
  const translateY = grow.interpolate({ inputRange: [0, 1], outputRange: [(BOX * (1 - SMALL)) / 2, 0] });
  const iconOpacity = grow.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });

  // Caption fades between texts; when it goes away (a finished ring), the
  // old text fades out in place. Its line stays reserved so nothing moves.
  const [shownCaption, setShownCaption] = useState(caption);
  const captionOpacity = useRef(new Animated.Value(caption ? 1 : 0)).current;
  useEffect(() => {
    if (caption === shownCaption) {
      if (caption) captionOpacity.setValue(1);
      return;
    }
    if (!caption) {
      Animated.timing(captionOpacity, { toValue: 0, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true })
        .start(({ finished }) => finished && setShownCaption(''));
    } else if (!shownCaption) {
      setShownCaption(caption);
      captionOpacity.setValue(0);
      Animated.timing(captionOpacity, { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    } else {
      setShownCaption(caption); // text changed (count ticked, time moved): swap in place
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ringItem, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${TIME_OF_DAY_LABELS[section]}, ${caption}`}
      accessibilityState={{ selected: shown }}
      hitSlop={4}
    >
      <Animated.View style={[styles.ringBox, { transform: [{ translateY }, { scale }] }]}>
        <Svg width={BOX} height={BOX}>
          <Circle cx={BOX / 2} cy={BOX / 2} r={R} fill="none" stroke={withAlpha(color, 0.18)} strokeWidth={STROKE} />
          <AnimatedCircle
            cx={BOX / 2}
            cy={BOX / 2}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={[CIRC, CIRC]}
            strokeDashoffset={fill.interpolate({ inputRange: [0, 1], outputRange: [CIRC, 0] })}
            // A round cap would leave a dot at 0%; hide the arc until it has length.
            strokeOpacity={fill.interpolate({ inputRange: [0, 0.005, 1], outputRange: [0, 1, 1] })}
            rotation={-90}
            originX={BOX / 2}
            originY={BOX / 2}
          />
        </Svg>
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconWrap, { opacity: iconOpacity }]}>
          <Ionicons name={fraction >= 1 ? 'checkmark' : ICONS[section]} size={30} color={color} />
        </Animated.View>
      </Animated.View>
      <Text style={[styles.name, { color }, shown && styles.nameShown]}>{TIME_OF_DAY_LABELS[section]}</Text>
      <Animated.Text
        style={[styles.caption, captionStrong && styles.captionStrong, { opacity: captionOpacity }]}
        numberOfLines={1}
      >
        {shownCaption || ' '}
      </Animated.Text>
    </Pressable>
  );
};

const DayRings: React.FC<Props> = ({ tasks, isToday, now, boundaries, shownSection, onSelectSection }) => {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const nowSection: TimeOfDay =
    minutes < boundaries.afternoonStart ? 'morning' : minutes < boundaries.nightStart ? 'afternoon' : 'night';
  const nowIndex = TIME_OF_DAY_ORDER.indexOf(nowSection);

  // One grow value per ring: 1 = large (shown), 0 = small. Starts at the
  // right sizes, then animates on every switch.
  const grows = useRef(
    Object.fromEntries(TIME_OF_DAY_ORDER.map(s => [s, new Animated.Value(s === shownSection ? 1 : 0)])) as Record<
      TimeOfDay,
      Animated.Value
    >,
  ).current;
  useEffect(() => {
    Animated.parallel(
      TIME_OF_DAY_ORDER.map(s =>
        Animated.timing(grows[s], {
          toValue: s === shownSection ? 1 : 0,
          duration: 320,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [shownSection, grows]);

  const rings = TIME_OF_DAY_ORDER.map((section, index) => {
    const items = tasks.filter(t => taskTimeOfDay(t) === section);
    const done = items.filter(t => t.completed).length;
    const fraction = items.length === 0 ? 0 : done / items.length;

    // Under each ring: the current part shows its time left; later parts
    // show nothing; earlier parts show "4 of 5" until they're finished, then
    // nothing (the checkmark says it). Night is the day's last part, so it
    // also carries its count next to the time left until it's finished.
    const complete = items.length > 0 && done === items.length;
    const count = items.length > 0 && !complete ? `${done} of ${items.length}` : '';
    let caption = '';
    let strong = false;
    if (isToday && index === nowIndex) {
      const left = formatLeft(sectionRange(section, boundaries)[1] - minutes);
      caption = section === 'night' && count ? `${count} · ${left}` : left;
      strong = true;
    } else if (isToday && index > nowIndex) {
      caption = '';
    } else {
      caption = count;
    }
    return { section, fraction, caption, strong };
  });

  return (
    <View style={styles.card}>
      {/* Soft glow in the shown section's color; crossfades with the rings. */}
      <View pointerEvents="none" style={styles.glowLayer}>
        {TIME_OF_DAY_ORDER.map(section => (
          <Animated.View key={section} style={[StyleSheet.absoluteFill, { opacity: grows[section] }]}>
            <Svg width="100%" height="100%">
              <Defs>
                <RadialGradient id={`rings-glow-${section}`} cx="50%" cy="20%" rx="60%" ry="90%">
                  <Stop offset="0" stopColor={SECTION_COLORS[section]} stopOpacity={0.12} />
                  <Stop offset="1" stopColor={SECTION_COLORS[section]} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#rings-glow-${section})`} />
            </Svg>
          </Animated.View>
        ))}
      </View>

      {rings.map(({ section, fraction, caption, strong }) => (
        <Ring
          key={section}
          section={section}
          fraction={fraction}
          shown={section === shownSection}
          caption={caption}
          captionStrong={strong}
          onPress={() => onSelectSection(section)}
          grow={grows[section]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#161616',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#232323',
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 6,
    marginBottom: 12,
    overflow: 'hidden',
  },
  glowLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  ringItem: {
    flex: 1,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  ringBox: {
    width: BOX,
    height: BOX,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  nameShown: {
    fontWeight: '800',
  },
  caption: {
    marginTop: 1,
    fontSize: 12,
    color: '#8A8A8A',
    fontVariant: ['tabular-nums'],
  },
  captionStrong: {
    color: '#E8E8E8',
    fontWeight: '600',
  },
});

export default DayRings;
