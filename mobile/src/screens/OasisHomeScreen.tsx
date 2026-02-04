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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { cacheQuestionState, getCachedQuestionState } from '../services/questionCache';
import { formatRelativeTime } from '../utils/dateUtils';
import { DailyQuestion, QuestionState, DailyQuestionApiResponse, AnswerApiResponse } from '../types/question';
import { Chat, ChatsListApiResponse, CreateChatApiResponse } from '../types/chat';
import { OasisScreenNavigationProp } from '../types/navigation';

// Constants
const MAX_CHARS = 2100;
const MIN_CHARS = 10;
const CHATS_PER_PAGE = 10;
const CHATS_LOAD_MORE = 20;

const OasisHomeScreen: React.FC = () => {
  // ============================================
  // NAVIGATION & AUTH
  // ============================================
  const navigation = useNavigation<OasisScreenNavigationProp>();
  const { user } = useAuth();

  // ============================================
  // QUESTION STATE MANAGEMENT
  // ============================================
  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [questionState, setQuestionState] = useState<QuestionState>('loading');
  const [answerText, setAnswerText] = useState<string>('');
  const [submittedAnswer, setSubmittedAnswer] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSkipping, setIsSkipping] = useState<boolean>(false);
  const [questionError, setQuestionError] = useState<string>('');

  // ============================================
  // CHAT LIST STATE MANAGEMENT
  // ============================================
  const [chats, setChats] = useState<Chat[]>([]);
  const [displayedChats, setDisplayedChats] = useState<Chat[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState<boolean>(false);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isCreatingChat, setIsCreatingChat] = useState<boolean>(false);

  // ============================================
  // SHARED STATE
  // ============================================
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // ============================================
  // QUESTION API CALLS
  // ============================================

  const fetchDailyQuestion = useCallback(async (showRefreshIndicator = false) => {
    try {
      if (!showRefreshIndicator) {
        setQuestionState('loading');
      }
      setQuestionError('');

      if (user?.id) {
        console.log('[OasisHomeScreen] Checking cache for user:', user.id);
        const cachedState = await getCachedQuestionState(user.id);

        if (cachedState) {
          console.log(`[OasisHomeScreen] Loaded from cache: ${cachedState.state}`);
          setQuestion({
            question_id: cachedState.questionId,
            question_text: cachedState.questionText,
            category: cachedState.category,
            assigned_date: cachedState.date,
            skip_count: 0,
          });

          if (cachedState.state === 'answered') {
            setSubmittedAnswer(cachedState.userAnswer || '');
            setQuestionState('answered');
          } else {
            setQuestionState('skipped');
          }
          return;
        }
        console.log('[OasisHomeScreen] No valid cache found, fetching from API...');
      }

      console.log('[OasisHomeScreen] Fetching daily question from API...');
      const response = await api.get<DailyQuestionApiResponse>('/api/questions/daily');
      console.log('[OasisHomeScreen] Daily question response:', response.data);

      if (response.data.success) {
        if (response.data.data === null) {
          setQuestion(null);
          setQuestionState('all_done');
          console.log('[OasisHomeScreen] All questions answered');
        } else {
          setQuestion(response.data.data);
          setQuestionState('unanswered');
          console.log('[OasisHomeScreen] Question loaded:', response.data.data.question_id);
        }
      } else {
        throw new Error('Failed to fetch question');
      }
    } catch (error: any) {
      console.error('[OasisHomeScreen] Error fetching question:', error);
      const message = error.response?.data?.error?.message
        || error.message
        || 'Unable to load question. Please check your connection.';
      setQuestionError(message);
      setQuestionState('error');
    }
  }, [user?.id]);

  const submitAnswer = async () => {
    if (!question || answerText.length < MIN_CHARS || answerText.length > MAX_CHARS) {
      return;
    }

    try {
      setIsSubmitting(true);
      setQuestionError('');

      console.log('[OasisHomeScreen] Submitting answer for question:', question.question_id);
      const response = await api.post<AnswerApiResponse>('/api/questions/answer', {
        questionId: question.question_id,
        responseText: answerText,
      });
      console.log('[OasisHomeScreen] Answer submitted:', response.data);

      if (response.data.success) {
        if (user?.id) {
          await cacheQuestionState(
            user.id,
            question.question_id,
            question.question_text,
            question.category,
            'answered',
            answerText
          );
          console.log('[OasisHomeScreen] Answer cached successfully');
        }

        setSubmittedAnswer(answerText);
        setAnswerText('');
        setQuestionState('answered');
        console.log('[OasisHomeScreen] Answer saved successfully');
      } else {
        throw new Error('Failed to submit answer');
      }
    } catch (error: any) {
      console.error('[OasisHomeScreen] Error submitting answer:', error);
      const message = error.response?.data?.error?.message
        || error.message
        || 'Failed to submit answer. Please try again.';
      setQuestionError(message);
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const skipQuestion = async () => {
    if (!question) return;

    try {
      setIsSkipping(true);
      setQuestionError('');

      console.log('[OasisHomeScreen] Skipping question:', question.question_id);
      const response = await api.post('/api/questions/skip', {
        questionId: question.question_id,
      });
      console.log('[OasisHomeScreen] Skip response:', response.data);

      if (response.data.success) {
        if (user?.id) {
          await cacheQuestionState(
            user.id,
            question.question_id,
            question.question_text,
            question.category,
            'skipped'
          );
          console.log('[OasisHomeScreen] Skip cached successfully');
        }

        setQuestionState('skipped');
        console.log('[OasisHomeScreen] Question skipped successfully');
      } else {
        throw new Error('Failed to skip question');
      }
    } catch (error: any) {
      console.error('[OasisHomeScreen] Error skipping question:', error);
      const message = error.response?.data?.error?.message
        || error.message
        || 'Failed to skip question. Please try again.';
      setQuestionError(message);
      Alert.alert('Error', message);
    } finally {
      setIsSkipping(false);
    }
  };

  // ============================================
  // CHAT LIST API CALLS
  // ============================================

  const fetchChats = useCallback(async () => {
    try {
      setIsLoadingChats(true);
      setChatsError(null);

      console.log('[OasisHomeScreen] Fetching chats...');
      const response = await api.get<ChatsListApiResponse>('/api/chat/list');
      console.log('[OasisHomeScreen] Loaded', response.data.data?.length || 0, 'chats');

      if (response.data.success) {
        const allChats = response.data.data || [];
        setChats(allChats);
        // Reset pagination and show first page
        setCurrentPage(1);
        setDisplayedChats(allChats.slice(0, CHATS_PER_PAGE));
        console.log(`[OasisHomeScreen] Showing ${Math.min(CHATS_PER_PAGE, allChats.length)} of ${allChats.length} chats`);
      } else {
        throw new Error('Failed to fetch chats');
      }
    } catch (error: any) {
      console.error('[OasisHomeScreen] Error fetching chats:', error);
      const message = error.response?.data?.error?.message
        || error.message
        || 'Unable to load conversations. Please try again.';
      setChatsError(message);
    } finally {
      setIsLoadingChats(false);
    }
  }, []);

  const handleSeeMore = () => {
    const nextPage = currentPage + 1;
    const endIndex = CHATS_PER_PAGE + (nextPage - 1) * CHATS_LOAD_MORE;
    const newDisplayedChats = chats.slice(0, endIndex);
    setDisplayedChats(newDisplayedChats);
    setCurrentPage(nextPage);
    console.log(`[OasisHomeScreen] Showing ${newDisplayedChats.length} of ${chats.length} chats`);
  };

  const createNewChat = async () => {
    try {
      setIsCreatingChat(true);

      console.log('[OasisHomeScreen] Creating new general chat...');
      const response = await api.post<CreateChatApiResponse>('/api/chat/new', {
        title: 'New Chat',
        chatType: 'general', // Explicitly mark as general chat
      });
      console.log('[OasisHomeScreen] New chat created:', response.data);

      if (response.data.success && response.data.data) {
        const newChat = response.data.data;
        console.log(`[OasisHomeScreen] Navigating to chat: ${newChat.id}`);
        navigation.navigate('ChatScreen', {
          chatId: newChat.id,
          chat: newChat,
        });
        // Refresh chat list after navigation (will happen on focus)
      } else {
        throw new Error('Failed to create chat');
      }
    } catch (error: any) {
      console.error('[OasisHomeScreen] Error creating chat:', error);
      const message = error.response?.data?.error?.message
        || error.message
        || 'Failed to create chat. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleChatPress = (chat: Chat) => {
    console.log(`[OasisHomeScreen] Navigating to chat: ${chat.id}`);
    navigation.navigate('ChatScreen', {
      chatId: chat.id,
      chat: chat,
    });
  };

  const handleDiscussWithOasis = async () => {
    // Create a new chat to discuss the answered question
    if (!question || !submittedAnswer) {
      Alert.alert('Error', 'No question or answer to discuss');
      return;
    }

    try {
      setIsCreatingChat(true);

      // Create chat with title based on question
      const chatTitle = question.question_text.length > 50
        ? `Q: ${question.question_text.substring(0, 44)}...`
        : `Q: ${question.question_text}`;

      console.log('[OasisHomeScreen] Creating question chat for:', question.question_id);
      const response = await api.post<CreateChatApiResponse>('/api/chat/new', {
        title: chatTitle,
        chatType: 'question',                    // Mark as question-based chat
        linkedQuestionId: question.question_id,  // Link to source question
      });

      if (response.data.success && response.data.data) {
        const newChat = response.data.data;
        console.log(`[OasisHomeScreen] Question chat created: ${newChat.id} (type: ${newChat.chat_type}, linked: ${newChat.linked_question_id})`);

        // Navigate with question context - this will auto-trigger AI response
        navigation.navigate('ChatScreen', {
          chatId: newChat.id,
          chat: newChat,
          isFromQuestion: true,
          questionContext: {
            questionId: question.question_id,
            questionText: question.question_text,
            userAnswer: submittedAnswer,
          },
        });
      } else {
        throw new Error('Failed to create chat');
      }
    } catch (error: any) {
      console.error('[OasisHomeScreen] Error creating question chat:', error);
      const message = error.response?.data?.error?.message
        || error.message
        || 'Failed to create chat. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setIsCreatingChat(false);
    }
  };

  // ============================================
  // EFFECTS
  // ============================================

  // Initial load
  useEffect(() => {
    fetchDailyQuestion();
    fetchChats();
  }, [fetchDailyQuestion, fetchChats]);

  // Refresh chats when screen comes into focus (returning from ChatScreen)
  useFocusEffect(
    useCallback(() => {
      console.log('[OasisHomeScreen] Screen focused, refreshing chats...');
      fetchChats();
    }, [fetchChats])
  );

  // ============================================
  // HANDLERS
  // ============================================

  const handleQuestionRetry = () => {
    fetchDailyQuestion();
  };

  const handleChatsRetry = () => {
    fetchChats();
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchDailyQuestion(true),
      fetchChats(),
    ]);
    setIsRefreshing(false);
  };

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const charCount = answerText.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isUnderLimit = charCount < MIN_CHARS;
  const canSubmit = !isOverLimit && !isUnderLimit && charCount > 0 && !isSubmitting;
  const remainingChats = chats.length - displayedChats.length;
  const hasMoreChats = remainingChats > 0;

  // ============================================
  // QUESTION RENDER HELPERS
  // ============================================

  const renderQuestionLoading = () => (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>Loading today's question...</Text>
    </View>
  );

  const renderQuestionError = () => (
    <View style={styles.centerContainer}>
      <Text style={styles.errorIcon}>!</Text>
      <Text style={styles.errorText}>{questionError}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={handleQuestionRetry}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const renderAllDone = () => (
    <View style={styles.questionCard}>
      <Text style={styles.allDoneEmoji}>🎉</Text>
      <Text style={styles.allDoneTitle}>All Caught Up!</Text>
      <Text style={styles.allDoneText}>
        You've answered all available questions! Check back tomorrow for new questions.
      </Text>
    </View>
  );

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

  const renderUnanswered = () => (
    <>
      {renderQuestionCard(false)}
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
      {questionError && (
        <Text style={styles.inlineError}>{questionError}</Text>
      )}
    </>
  );

  const renderAnswered = () => (
    <>
      {renderQuestionCard(true)}
      <View style={styles.submittedAnswerContainer}>
        <Text style={styles.submittedLabel}>Your Answer</Text>
        <View style={styles.submittedAnswerBox}>
          <Text style={styles.submittedAnswerText}>{submittedAnswer}</Text>
        </View>
      </View>
      <View style={styles.successContainer}>
        <Text style={styles.successText}>
          ✓ Thank you for answering today's question!
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.discussButton, isCreatingChat && styles.buttonDisabled]}
        onPress={handleDiscussWithOasis}
        disabled={isCreatingChat}
      >
        {isCreatingChat ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <Text style={styles.discussButtonText}>Discuss this with Oasis?</Text>
        )}
      </TouchableOpacity>
    </>
  );

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

  const renderQuestionContent = () => {
    switch (questionState) {
      case 'loading':
        return renderQuestionLoading();
      case 'error':
        return renderQuestionError();
      case 'all_done':
        return renderAllDone();
      case 'unanswered':
        return renderUnanswered();
      case 'answered':
        return renderAnswered();
      case 'skipped':
        return renderSkipped();
      default:
        return renderQuestionLoading();
    }
  };

  // ============================================
  // CHAT LIST RENDER HELPERS
  // ============================================

  const renderChatItem = (chat: Chat) => (
    <TouchableOpacity
      key={chat.id}
      style={styles.chatItem}
      onPress={() => handleChatPress(chat)}
      activeOpacity={0.7}
    >
      <View style={styles.chatItemContent}>
        <Text style={styles.chatItemIcon}>💬</Text>
        <View style={styles.chatItemText}>
          <Text style={styles.chatItemTitle} numberOfLines={1}>
            {chat.title || 'Untitled Chat'}
          </Text>
          <Text style={styles.chatItemTime}>
            {formatRelativeTime(chat.updated_at)}
          </Text>
        </View>
        <Text style={styles.chatItemArrow}>›</Text>
      </View>
    </TouchableOpacity>
  );

  const renderChatsLoading = () => (
    <View style={styles.chatsCenterContainer}>
      <ActivityIndicator size="small" color="#007AFF" />
      <Text style={styles.chatsLoadingText}>Loading conversations...</Text>
    </View>
  );

  const renderChatsError = () => (
    <View style={styles.chatsCenterContainer}>
      <Text style={styles.chatsErrorText}>{chatsError}</Text>
      <TouchableOpacity style={styles.chatsRetryButton} onPress={handleChatsRetry}>
        <Text style={styles.chatsRetryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const renderChatsEmpty = () => (
    <View style={styles.chatsEmptyContainer}>
      <Text style={styles.chatsEmptyIcon}>💬</Text>
      <Text style={styles.chatsEmptyTitle}>No conversations yet</Text>
      <Text style={styles.chatsEmptyText}>
        Tap "+ New Chat" to start talking with Oasis,{'\n'}or answer today's question above!
      </Text>
    </View>
  );

  const renderChatsList = () => (
    <>
      <View style={styles.chatsList}>
        {displayedChats.map(renderChatItem)}
      </View>
      {hasMoreChats && (
        <TouchableOpacity
          style={styles.seeMoreButton}
          onPress={handleSeeMore}
        >
          <Text style={styles.seeMoreButtonText}>
            See More ({remainingChats} remaining)
          </Text>
        </TouchableOpacity>
      )}
    </>
  );

  const renderChatsContent = () => {
    if (isLoadingChats && chats.length === 0) {
      return renderChatsLoading();
    }
    if (chatsError && chats.length === 0) {
      return renderChatsError();
    }
    if (chats.length === 0) {
      return renderChatsEmpty();
    }
    return renderChatsList();
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
          {renderQuestionContent()}
        </View>

        {/* Chat List Section */}
        <View style={styles.chatsSection}>
          <View style={styles.chatsSectionHeader}>
            <Text style={styles.chatsSectionTitle}>Conversations</Text>
            <TouchableOpacity
              style={[styles.newChatButton, isCreatingChat && styles.buttonDisabled]}
              onPress={createNewChat}
              disabled={isCreatingChat}
            >
              {isCreatingChat ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <Text style={styles.newChatButtonText}>+ New Chat</Text>
              )}
            </TouchableOpacity>
          </View>
          {renderChatsContent()}
        </View>

        {/* Placeholder for Memory Section */}
        <View style={styles.placeholderSection}>
          <Text style={styles.placeholderText}>
            Memory section coming soon...
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

  // Question Section
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
  successContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  successText: {
    fontSize: 16,
    color: '#34c759',
    fontWeight: '500',
  },
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

  // Chat List Section
  chatsSection: {
    marginTop: 32,
    paddingHorizontal: 16,
  },
  chatsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chatsSectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  newChatButton: {
    backgroundColor: '#e8f4ff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  newChatButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  chatsCenterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  chatsLoadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
  },
  chatsErrorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  chatsRetryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 6,
  },
  chatsRetryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  chatsEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  chatsEmptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  chatsEmptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  chatsEmptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  chatsList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  chatItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  chatItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  chatItemIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  chatItemText: {
    flex: 1,
  },
  chatItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  chatItemTime: {
    fontSize: 13,
    color: '#999',
  },
  chatItemArrow: {
    fontSize: 20,
    color: '#ccc',
    marginLeft: 8,
  },
  seeMoreButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  seeMoreButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },

  // Placeholder Section
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

export default OasisHomeScreen;
