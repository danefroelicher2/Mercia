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
import { OasisScreenNavigationProp } from '../types/navigation';
import { MainTabParamList } from '../navigation/MainNavigator';
import { colors, spacing, typography, cardStyle, buttonStyles, inputStyles } from '../constants/theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Storage key for memory section collapse state
const MEMORY_COLLAPSED_KEY = 'oasis_memory_collapsed';

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
  const rootNavigation = useNavigation<NavigationProp<MainTabParamList>>();
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
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

        // Refresh memory profile and grouped insights to show updated data
        console.log('[OasisHomeScreen] Refreshing memory profile after answer...');
        fetchMemoryProfile();
        fetchGroupedInsights();
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
        chatType: 'general',
      });
      console.log('[OasisHomeScreen] New chat created:', response.data);

      if (response.data.success && response.data.data) {
        const newChat = response.data.data;
        console.log(`[OasisHomeScreen] Navigating to chat: ${newChat.id}`);
        navigation.navigate('ChatScreen', {
          chatId: newChat.id,
          chat: newChat,
        });
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

  // ============================================
  // MEMORY PROFILE API CALLS
  // ============================================

  const fetchMemoryProfile = useCallback(async () => {
    try {
      setIsLoadingMemory(true);
      setMemoryError(null);

      console.log('[OasisHomeScreen] Fetching memory profile...');
      const response = await api.get<MemoryProfileApiResponse>('/api/memory/profile');

      if (response.data.success && response.data.data) {
        const profile = response.data.data;
        setMemoryProfile(profile);

        const valuesCount = profile.core_values?.length || 0;
        const beliefsCount = Object.keys(profile.beliefs || {}).length;
        const interestsCount = Object.keys(profile.interests || {}).length;

        if (valuesCount === 0 && beliefsCount === 0 && interestsCount === 0) {
          console.log('[OasisHomeScreen] Memory profile is empty');
        } else {
          console.log(`[OasisHomeScreen] Memory profile loaded: ${valuesCount} values, ${beliefsCount} beliefs, ${interestsCount} interests`);
        }
      } else {
        console.log('[OasisHomeScreen] Memory profile is empty');
        setMemoryProfile(null);
      }
    } catch (error: any) {
      console.error('[OasisHomeScreen] Memory fetch error:', error);
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
      console.error('[OasisHomeScreen] Error fetching grouped insights:', error);
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
      console.error('[OasisHomeScreen] Error loading memory collapse state:', error);
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
      console.error('[OasisHomeScreen] Error saving memory collapse state:', error);
    }
  };

  const handleMemoryRetry = () => {
    fetchMemoryProfile();
  };

  const handleDiscussWithOasis = async () => {
    if (!question || !submittedAnswer) {
      Alert.alert('Error', 'No question or answer to discuss');
      return;
    }

    try {
      setIsCreatingChat(true);

      const chatTitle = question.question_text.length > 50
        ? `Q: ${question.question_text.substring(0, 44)}...`
        : `Q: ${question.question_text}`;

      console.log('[OasisHomeScreen] Creating question chat for:', question.question_id);
      const response = await api.post<CreateChatApiResponse>('/api/chat/new', {
        title: chatTitle,
        chatType: 'question',
        linkedQuestionId: question.question_id,
      });

      if (response.data.success && response.data.data) {
        const newChat = response.data.data;
        console.log(`[OasisHomeScreen] Question chat created: ${newChat.id} (type: ${newChat.chat_type}, linked: ${newChat.linked_question_id})`);

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

  const handleViewOasisMemory = () => {
    rootNavigation.navigate('Profile', {
      screen: 'OasisMemory',
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
      console.log('[OasisHomeScreen] Screen focused, refreshing chats and memory...');
      fetchChats();
      fetchMemoryProfile();
      fetchGroupedInsights();
    }, [fetchChats, fetchMemoryProfile, fetchGroupedInsights])
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

  const renderQuestionLoading = () => (
    <View style={styles.questionCard}>
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
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
      <Text style={styles.sectionLabel}>TODAY'S QUESTION</Text>
      <View style={styles.allDoneContainer}>
        <Text style={styles.allDoneEmoji}>🎉</Text>
        <Text style={styles.allDoneTitle}>You've answered all available questions!</Text>
        <Text style={styles.allDoneText}>Check back tomorrow for new questions.</Text>
      </View>
    </View>
  );

  const renderUnanswered = () => (
    <View style={styles.questionCard}>
      <Text style={styles.sectionLabel}>TODAY'S QUESTION</Text>
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
      <Text style={styles.sectionLabel}>TODAY'S QUESTION</Text>
      <Text style={styles.questionText}>{question?.question_text}</Text>

      <View style={styles.answeredBox}>
        <Text style={styles.answeredText}>{submittedAnswer}</Text>
      </View>

      <View style={styles.successRow}>
        <Text style={styles.successText}>✓ Thank you for answering today's question!</Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, styles.fullWidthButton, isCreatingChat && styles.buttonDisabled]}
        onPress={handleDiscussWithOasis}
        disabled={isCreatingChat}
      >
        {isCreatingChat ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Discuss with Oasis</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderSkipped = () => (
    <View style={[styles.questionCard, styles.skippedCard]}>
      <Text style={[styles.sectionLabel, styles.skippedLabel]}>TODAY'S QUESTION</Text>
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
        index === displayedChats.length - 1 && styles.chatItemLast,
      ]}
      onPress={() => handleChatPress(chat)}
      activeOpacity={0.7}
    >
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
  // MEMORY PROFILE RENDER HELPERS
  // ============================================

  const renderMemoryLoading = () => (
    <View style={styles.memoryCenterContainer}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.memoryLoadingText}>Loading insights...</Text>
    </View>
  );

  const renderMemoryError = () => (
    <View style={styles.memoryCenterContainer}>
      <Text style={styles.memoryErrorText}>{memoryError}</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={handleMemoryRetry}>
        <Text style={styles.primaryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const renderMemoryEmpty = () => (
    <View style={styles.memoryEmptyContainer}>
      <Text style={styles.memoryEmptyIcon}>🧠</Text>
      <Text style={styles.memoryEmptyTitle}>No insights yet</Text>
      <Text style={styles.memoryEmptyText}>
        Answer questions above to help Oasis learn about you!
      </Text>
    </View>
  );

  const renderMemoryData = () => {
    const questions = groupedInsights?.from_questions ?? [];
    const conversations = groupedInsights?.from_conversations ?? [];
    const combined = [...questions, ...conversations]
      .sort((a, b) => b.semantic_importance - a.semantic_importance)
      .slice(0, 10);

    if (combined.length === 0) {
      return (
        <Text style={styles.memoryEmptyText}>
          Answer questions above to help Oasis learn about you.
        </Text>
      );
    }

    return (
      <View>
        {combined.map((item, idx) => (
          <Text key={item.id ?? idx} style={styles.memoryBulletItem}>
            {'\u2022'} {item.content}
          </Text>
        ))}
        <TouchableOpacity onPress={handleViewOasisMemory} style={styles.viewMemoryLink}>
          <Text style={styles.viewMemoryLinkText}>View Oasis Memory</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderMemoryContent = () => {
    if (isLoadingMemory && !memoryProfile && !groupedInsights) {
      return renderMemoryLoading();
    }
    if (memoryError && !memoryProfile && !groupedInsights) {
      return renderMemoryError();
    }
    // Always show dual-source layout once we have profile or insights data.
    // Empty states for each pool are rendered inside renderMemoryData.
    if (memoryProfile || groupedInsights) {
      return renderMemoryData();
    }
    return renderMemoryEmpty();
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
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>CONVERSATIONS</Text>
            <TouchableOpacity
              onPress={createNewChat}
              disabled={isCreatingChat}
              style={isCreatingChat ? styles.buttonDisabled : undefined}
            >
              {isCreatingChat ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.newChatText}>+ New Chat</Text>
              )}
            </TouchableOpacity>
          </View>
          {renderChatsContent()}
        </View>

        {/* Memory Section */}
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.memorySectionHeader}
            onPress={toggleMemoryCollapse}
            activeOpacity={0.8}
          >
            <View style={styles.memorySectionHeaderLeft}>
              <Text style={styles.memorySectionIcon}>🧠</Text>
              <Text style={styles.sectionLabel}>WHAT OASIS KNOWS ABOUT YOU</Text>
            </View>
            <Text style={styles.memorySectionArrow}>
              {isMemoryCollapsed ? '▶' : '▼'}
            </Text>
          </TouchableOpacity>
          {!isMemoryCollapsed && (
            <View style={styles.memoryContentContainer}>
              {renderMemoryContent()}
            </View>
          )}
        </View>
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
    backgroundColor: colors.screenBg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.screenPadding,
    gap: spacing.sectionGap,
  },

  // Card base style
  sectionCard: {
    ...cardStyle,
    padding: spacing.cardPadding,
  },

  // Question card
  questionCard: {
    ...cardStyle,
    padding: spacing.cardPadding,
  },

  // Section labels
  sectionLabel: {
    ...typography.sectionTitle,
    marginBottom: spacing.elementGap,
  },

  // Section header (for conversations)
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.elementGap,
  },

  // Question text
  questionText: {
    ...typography.questionText,
    marginBottom: spacing.sectionGap,
  },

  // Center container for loading/error states
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: spacing.elementGap,
    ...typography.bodyText,
    color: colors.textSecondary,
  },
  errorIcon: {
    fontSize: 48,
    color: colors.error,
    fontWeight: 'bold',
    marginBottom: spacing.elementGap,
  },
  errorText: {
    ...typography.bodyText,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sectionGap,
  },

  // Input styles
  inputContainer: {
    marginBottom: spacing.sectionGap,
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
    ...typography.timestamp,
    textAlign: 'right',
    marginTop: spacing.smallGap,
  },
  charCounterError: {
    color: colors.error,
  },
  minCharWarning: {
    ...typography.timestamp,
    color: colors.warning,
    marginTop: 4,
  },
  inlineError: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.elementGap,
  },

  // Button styles
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.elementGap,
  },
  primaryButton: {
    ...buttonStyles.primary,
  },
  primaryButtonText: {
    ...buttonStyles.primaryText,
  },
  secondaryButton: {
    ...buttonStyles.secondary,
  },
  secondaryButtonText: {
    ...buttonStyles.secondaryText,
  },
  buttonDisabled: {
    ...buttonStyles.disabled,
  },
  flexButton: {
    flex: 1,
  },
  fullWidthButton: {
    width: '100%',
  },

  // Answered state styles
  answeredBox: {
    backgroundColor: colors.inputBg,
    opacity: 0.8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.elementGap,
    marginBottom: spacing.elementGap,
  },
  answeredText: {
    ...typography.bodyText,
    color: colors.textSecondary,
  },
  successRow: {
    marginBottom: spacing.elementGap,
  },
  successText: {
    ...typography.caption,
    color: colors.success,
    fontWeight: '500',
  },

  // Skipped state styles
  skippedCard: {
    opacity: 0.6,
  },
  skippedLabel: {
    color: colors.textTertiary,
  },
  skippedQuestionText: {
    color: colors.textSecondary,
  },
  skippedMessage: {
    ...typography.bodyText,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // All done state
  allDoneContainer: {
    alignItems: 'center',
    paddingVertical: spacing.sectionGap,
  },
  allDoneEmoji: {
    fontSize: 48,
    marginBottom: spacing.sectionGap,
  },
  allDoneTitle: {
    ...typography.bodyText,
    textAlign: 'center',
    marginBottom: spacing.smallGap,
  },
  allDoneText: {
    ...typography.caption,
    textAlign: 'center',
  },

  // New chat button text
  newChatText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },

  // Chat list styles
  chatsCenterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  chatsLoadingText: {
    marginTop: spacing.smallGap,
    ...typography.caption,
  },
  chatsErrorText: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.elementGap,
  },
  chatsEmptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  chatsEmptyIcon: {
    fontSize: 40,
    marginBottom: spacing.elementGap,
  },
  chatsEmptyTitle: {
    ...typography.bodyText,
    marginBottom: spacing.smallGap,
  },
  chatsEmptyText: {
    ...typography.caption,
    textAlign: 'center',
  },
  chatsList: {
    marginTop: spacing.smallGap,
  },
  chatItem: {
    paddingVertical: spacing.elementGap,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  chatItemLast: {
    borderBottomWidth: 0,
  },
  chatItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatItemTextContainer: {
    flex: 1,
    marginRight: spacing.elementGap,
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
    color: colors.textPrimary,
    flex: 1,
  },
  chatItemTime: {
    ...typography.timestamp,
  },
  chatItemChevron: {
    fontSize: 16,
    color: colors.textTertiary,
  },
  seeMoreButton: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: spacing.elementGap,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    alignSelf: 'center',
  },
  seeMoreButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },

  // Memory section styles
  memorySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memorySectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memorySectionIcon: {
    fontSize: 18,
    marginRight: spacing.smallGap,
  },
  memorySectionArrow: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  memoryContentContainer: {
    marginTop: spacing.sectionGap,
    paddingTop: spacing.sectionGap,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  memoryCenterContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  memoryLoadingText: {
    marginTop: spacing.smallGap,
    ...typography.caption,
  },
  memoryErrorText: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.elementGap,
  },
  memoryEmptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.sectionGap,
  },
  memoryEmptyIcon: {
    fontSize: 40,
    marginBottom: spacing.elementGap,
  },
  memoryEmptyTitle: {
    ...typography.bodyText,
    marginBottom: spacing.smallGap,
  },
  memoryEmptyText: {
    ...typography.caption,
    textAlign: 'center',
  },
  memoryDataContainer: {
    gap: 0,
  },
  memoryBulletItem: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 22,
    paddingLeft: spacing.smallGap,
  },
  viewMemoryLink: {
    alignSelf: 'flex-end',
    marginTop: spacing.elementGap,
  },
  viewMemoryLinkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '500',
  },
});

export default OasisHomeScreen;
