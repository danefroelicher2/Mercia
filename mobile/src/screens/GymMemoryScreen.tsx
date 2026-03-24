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

interface GymMemoryEntry {
  id: string;
  user_id: string;
  workout_group: string;
  notes: string;
  session_date: string;
  created_at: string;
}

interface GymMemoryGroup {
  workout_group: string;
  entries: GymMemoryEntry[];
}

type Tab = 'history' | 'prs';

const GymMemoryScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('history');
  const [groups, setGroups] = useState<GymMemoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const loadMemory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/gym/memory');
      setGroups(res.data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

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

  const handleDeleteGroup = (group: GymMemoryGroup) => {
    Alert.alert(
      'Delete Group',
      `Delete all memory entries for "${group.workout_group}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/gym/memory/${encodeURIComponent(group.workout_group)}`);
              setGroups(prev => prev.filter(g => g.workout_group !== group.workout_group));
            } catch {
              Alert.alert('Error', 'Failed to delete group. Please try again.');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderHistory = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color="#1D9E75" />
        </View>
      );
    }

    if (groups.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No gym memory yet</Text>
          <Text style={styles.emptySubtitle}>Log a workout in the Gym tab to build your history.</Text>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {groups.map(group => (
          <View key={group.workout_group} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupName}>{group.workout_group}</Text>
              <TouchableOpacity onPress={() => handleDeleteGroup(group)}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
            {group.entries.map(entry => (
              <View key={entry.id}>
                <TouchableOpacity
                  style={styles.entryRow}
                  onPress={() => toggleEntry(entry.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.entryDate}>{formatDate(entry.session_date)}</Text>
                  <Text style={styles.entryChevron}>
                    {expandedEntries.has(entry.id) ? '∧' : '∨'}
                  </Text>
                </TouchableOpacity>
                {expandedEntries.has(entry.id) && (
                  <View style={styles.entryExpanded}>
                    <Text style={styles.entryNotes}>{entry.notes}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderPRs = () => (
    <View style={styles.centered}>
      <Text style={styles.emptyTitle}>PRs coming soon</Text>
      <Text style={styles.emptySubtitle}>
        Personal records will be tracked automatically from your workout logs.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Sub-tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            Workout history
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'prs' && styles.tabActive]}
          onPress={() => setActiveTab('prs')}
        >
          <Text style={[styles.tabText, activeTab === 'prs' && styles.tabTextActive]}>PRs</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'history' ? renderHistory() : renderPRs()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
    backgroundColor: '#161616',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#1D9E75',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#E8E8E8',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
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
  deleteText: {
    fontSize: 13,
    color: '#FF6B6B',
    fontWeight: '500',
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
  entryNotes: {
    fontSize: 13,
    color: '#888',
    lineHeight: 20,
  },
});

export default GymMemoryScreen;
