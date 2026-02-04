import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../services/api';
import { DailyQuestion, QuestionState, DailyQuestionApiResponse, AnswerApiResponse } from '../types/question';

// Constants
const MAX_CHARS = 2100;
const MIN_CHARS = 10;

const OasisScreen: React.FC = () => {
  // ============================================
  // STATE MANAGEMENT
  // ============================================

  // Question data from API
  const [question, setQuestion] = useState<DailyQuestion | null>(null);

  // Current state of the question section
  const [questionState, setQuestionState] = useState<QuestionState>('loading');

  // User's answer input
  const [answerText, setAnswerText] = useState<string>('');

  // Submitted answer (for display after submission)
  const [submittedAnswer, setSubmittedAnswer] = useState<string>('');

  // Loading states for actions
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSkipping, setIsSkipping] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Error message for display
  const [errorMessage, setErrorMessage] = useState<string>('');

  // ============================================
  // API CALLS
  // ============================================

  // Fetch today's question from API
  const fetchDailyQuestion = useCallback(async (showRefreshIndicator = false) => {
    try {
      if (showRefreshIndicator) {
        setIsRefreshing(true);
      } else {
        setQuestionState('loading');
      }
      setErrorMessage('');

      console.log('[OasisScreen] Fetching daily question...');
      const response = await api.get<DailyQuestionApiResponse>('/api/questions/daily');
      console.log('[OasisScreen] Daily question response:', response.data);

      if (response.data.success) {
        if (response.data.data === null) {
          // No question available - all done
          setQuestion(null);
          setQuestionState('all_done');
          console.log('[OasisScreen] All questions answered');
        } else {
          // Question available
          setQuestion(response.data.data);
          setQuestionState('unanswered');
          console.log('[OasisScreen] Question loaded:', response.data.data.question_id);
        }
      } else {
        throw new Error('Failed to fetch question');
      }
    } catch (error: any) {
      console.error('[OasisScreen] Error fetching question:', error);
      const message = error.response?.data?.error?.message
        || error.message
        || 'Unable to load question. Please check your connection.';
      setErrorMessage(message);
      setQuestionState('error');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Submit answer to API
  const submitAnswer = async () => {
    if (!question || answerText.length < MIN_CHARS || answerText.length > MAX_CHARS) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage('');

      console.log('[OasisScreen] Submitting answer for question:', question.question_id);
      const response = await api.post<AnswerApiResponse>('/api/questions/answer', {
        questionId: question.question_id,
        responseText: answerText,
      });
      console.log('[OasisScreen] Answer submitted:', response.data);

      if (response.data.success) {
        // Store the submitted answer for display
        setSubmittedAnswer(answerText);
        setAnswerText('');
        setQuestionState('answered');
        console.log('[OasisScreen] Answer saved successfully');
      } else {
        throw new Error('Failed to submit answer');
      }
    } catch (error: any) {
      console.error('[OasisScreen] Error submitting answer:', error);
      const message = error.response?.data?.error?.message
        || error.message
        || 'Failed to submit answer. Please try again.';
      setErrorMessage(message);
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Skip question API call
  const skipQuestion = async () => {
    if (!question) return;

    try {
      setIsSkipping(true);
      setErrorMessage('');

      console.log('[OasisScreen] Skipping question:', question.question_id);
      const response = await api.post('/api/questions/skip', {
        questionId: question.question_id,
      });
      console.log('[OasisScreen] Skip response:', response.data);

      if (response.data.success) {
        setQuestionState('skipped');
        console.log('[OasisScreen] Question skipped successfully');
      } else {
        throw new Error('Failed to skip question');
      }
    } catch (error: any) {
      console.error('[OasisScreen] Error skipping question:', error);
      const message = error.response?.data?.error?.message
        || error.message
        || 'Failed to skip question. Please try again.';
      setErrorMessage(message);
      Alert.alert('Error', message);
    } finally {
      setIsSkipping(false);
    }
  };

  // ============================================
  // EFFECTS
  // ============================================

  // Fetch question on component mount
  useEffect(() => {
    fetchDailyQuestion();
  }, [fetchDailyQuestion]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleDiscussWithOasis = () => {
    Alert.alert(
      'Coming Soon',
      'Chat creation coming in next prompt!',
      [{ text: 'OK' }]
    );
  };

  const handleRetry = () => {
    fetchDailyQuestion();
  };

  const onRefresh = () => {
    fetchDailyQuestion(true);
  };

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const charCount = answerText.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isUnderLimit = charCount < MIN_CHARS;
  const canSubmit = !isOverLimit && !isUnderLimit && charCount > 0 && !isSubmitting;

  // ============================================
  // RENDER HELPERS
  // ============================================

  // Loading state
  const renderLoading = () => (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>Loading today's question...</Text>
    </View>
  );

  // Error state with retry
  const renderError = () => (
    <View style={styles.centerContainer}>
      <Text style={styles.errorIcon}>!</Text>
      <Text style={styles.errorText}>{errorMessage}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  // All questions answered state
  const renderAllDone = () => (
    <View style={styles.questionCard}>
      <Text style={styles.allDoneEmoji}>🎉</Text>
      <Text style={styles.allDoneTitle}>All Caught Up!</Text>
      <Text style={styles.allDoneText}>
        You've answered all available questions! Check back tomorrow for new questions.
      </Text>
    </View>
  );

  // Question card with grayed out option
  const renderQuestionCard = (isGrayedOut: boolean) => (
    <View style={[styles.questionCard, isGrayedOut && styles.grayedOut]}>
      <Text style={styles.questionLabel}>Today's Question</Text>
      <View style={styles.questionTextContainer}>
        <Text style={[styles.questionText, isGrayedOut && styles.grayedOutText]}>
          {question?.question_text}
        </Text>
      </View>
      {question?.category && (
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{question.category}</Text>
        </View>
      )}
    </View>
  );

  // Unanswered state - show input and buttons
  const renderUnanswered = () => (
    <>
      {renderQuestionCard(false)}

      {/* Answer Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.textInput, isOverLimit && styles.textInputError]}
          placeholder="Share your thoughts..."
          placeholderTextColor="#999"
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          value={answerText}
          onChangeText={setAnswerText}
          editable={!isSubmitting && !isSkipping}
        />
        <Text style={[styles.charCounter, isOverLimit && styles.charCounterError]}>
          {charCount} / {MAX_CHARS}
        </Text>
        {isUnderLimit && charCount > 0 && (
          <Text style={styles.minCharWarning}>
            Minimum {MIN_CHARS} characters required
          </Text>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.buttonDisabled]}
          onPress={submitAnswer}
          disabled={!canSubmit}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Answer</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.skipButton, isSkipping && styles.buttonDisabled]}
          onPress={skipQuestion}
          disabled={isSubmitting || isSkipping}
        >
          {isSkipping ? (
            <ActivityIndicator size="small" color="#666" />
          ) : (
            <Text style={styles.skipButtonText}>Skip</Text>
          )}
        </TouchableOpacity>
      </View>

      {errorMessage && (
        <Text style={styles.inlineError}>{errorMessage}</Text>
      )}
    </>
  );

  // Answered state - show submitted answer
  const renderAnswered = () => (
    <>
      {renderQuestionCard(true)}

      {/* Submitted Answer Display */}
      <View style={styles.submittedAnswerContainer}>
        <Text style={styles.submittedLabel}>Your Answer</Text>
        <View style={styles.submittedAnswerBox}>
          <Text style={styles.submittedAnswerText}>{submittedAnswer}</Text>
        </View>
      </View>

      {/* Success Message */}
      <View style={styles.successContainer}>
        <Text style={styles.successText}>
          ✓ Thank you for answering today's question!
        </Text>
      </View>

      {/* Discuss Button */}
      <TouchableOpacity
        style={styles.discussButton}
        onPress={handleDiscussWithOasis}
      >
        <Text style={styles.discussButtonText}>Discuss this with Oasis?</Text>
      </TouchableOpacity>
    </>
  );

  // Skipped state
  const renderSkipped = () => (
    <>
      {renderQuestionCard(true)}

      <View style={styles.skippedContainer}>
        <Text style={styles.skippedText}>
          Question skipped. Come back tomorrow for a new question!
        </Text>
      </View>
    </>
  );

  // Main render based on state
  const renderContent = () => {
    switch (questionState) {
      case 'loading':
        return renderLoading();
      case 'error':
        return renderError();
      case 'all_done':
        return renderAllDone();
      case 'unanswered':
        return renderUnanswered();
      case 'answered':
        return renderAnswered();
      case 'skipped':
        return renderSkipped();
      default:
        return renderLoading();
    }
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Oasis</Text>
          <Text style={styles.headerSubtitle}>Daily Reflection</Text>
        </View>

        {/* Question Section */}
        <View style={styles.questionSection}>
          {renderContent()}
        </View>

        {/* Placeholder for future sections */}
        <View style={styles.placeholderSection}>
          <Text style={styles.placeholderText}>
            Chat list and memory sections coming soon...
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  questionSection: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },

  // Error styles
  errorIcon: {
    fontSize: 48,
    color: '#ff3b30',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inlineError: {
    color: '#ff3b30',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },

  // Question card styles
  questionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  grayedOut: {
    opacity: 0.6,
  },
  questionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  questionTextContainer: {
    marginBottom: 12,
  },
  questionText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#1a1a1a',
    lineHeight: 28,
  },
  grayedOutText: {
    color: '#666',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },

  // Input styles
  inputContainer: {
    marginTop: 16,
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1a1a1a',
    minHeight: 140,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlignVertical: 'top',
  },
  textInputError: {
    borderColor: '#ff3b30',
  },
  charCounter: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 8,
  },
  charCounterError: {
    color: '#ff3b30',
  },
  minCharWarning: {
    fontSize: 12,
    color: '#ff9500',
    marginTop: 4,
  },

  // Button styles
  buttonContainer: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  submitButton: {
    flex: 2,
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Submitted answer styles
  submittedAnswerContainer: {
    marginTop: 16,
  },
  submittedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  submittedAnswerBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  submittedAnswerText: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
  },

  // Success styles
  successContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  successText: {
    fontSize: 16,
    color: '#34c759',
    fontWeight: '500',
  },

  // Discuss button
  discussButton: {
    marginTop: 20,
    backgroundColor: '#e8f4ff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  discussButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Skipped styles
  skippedContainer: {
    marginTop: 20,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
  },
  skippedText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },

  // All done styles
  allDoneEmoji: {
    fontSize: 48,
    marginBottom: 16,
    textAlign: 'center',
  },
  allDoneTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 12,
  },
  allDoneText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },

  // Placeholder section
  placeholderSection: {
    marginTop: 32,
    marginHorizontal: 16,
    padding: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#ddd',
  },
  placeholderText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

export default OasisScreen;
