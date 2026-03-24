import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, NavigationProp } from '@react-navigation/native';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { cacheQuestionState, getCachedQuestionState } from '../services/questionCache';
import { formatRelativeTime } from '../utils/dateUtils';
import { DailyQuestion, QuestionState, DailyQuestionApiResponse, AnswerApiResponse } from '../types/question';
import { Chat, ChatsListApiResponse, CreateChatApiResponse } from '../types/chat';
import {
  MemoryProfile,
  MemoryProfileApiResponse,
  GroupedInsightsApiResponse,
} from '../types/memory';
import { MerciaScreenNavigationProp } from '../types/navigation';
import { MainTabParamList } from '../navigation/MainNavigator';
import { colors, spacing, typography, cardStyle, buttonStyles, inputStyles } from '../constants/theme';
import { useSubscription } from '../context/SubscriptionContext';
import { getConsent } from '../services/consentService';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Storage key for memory section collapse state
const MEMORY_COLLAPSED_KEY = 'mercia_memory_collapsed';

// Constants
const MAX_CHARS = 2100;
const MIN_CHARS = 10;
const CHATS_PER_PAGE = 10;
const CHATS_LOAD_MORE = 20;

const MerciaHomeScreen: React.FC = () => {
  // ============================================
  // NAVIGATION & AUTH
  // ============================================
  const navigation = useNavigation<MerciaScreenNavigationProp>();
  const rootNavigation = useNavigation<NavigationProp<MainTabParamList>>();
  const { user } = useAuth();
  const { isSubscribed, isLoadingSubscription } = useSubscription();
  const [hasConsent, setHasConsent] = useState<boolean>(false);
  const [isLoadingConsent, setIsLoadingConsent] = useState<boolean>(true);

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
  // MEMORY PROFILE STATE MANAGEMENT
  // ============================================
  const [memoryProfile, setMemoryProfile] = useState<MemoryProfile | null>(null);
  const [isLoadingMemory, setIsLoadingMemory] = useState<boolean>(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [isMemoryCollapsed, setIsMemoryCollapsed] = useState<boolean>(false);
  const memoryHeightAnim = useRef(new Animated.Value(1)).current;
  const [groupedInsights, setGroupedInsights] = useState<GroupedInsightsApiResponse['data'] | null>(null);

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
        console.log('[MerciaHomeScreen] Checking cache for user:', user.id);
        const cachedState = await getCachedQuestionState(user.id);

        if (cachedState) {
          console.log(`[MerciaHomeScreen] Loaded from cache: ${cachedState.state}`);
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
        console.log('[MerciaHomeScreen] No valid cache found, fetching from API...');
      }

      console.log('[MerciaHomeScreen] Fetching daily question from API...');
      const response = await api.get<DailyQuestionApiResponse>('/api/questions/daily');
      console.log('[MerciaHomeScreen] Daily question response:', response.data);

      if (response.data.success) {
        if (response.data.data === null) {
          setQuestion(null);
          setQuestionState('all_done');
          console.log('[MerciaHomeScreen] All questions answered');
        } else {
          setQuestion(response.data.data);
          setQuestionState('unanswered');
          console.log('[MerciaHomeScreen] Question loaded:', response.data.data.question_id);
        }
      } else {
        throw new Error('Failed to fetch question');
      }
    } catch (error: any) {
      console.error('[MerciaHomeScreen] Error fetching question:', error);
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

      console.log('[MerciaHomeScreen] Submitting answer for question:', question.question_id);
      const response = await api.post<AnswerApiResponse>('/api/questions/answer', {
        questionId: question.question_id,
        responseText: answerText,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      console.log('[MerciaHomeScreen] Answer submitted:', response.data);

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
          console.log('[MerciaHomeScreen] Answer cached successfully');
        }

        setSubmittedAnswer(answerText);
        setAnswerText('');
        setQuestionState('answered');
        console.log('[MerciaHomeScreen] Answer saved successfully');

        // Refresh memory profile and grouped insights to show updated data
        console.log('[MerciaHomeScreen] Refreshing memory profile after answer...');
        fetchMemoryProfile();
        fetchGroupedInsights();
      } else {
        throw new Error('Failed to submit answer');
      }
    } catch (error: any) {
      console.error('[MerciaHomeScreen] Error submitting answer:', error);
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

      console.log('[MerciaHomeScreen] Skipping question:', question.question_id);
      const response = await api.post('/api/questions/skip', {
        questionId: question.question_id,
      });
      console.log('[MerciaHomeScreen] Skip response:', response.data);

      if (response.data.success) {
        if (user?.id) {
          await cacheQuestionState(
            user.id,
            question.question_id,
            question.question_text,
            question.category,
            'skipped'
          );
          console.log('[MerciaHomeScreen] Skip cached successfully');
        }

        setQuestionState('skipped');
        console.log('[MerciaHomeScreen] Question skipped successfully');
      } else {
        throw new Error('Failed to skip question');
      }
    } catch (error: any) {
      console.error('[MerciaHomeScreen] Error skipping question:', error);
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

      console.log('[MerciaHomeScreen] Fetching chats...');
      const response = await api.get<ChatsListApiResponse>('/api/chat/list');
      console.log('[MerciaHomeScreen] Loaded', response.data.data?.length || 0, 'chats');

      if (response.data.success) {
        const allChats = response.data.data || [];
        setChats(allChats);
        // Reset pagination and show first page
        setCurrentPage(1);
        setDisplayedChats(allChats.slice(0, CHATS_PER_PAGE));
        console.log(`[MerciaHomeScreen] Showing ${Math.min(CHATS_PER_PAGE, allChats.length)} of ${allChats.length} chats`);
      } else {
        throw new Error('Failed to fetch chats');
      }
    } catch (error: any) {
      console.error('[MerciaHomeScreen] Error fetching chats:', error);
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
    console.log(`[MerciaHomeScreen] Showing ${newDisplayedChats.length} of ${chats.length} chats`);
  };

  const createNewChat = async () => {
    try {
      setIsCreatingChat(true);

      console.log('[MerciaHomeScreen] Creating new general chat...');
      const response = await api.post<CreateChatApiResponse>('/api/chat/new', {
        title: 'New Chat',
        chatType: 'general',
      });
      console.log('[MerciaHomeScreen] New chat created:', response.data);

      if (response.data.success && response.data.data) {
        const newChat = response.data.data;
        console.log(`[MerciaHomeScreen] Navigating to chat: ${newChat.id}`);
        navigation.navigate('ChatScreen', {
          chatId: newChat.id,
          chat: newChat,
        });
      } else {
        throw new Error('Failed to create chat');
      }
    } catch (error: any) {
      console.error('[MerciaHomeScreen] Error creating chat:', error);
      const message = error.response?.data?.error?.message
        || error.message
        || 'Failed to create chat. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleChatPress = (chat: Chat) => {
    console.log(`[MerciaHomeScreen] Navigating to chat: ${chat.id}`);
    navigation.navigate('ChatScreen', {
      chatId: chat.id,
      chat: chat,
    });
  };

  // ============================================
  // MEMORY PROFILE API CALLS
  // ============================================

  const fetchMemoryProfile = useCallback(async () => {
    try {
      setIsLoadingMemory(true);
      setMemoryError(null);

      console.log('[MerciaHomeScreen] Fetching memory profile...');
      const response = await api.get<MemoryProfileApiResponse>('/api/memory/profile');

      if (response.data.success && response.data.data) {
        const profile = response.data.data;
        setMemoryProfile(profile);

        const valuesCount = profile.core_values?.length || 0;
        const beliefsCount = Object.keys(profile.beliefs || {}).length;
        const interestsCount = Object.keys(profile.interests || {}).length;

        if (valuesCount === 0 && beliefsCount === 0 && interestsCount === 0) {
          console.log('[MerciaHomeScreen] Memory profile is empty');
        } else {
          console.log(`[MerciaHomeScreen] Memory profile loaded: ${valuesCount} values, ${beliefsCount} beliefs, ${interestsCount} interests`);
        }
      } else {
        console.log('[MerciaHomeScreen] Memory profile is empty');
        setMemoryProfile(null);
      }
    } catch (error: any) {
      console.error('[MerciaHomeScreen] Memory fetch error:', error);
      const message = error.response?.data?.error?.message
        || error.message
        || 'Unable to load insights.';
      setMemoryError(message);
    } finally {
      setIsLoadingMemory(false);
    }
  }, []);

  const fetchGroupedInsights = useCallback(async () => {
    try {
      const response = await api.get<GroupedInsightsApiResponse>('/api/memory/insights');
      if (response.data.success && response.data.data) {
        setGroupedInsights(response.data.data);
      }
    } catch (error) {
      console.error('[MerciaHomeScreen] Error fetching grouped insights:', error);
    }
  }, []);

  const loadMemoryCollapseState = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(MEMORY_COLLAPSED_KEY);
      if (stored !== null) {
        const collapsed = stored === 'true';
        setIsMemoryCollapsed(collapsed);
        memoryHeightAnim.setValue(collapsed ? 0 : 1);
      }
    } catch (error) {
      console.error('[MerciaHomeScreen] Error loading memory collapse state:', error);
    }
  }, [memoryHeightAnim]);

  const toggleMemoryCollapse = async () => {
    const newCollapsed = !isMemoryCollapsed;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsMemoryCollapsed(newCollapsed);

    Animated.timing(memoryHeightAnim, {
      toValue: newCollapsed ? 0 : 1,
      duration: 250,
      useNativeDriver: false,
    }).start();

    try {
      await AsyncStorage.setItem(MEMORY_COLLAPSED_KEY, newCollapsed.toString());
    } catch (error) {
      console.error('[MerciaHomeScreen] Error saving memory collapse state:', error);
    }
  };

  const handleMemoryRetry = () => {
    fetchMemoryProfile();
  };

  const handleDiscussWithMercia = async () => {
    if (!question || !submittedAnswer) {
      Alert.alert('Error', 'No question or answer to discuss');
      return;
    }

    try {
      setIsCreatingChat(true);

      const chatTitle = question.question_text.length > 50
        ? `Q: ${question.question_text.substring(0, 44)}...`
        : `Q: ${question.question_text}`;

      console.log('[MerciaHomeScreen] Creating question chat for:', question.question_id);
      const response = await api.post<CreateChatApiResponse>('/api/chat/new', {
        title: chatTitle,
        chatType: 'question',
        linkedQuestionId: question.question_id,
      });

      if (response.data.success && response.data.data) {
        const newChat = response.data.data;
        console.log(`[MerciaHomeScreen] Question chat created: ${newChat.id} (type: ${newChat.chat_type}, linked: ${newChat.linked_question_id})`);

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
      console.error('[MerciaHomeScreen] Error creating question chat:', error);
      const message = error.response?.data?.error?.message
        || error.message
        || 'Failed to create chat. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleViewMerciaMemory = () => {
    rootNavigation.navigate('Profile', {
      screen: 'MerciaMemory',
    } as any);
  };

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    fetchDailyQuestion();
    fetchChats();
    fetchMemoryProfile();
    fetchGroupedInsights();
    loadMemoryCollapseState();
  }, [fetchDailyQuestion, fetchChats, fetchMemoryProfile, fetchGroupedInsights, loadMemoryCollapseState]);

  useFocusEffect(
    useCallback(() => {
      console.log('[MerciaHomeScreen] Screen focused, refreshing chats and memory...');
      fetchChats();
      fetchMemoryProfile();
      fetchGroupedInsights();
    }, [fetchChats, fetchMemoryProfile, fetchGroupedInsights])
  );

  // Load consent state once on mount
  useEffect(() => {
    getConsent().then(value => {
      setHasConsent(value);
      setIsLoadingConsent(false);
    });
  }, []);

  // Log subscription state for debugging (navigation guards are handled in MainNavigator tabPress)
  useEffect(() => {
    console.log('[MerciaHomeScreen] subscription state — isSubscribed:', isSubscribed, '| isLoadingSubscription:', isLoadingSubscription, '| hasConsent:', hasConsent, '| isLoadingConsent:', isLoadingConsent);
  }, [isSubscribed, isLoadingSubscription, hasConsent, isLoadingConsent]);

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
      fetchMemoryProfile(),
      fetchGroupedInsights(),
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

  const renderQuestionLabel = () => (
    <View style={styles.questionLabel}>
      <View style={styles.questionDot} />
      <Text style={styles.questionLabelText}>TODAY'S QUESTION</Text>
    </View>
  );

  const renderQuestionLoading = () => (
    <View style={styles.questionCard}>
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1D9E75" />
        <Text style={styles.loadingText}>Loading today's question...</Text>
      </View>
    </View>
  );

  const renderQuestionError = () => (
    <View style={styles.questionCard}>
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>!</Text>
        <Text style={styles.errorText}>{questionError}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handleQuestionRetry}>
          <Text style={styles.primaryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAllDone = () => (
    <View style={styles.questionCard}>
      {renderQuestionLabel()}
      <View style={styles.allDoneContainer}>
        <Text style={styles.allDoneEmoji}>🎉</Text>
        <Text style={styles.allDoneTitle}>You've answered all available questions!</Text>
        <Text style={styles.allDoneText}>Check back tomorrow for new questions.</Text>
      </View>
    </View>
  );

  const renderUnanswered = () => (
    <View style={styles.questionCard}>
      {renderQuestionLabel()}
      <Text style={styles.questionText}>{question?.question_text}</Text>

      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.textInput, isOverLimit && styles.textInputError]}
          placeholder="Share your thoughts..."
          placeholderTextColor={colors.textTertiary}
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

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.primaryButton, styles.flexButton, !canSubmit && styles.buttonDisabled]}
          onPress={submitAnswer}
          disabled={!canSubmit}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Submit Answer</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, (isSubmitting || isSkipping) && styles.buttonDisabled]}
          onPress={skipQuestion}
          disabled={isSubmitting || isSkipping}
        >
          {isSkipping ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={styles.secondaryButtonText}>Skip</Text>
          )}
        </TouchableOpacity>
      </View>

      {questionError && (
        <Text style={styles.inlineError}>{questionError}</Text>
      )}
    </View>
  );

  const renderAnswered = () => (
    <View style={styles.questionCard}>
      {renderQuestionLabel()}
      <Text style={styles.questionText}>{question?.question_text}</Text>

      <View style={styles.answeredBox}>
        <Text style={styles.answeredText}>{submittedAnswer}</Text>
      </View>

      <View style={styles.successRow}>
        <Text style={styles.successText}>✓ Thank you for answering today's question!</Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, styles.fullWidthButton, isCreatingChat && styles.buttonDisabled]}
        onPress={handleDiscussWithMercia}
        disabled={isCreatingChat}
      >
        {isCreatingChat ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Discuss with Mercia</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderSkipped = () => (
    <View style={[styles.questionCard, styles.skippedCard]}>
      {renderQuestionLabel()}
      <Text style={[styles.questionText, styles.skippedQuestionText]}>{question?.question_text}</Text>
      <Text style={styles.skippedMessage}>
        Question skipped. Come back tomorrow for a new question!
      </Text>
    </View>
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

  const renderChatItem = (chat: Chat, index: number) => (
    <TouchableOpacity
      key={chat.id}
      style={[
        styles.chatItem,
        index === 0 && styles.chatItemFirst,
      ]}
      onPress={() => handleChatPress(chat)}
      activeOpacity={0.7}
    >
      {index === 0 && <View style={styles.chatActiveAccent} />}
      <View style={styles.chatItemContent}>
        <View style={styles.chatItemTextContainer}>
          <View style={styles.chatItemTitleRow}>
            {chat.pinned && <Text style={styles.pinIcon}>📌</Text>}
            <Text style={styles.chatItemTitle} numberOfLines={1}>
              {chat.title || 'Untitled Chat'}
            </Text>
          </View>
          <Text style={styles.chatItemTime}>
            {formatRelativeTime(chat.updated_at)}
          </Text>
        </View>
        <Text style={styles.chatItemChevron}>→</Text>
      </View>
    </TouchableOpacity>
  );

  const renderChatsLoading = () => (
    <View style={styles.chatsCenterContainer}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.chatsLoadingText}>Loading conversations...</Text>
    </View>
  );

  const renderChatsError = () => (
    <View style={styles.chatsCenterContainer}>
      <Text style={styles.chatsErrorText}>{chatsError}</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={handleChatsRetry}>
        <Text style={styles.primaryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const renderChatsEmpty = () => (
    <View style={styles.chatsEmptyContainer}>
      <Text style={styles.chatsEmptyIcon}>💬</Text>
      <Text style={styles.chatsEmptyTitle}>No conversations yet</Text>
      <Text style={styles.chatsEmptyText}>
        Tap '+ New Chat' or answer a question above
      </Text>
    </View>
  );

  const renderChatsList = () => (
    <>
      <View style={styles.chatsList}>
        {displayedChats.map((chat, index) => renderChatItem(chat, index))}
      </View>
      {hasMoreChats && (
        <TouchableOpacity style={styles.seeMoreButton} onPress={handleSeeMore}>
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
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressBackgroundColor="transparent"
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Question Section */}
        {renderQuestionContent()}

        {/* Conversations Section */}
        <View style={[styles.sectionCard, styles.conversationsCard]}>
          <View style={styles.conversationsHeader}>
            <View style={styles.conversationsHeaderLeft}>
              <View style={styles.conversationsAccent} />
              <Text style={styles.conversationsTitle}>CONVERSATIONS</Text>
            </View>
            <TouchableOpacity
              onPress={createNewChat}
              disabled={isCreatingChat}
              style={[styles.newChatButton, isCreatingChat && styles.buttonDisabled]}
            >
              {isCreatingChat ? (
                <ActivityIndicator size="small" color="#5DCAA5" />
              ) : (
                <Text style={styles.newChatButtonText}>+ New Chat</Text>
              )}
            </TouchableOpacity>
          </View>
          {renderChatsContent()}
        </View>

        {/* Memory Profile Card */}
        <TouchableOpacity
          style={styles.memoryCard}
          onPress={handleViewMerciaMemory}
          activeOpacity={0.7}
        >
          <View style={styles.memoryIconContainer}>
            <Text style={styles.memoryIconText}>🧠</Text>
          </View>
          <View style={styles.memoryContent}>
            <Text style={styles.memoryTitle}>Memory profile</Text>
            <Text style={styles.memorySubtitle}>
              {memoryProfile
                ? `${memoryProfile.core_values?.length || 0} values • ${Object.keys(memoryProfile.beliefs || {}).length} beliefs • ${Object.keys(memoryProfile.interests || {}).length} interests`
                : 'Building your profile...'
              }
            </Text>
          </View>
          <Text style={styles.memoryArrow}>→</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  // Container styles
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
  },

  // Card base style
  sectionCard: {
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#232323',
  },
  conversationsCard: {
    borderTopWidth: 3,
    borderTopColor: '#1D9E75',
  },

  // Question card
  questionCard: {
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 24,
    borderTopWidth: 3,
    borderTopColor: '#1D9E75',
    marginTop: 8,
    marginBottom: 24,
  },

  // Question label (dot + text)
  questionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  questionDot: {
    width: 4,
    height: 4,
    backgroundColor: '#1D9E75',
    borderRadius: 2,
  },
  questionLabelText: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    color: '#777',
    fontWeight: '500',
  },

  // Keep sectionLabel for any remaining uses
  sectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    color: '#777',
    fontWeight: '500',
    marginBottom: 12,
  },

  // Question text
  questionText: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 20,
    lineHeight: 28,
    marginBottom: 24,
    fontWeight: '400',
    color: '#E8E8E8',
  },

  // Center container for loading/error states
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#888',
  },
  errorIcon: {
    fontSize: 48,
    color: colors.error,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    marginBottom: 16,
  },

  // Input styles
  inputContainer: {
    marginBottom: 16,
  },
  textInput: {
    ...inputStyles.container,
    ...inputStyles.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  textInputError: {
    borderColor: colors.error,
  },
  charCounter: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 4,
  },
  charCounterError: {
    color: colors.error,
  },
  minCharWarning: {
    fontSize: 12,
    color: colors.warning,
    marginTop: 4,
  },
  inlineError: {
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    marginTop: 12,
  },

  // Button styles
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#1D9E75',
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1D9E75',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  secondaryButton: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '400',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  flexButton: {
    flex: 1,
  },
  fullWidthButton: {
    width: '100%',
  },

  // Answered state styles
  answeredBox: {
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  answeredText: {
    fontSize: 15,
    color: '#888',
    lineHeight: 22,
  },
  successRow: {
    marginBottom: 12,
  },
  successText: {
    fontSize: 13,
    color: '#1D9E75',
    fontWeight: '500',
  },

  // Skipped state styles
  skippedCard: {
    opacity: 0.6,
  },
  skippedLabel: {
    color: '#666',
  },
  skippedQuestionText: {
    color: '#888',
  },
  skippedMessage: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
  },

  // All done state
  allDoneContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  allDoneEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  allDoneTitle: {
    fontSize: 15,
    color: '#E8E8E8',
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '500',
  },
  allDoneText: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },

  // Conversations section header
  conversationsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  conversationsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conversationsAccent: {
    width: 4,
    height: 4,
    backgroundColor: '#1D9E75',
    borderRadius: 2,
  },
  conversationsTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    color: '#777',
    fontWeight: '500',
  },
  newChatButton: {
    backgroundColor: 'rgba(29, 158, 117, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(29, 158, 117, 0.3)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  newChatButtonText: {
    fontSize: 12,
    color: '#5DCAA5',
    fontWeight: '500',
  },

  // Chat list styles
  chatsCenterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  chatsLoadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#888',
  },
  chatsErrorText: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginBottom: 12,
  },
  chatsEmptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  chatsEmptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  chatsEmptyTitle: {
    fontSize: 15,
    color: '#E8E8E8',
    fontWeight: '500',
    marginBottom: 8,
  },
  chatsEmptyText: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  chatsList: {
    marginTop: 4,
    gap: 8,
  },
  chatItem: {
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#232323',
    position: 'relative',
    overflow: 'hidden',
  },
  chatItemFirst: {
    borderColor: '#2A2A2A',
  },
  chatActiveAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#1D9E75',
  },
  chatItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 10,
  },
  chatItemTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  chatItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  pinIcon: {
    fontSize: 14,
  },
  chatItemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E8E8E8',
    flex: 1,
  },
  chatItemTime: {
    fontSize: 11,
    color: '#666',
    backgroundColor: '#1F1F1F',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  chatItemChevron: {
    fontSize: 16,
    color: '#666',
  },
  seeMoreButton: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 20,
    alignSelf: 'center',
  },
  seeMoreButtonText: {
    color: '#5DCAA5',
    fontSize: 14,
    fontWeight: '500',
  },

  // Memory profile card
  memoryCard: {
    backgroundColor: 'rgba(29, 158, 117, 0.08)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(29, 158, 117, 0.25)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  memoryIconContainer: {
    backgroundColor: 'rgba(29, 158, 117, 0.15)',
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memoryIconText: {
    fontSize: 18,
  },
  memoryContent: {
    flex: 1,
  },
  memoryTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#B3E5D6',
    marginBottom: 2,
  },
  memorySubtitle: {
    fontSize: 12,
    color: '#888',
  },
  memoryArrow: {
    fontSize: 16,
    color: '#5DCAA5',
    marginLeft: 8,
  },
});

export default MerciaHomeScreen;
