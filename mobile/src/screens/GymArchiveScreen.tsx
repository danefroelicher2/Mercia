import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import api from '../services/api';

// Sessions that aged out of the 5-per-group Gym Memory window land here
// permanently instead of being deleted. Read-only history + per-entry delete.

interface GymMemoryEntry {
  id: string;
  user_id: string;
  workout_group: string;
  notes: string;
  session_date: string;
  pinned: boolean;
  archived: boolean;
  created_at: string;
}

interface GymMemoryGroup {
  workout_group: string;
  entries: GymMemoryEntry[];
}

const GymArchiveScreen: React.FC = () => {
  const [groups, setGroups] = useState<GymMemoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const loadArchive = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/gym/memory/archive');
      setGroups(res.data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  const toggleEntry = (entryId: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const handleDeleteEntry = (entry: GymMemoryEntry, groupName: string) => {
    Alert.alert(
      'Delete Archived Workout',
      `Permanently delete the ${groupName} session on ${formatDate(entry.session_date)}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/gym/memory/entry/${entry.id}`);
              setGroups(prev =>
                prev
                  .map(g =>
                    g.workout_group === groupName
                      ? { ...g, entries: g.entries.filter(e => e.id !== entry.id) }
                      : g
                  )
                  .filter(g => g.entries.length > 0)
              );
            } catch {
              Alert.alert('Error', 'Failed to delete workout. Please try again.');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#1D9E75" />
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyTitle}>Nothing archived yet</Text>
        <Text style={styles.emptySubtitle}>
          When a workout name collects more than 5 sessions, the oldest ones move here instead of being deleted.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {groups.map(group => (
          <View key={group.workout_group} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupName}>{group.workout_group}</Text>
              <Text style={styles.groupCount}>
                {group.entries.length} {group.entries.length === 1 ? 'session' : 'sessions'}
              </Text>
            </View>
            {group.entries.map((entry, index) => {
              const isLast = index === group.entries.length - 1;
              const isExpanded = expandedEntries.has(entry.id);
              return (
                <View key={entry.id}>
                  <TouchableOpacity
                    style={[styles.entryRow, isLast && !isExpanded && styles.entryRowLast]}
                    onPress={() => toggleEntry(entry.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.entryDate}>{formatDate(entry.session_date)}</Text>
                    <Text style={styles.entryChevron}>{isExpanded ? '∧' : '∨'}</Text>
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={[styles.entryExpanded, isLast && styles.entryExpandedLast]}>
                      <Text style={styles.entryNotes}>{entry.notes}</Text>
                      <TouchableOpacity
                        onPress={() => handleDeleteEntry(entry, group.workout_group)}
                        style={styles.deleteEntryButton}
                      >
                        <Text style={styles.deleteEntryText}>Delete workout</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#E8E8E8',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  groupCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232323',
    marginBottom: 12,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
  },
  groupName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  groupCount: {
    fontSize: 12,
    color: '#666',
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  entryRowLast: {
    borderBottomWidth: 0,
  },
  entryDate: {
    fontSize: 14,
    color: '#888',
  },
  entryChevron: {
    fontSize: 12,
    color: '#555',
  },
  entryExpanded: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#191919',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  entryExpandedLast: {
    borderBottomWidth: 0,
  },
  entryNotes: {
    fontSize: 13,
    color: '#888',
    lineHeight: 20,
  },
  deleteEntryButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  deleteEntryText: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '500',
  },
});

export default GymArchiveScreen;
