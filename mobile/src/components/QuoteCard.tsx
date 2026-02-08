import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Quote } from '../types/quote.types';

interface QuoteCardProps {
  quote: Quote;
  rating?: number;
  onRate: (quoteId: number, rating: number) => void;
}

const QuoteCard: React.FC<QuoteCardProps> = ({ quote, rating, onRate }) => {
  return (
    <View style={styles.quoteCard}>
      <Text style={styles.quoteText}>"{quote.text}"</Text>
      <Text style={styles.quoteAuthor}>{'\u2014'} {quote.author}</Text>

      <View style={styles.ratingContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => onRate(quote.id, star)}
            style={styles.starButton}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.star,
                rating !== undefined && star <= rating && styles.starFilled,
              ]}
            >
              {'\u2605'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {rating !== undefined && (
        <Text style={styles.ratingLabel}>
          You rated this {rating} star{rating !== 1 ? 's' : ''}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  quoteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  quoteText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1F2937',
    fontStyle: 'italic',
    marginBottom: 12,
    textAlign: 'center',
  },
  quoteAuthor: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'right',
    marginBottom: 16,
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  starButton: {
    padding: 4,
  },
  star: {
    fontSize: 32,
    color: '#D1D5DB',
  },
  starFilled: {
    color: '#FBBF24',
  },
  ratingLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
  },
});

export default QuoteCard;
