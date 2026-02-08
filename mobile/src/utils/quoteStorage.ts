import AsyncStorage from '@react-native-async-storage/async-storage';
import { QuoteRatingsStorage } from '../types/quote.types';

const QUOTE_RATINGS_KEY = '@quote_ratings';

export const saveQuoteRatings = async (ratings: QuoteRatingsStorage): Promise<void> => {
  try {
    await AsyncStorage.setItem(QUOTE_RATINGS_KEY, JSON.stringify(ratings));
  } catch (error) {
    console.error('Error saving quote ratings:', error);
  }
};

export const loadQuoteRatings = async (): Promise<QuoteRatingsStorage> => {
  try {
    const ratingsJson = await AsyncStorage.getItem(QUOTE_RATINGS_KEY);
    return ratingsJson ? JSON.parse(ratingsJson) : {};
  } catch (error) {
    console.error('Error loading quote ratings:', error);
    return {};
  }
};
