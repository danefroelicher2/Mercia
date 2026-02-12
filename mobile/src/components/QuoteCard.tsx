import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { Quote } from '../types/quote.types';
import api from '../services/api';

interface QuoteCardProps {
  quote: Quote;
}

const QuoteCard: React.FC<QuoteCardProps> = ({ quote }) => {
  const [likeCount, setLikeCount] = useState<number>(0);
  const [userInteraction, setUserInteraction] = useState<'like' | 'dislike' | 'none'>('none');
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load like count and user interaction on mount
  useEffect(() => {
    loadQuoteData();
  }, [quote.id]);

  const loadQuoteData = async () => {
    try {
      // Get like count
      const countsResponse = await api.get('/api/routine/quotes/like-counts');
      if (countsResponse.data.success) {
        setLikeCount(countsResponse.data.data[quote.id] || 0);
      }

      // Get user's interaction
      const interactionResponse = await api.get(`/api/routine/quotes/${quote.id}/user-interaction`);
      if (interactionResponse.data.success) {
        setUserInteraction(interactionResponse.data.data.interaction_type);
      }
    } catch (error) {
      console.error('[QuoteCard] Error loading quote data:', error);
    }
  };

  const handleInteraction = async (type: 'like' | 'dislike') => {
    setLoading(true);
    try {
      // Toggle: if clicking same button, set to 'none'
      const newInteraction = userInteraction === type ? 'none' : type;

      const response = await api.post(`/api/routine/quotes/${quote.id}/interact`, {
        interaction_type: newInteraction,
      });

      if (response.data.success) {
        setUserInteraction(newInteraction);
        setLikeCount(response.data.data.likeCount);
        setModalVisible(false);
      }
    } catch (error) {
      console.error('[QuoteCard] Error saving interaction:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.quoteCard}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.quoteText}>"{quote.text}"</Text>
        <View style={styles.quoteFooter}>
          <Text style={styles.quoteAuthor}>{'\u2014'} {quote.author}</Text>
          <Text style={styles.likeCount}>
            {likeCount} {likeCount === 1 ? 'like' : 'likes'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Interaction Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rate this quote</Text>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[
                  styles.interactionButton,
                  userInteraction === 'like' && styles.likeButtonActive,
                ]}
                onPress={() => handleInteraction('like')}
                disabled={loading}
              >
                {loading && userInteraction !== 'dislike' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={[
                    styles.buttonText,
                    userInteraction === 'like' && styles.buttonTextActive,
                  ]}>
                    Like
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.interactionButton,
                  userInteraction === 'dislike' && styles.dislikeButtonActive,
                ]}
                onPress={() => handleInteraction('dislike')}
                disabled={loading}
              >
                {loading && userInteraction !== 'like' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={[
                    styles.buttonText,
                    userInteraction === 'dislike' && styles.buttonTextActive,
                  ]}>
                    Dislike
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  quoteCard: {
    backgroundColor: '#E5E5E5',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  quoteText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1F2937',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  quoteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  quoteAuthor: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    fontStyle: 'italic',
  },
  likeCount: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  interactionButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#3A3A3A',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  likeButtonActive: {
    backgroundColor: '#00D9A0',
  },
  dislikeButtonActive: {
    backgroundColor: '#FF6B35',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A0A0A0',
  },
  buttonTextActive: {
    color: '#FFFFFF',
  },
  closeButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    color: '#A0A0A0',
  },
});

export default QuoteCard;
