import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  RefreshControl,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { formatMessageTime } from '../utils/dateUtils';
import { ChatMessage, ChatMessagesApiResponse, SendMessageApiResponse } from '../types/chat';
import { ChatScreenRouteProp, ChatScreenNavigationProp } from '../types/navigation';

// Constants
const MAX_INPUT_CHARS = 1000;
const CHAR_WARNING_THRESHOLD = 900;

// Type for messages including optimistic ones
interface DisplayMessage extends ChatMessage {
  isOptimistic?: boolean;
}

const ChatScreen: React.FC = () => {
  // ============================================
  // ROUTE PARAMS & NAVIGATION
  // ============================================
  const route = useRoute<ChatScreenRouteProp>();
  const navigation = useNavigation<ChatScreenNavigationProp>();
  const { chatId, chat, isFromQuestion, questionContext } = route.params;

  // ============================================
  // REFS
  // ============================================
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const hasInitializedFromQuestion = useRef(false);

  // ============================================
  // STATE
  // ============================================
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingMessageText, setPendingMessageText] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(chat.pinned || false);

  // Animation for thinking indicator
  const [thinkingDot1] = useState(new Animated.Value(0.3));
  const [thinkingDot2] = useState(new Animated.Value(0.3));
  const [thinkingDot3] = useState(new Animated.Value(0.3));

  console.log('[ChatScreen] Chat ID:', chatId);

  // ============================================
  // PIN/DELETE HANDLERS
  // ============================================

  const handleTogglePin = async () => {
    try {
      if (isPinned) {
        // Unpin
        const response = await api.post(`/api/chat/${chatId}/unpin`);
        if (response.data.success) {
          setIsPinned(false);
          console.log('[ChatScreen] Chat unpinned');
        }
      } else {
        // Pin
        const response = await api.post(`/api/chat/${chatId}/pin`);
        if (response.data.success) {
          setIsPinned(true);
          console.log('[ChatScreen] Chat pinned');
        } else {
          // Max pins reached
          Alert.alert(
            'Maximum Pins Reached',
            'You can only pin up to 5 conversations. Unpin one to pin this chat.',
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error: any) {
      console.error('[ChatScreen] Error toggling pin:', error);
      // Check if it's the max pins error
      if (error.response?.status === 400) {
        Alert.alert(
          'Maximum Pins Reached',
          'You can only pin up to 5 conversations. Unpin one to pin this chat.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Failed to update pin status. Please try again.');
      }
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Conversation',
      'This conversation will be permanently deleted. This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await api.delete(`/api/chat/${chatId}`);
              if (response.data.success) {
                console.log('[ChatScreen] Chat deleted');
                navigation.goBack();
              }
            } catch (error) {
              console.error('[ChatScreen] Error deleting chat:', error);
              Alert.alert('Error', 'Failed to delete conversation. Please try again.');
            }
          },
        },
      ]
    );
  };

  // ============================================
  // HEADER SETUP
  // ============================================

  useLayoutEffect(() => {
    navigation.setOptions({
      title: chat.title || 'Chat',
      headerRight: () => (
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleTogglePin} style={styles.headerButton}>
            <Text style={styles.headerButtonIcon}>
              {isPinned ? '📌' : '📍'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.headerButton}>
            <Text style={[styles.headerButtonIcon, styles.deleteIcon]}>
              🗑️
            </Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, chat.title, isPinned]);

  // ============================================
  // THINKING ANIMATION
  // ============================================
  useEffect(() => {
    if (!isSendingMessage) return;

    const animateDots = () => {
      const duration = 400;

      Animated.sequence([
        Animated.timing(thinkingDot1, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(thinkingDot1, { toValue: 0.3, duration, useNativeDriver: true }),
      ]).start();

      setTimeout(() => {
        Animated.sequence([
          Animated.timing(thinkingDot2, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(thinkingDot2, { toValue: 0.3, duration, useNativeDriver: true }),
        ]).start();
      }, duration / 2);

      setTimeout(() => {
        Animated.sequence([
          Animated.timing(thinkingDot3, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(thinkingDot3, { toValue: 0.3, duration, useNativeDriver: true }),
        ]).start();
      }, duration);
    };

    animateDots();
    const interval = setInterval(animateDots, 1200);

    return () => clearInterval(interval);
  }, [isSendingMessage, thinkingDot1, thinkingDot2, thinkingDot3]);

  // ============================================
  // API CALLS
  // ============================================

  const fetchMessages = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoadingMessages(true);
      }
      setError(null);

      console.log('[ChatScreen] Fetching messages...');
      const response = await api.get<ChatMessagesApiResponse>(`/api/chat/${chatId}/messages`);

      if (response.data.success) {
        const fetchedMessages = response.data.data || [];
        console.log('[ChatScreen] Loaded', fetchedMessages.length, 'messages');
        setMessages(fetchedMessages);

        // Scroll to bottom after messages load
        setTimeout(() => scrollToBottom(), 100);
      } else {
        throw new Error('Failed to fetch messages');
      }
    } catch (err: any) {
      console.error('[ChatScreen] Error fetching messages:', err);
      const message = err.response?.data?.error?.message
        || err.message
        || 'Unable to load messages. Please try again.';
      setError(message);
    } finally {
      setIsLoadingMessages(false);
      setIsRefreshing(false);
    }
  }, [chatId]);

  const sendMessage = async (content: string, isQuestionInit = false) => {
    if (!content.trim()) return;

    const trimmedContent = content.trim();
    const tempId = `temp-${Date.now()}`;

    try {
      setIsSendingMessage(true);
      setError(null);
      Keyboard.dismiss();

      // Clear input immediately
      setInputText('');
      setPendingMessageText(trimmedContent);

      // Optimistic update - add user message immediately
      const optimisticMessage: DisplayMessage = {
        id: tempId,
        chat_id: chatId,
        user_id: 'current-user',
        role: 'user',
        content: trimmedContent,
        created_at: new Date().toISOString(),
        isOptimistic: true,
      };

      setMessages(prev => [...prev, optimisticMessage]);
      setTimeout(() => scrollToBottom(), 50);

      console.log('[ChatScreen] Sending message:', trimmedContent.substring(0, 50));

      // Build request body
      const requestBody: any = {
        chatId,
        content: trimmedContent,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      // Include question context if this is from a question
      if (isQuestionInit && questionContext) {
        console.log('[ChatScreen] Initializing from question');
        requestBody.questionContext = {
          questionId: questionContext.questionId,
          questionText: questionContext.questionText,
        };
      }

      const response = await api.post<SendMessageApiResponse>('/api/chat/message', requestBody);

      if (response.data.success && response.data.data) {
        console.log('[ChatScreen] Received AI response');
        const { userMessage, assistantMessage } = response.data.data;

        // Replace optimistic message with real one and add AI response
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempId);
          return [...filtered, userMessage, assistantMessage];
        });

        setPendingMessageText(null);
        setTimeout(() => scrollToBottom(), 100);
      } else {
        throw new Error('Failed to send message');
      }
    } catch (err: any) {
      console.error('[ChatScreen] Error sending message:', err);
      const errorMessage = err.response?.data?.error?.message
        || err.message
        || 'Failed to send message. Please try again.';

      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempId));

      // Restore text to input
      setInputText(trimmedContent);
      setPendingMessageText(null);

      Alert.alert('Error', errorMessage);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // ============================================
  // EFFECTS
  // ============================================

  // Fetch messages on mount
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Handle question-based initialization
  useEffect(() => {
    if (isFromQuestion && questionContext && !hasInitializedFromQuestion.current && !isLoadingMessages) {
      hasInitializedFromQuestion.current = true;
      console.log('[ChatScreen] Auto-sending question answer to start conversation');
      // Small delay to ensure messages are loaded first
      setTimeout(() => {
        sendMessage(questionContext.userAnswer, true);
      }, 500);
    }
  }, [isFromQuestion, questionContext, isLoadingMessages]);

  // ============================================
  // HANDLERS
  // ============================================

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  const handleSend = () => {
    if (inputText.trim() && !isSendingMessage && inputText.length <= MAX_INPUT_CHARS) {
      sendMessage(inputText);
    }
  };

  const handleRefresh = () => {
    fetchMessages(true);
  };

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const charCount = inputText.length;
  const showCharCounter = charCount > CHAR_WARNING_THRESHOLD;
  const isOverLimit = charCount > MAX_INPUT_CHARS;
  const canSend = inputText.trim().length > 0 && !isSendingMessage && !isOverLimit;

  // ============================================
  // RENDER HELPERS
  // ============================================

  const renderMessage = ({ item }: { item: DisplayMessage }) => {
    const isUser = item.role === 'user';
    const isSystem = item.role === 'system';

    if (isSystem) {
      return (
        <View style={styles.systemMessageContainer}>
          <Text style={styles.systemMessageText}>{item.content}</Text>
        </View>
      );
    }

    return (
      <View style={[
        styles.messageRow,
        isUser ? styles.messageRowUser : styles.messageRowAI,
      ]}>
        <View style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.aiBubble,
          item.isOptimistic && styles.optimisticBubble,
        ]}>
          <Text style={[
            styles.messageText,
            isUser ? styles.userMessageText : styles.aiMessageText,
          ]}>
            {item.content}
          </Text>
        </View>
        <Text style={[
          styles.messageTime,
          isUser ? styles.userMessageTime : styles.aiMessageTime,
        ]}>
          {formatMessageTime(item.created_at)}
          {item.isOptimistic && ' • Sending...'}
        </Text>
      </View>
    );
  };

  const renderThinkingIndicator = () => (
    <View style={[styles.messageRow, styles.messageRowAI]}>
      <View style={[styles.messageBubble, styles.aiBubble, styles.thinkingBubble]}>
        <View style={styles.thinkingDots}>
          <Animated.View style={[styles.thinkingDot, { opacity: thinkingDot1 }]} />
          <Animated.View style={[styles.thinkingDot, { opacity: thinkingDot2 }]} />
          <Animated.View style={[styles.thinkingDot, { opacity: thinkingDot3 }]} />
        </View>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>💬</Text>
      <Text style={styles.emptyTitle}>Start a conversation</Text>
      <Text style={styles.emptyText}>
        Type a message below to begin{'\n'}talking with Oasis
      </Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.errorContainer}>
      <Text style={styles.errorIcon}>!</Text>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={() => fetchMessages()}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>Loading messages...</Text>
    </View>
  );

  const renderListFooter = () => {
    if (isSendingMessage) {
      return renderThinkingIndicator();
    }
    return null;
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Messages List */}
        <View style={styles.messagesContainer}>
          {isLoadingMessages && !isRefreshing ? (
            renderLoading()
          ) : error && messages.length === 0 ? (
            renderError()
          ) : messages.length === 0 && !isSendingMessage ? (
            renderEmptyState()
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={renderListFooter}
              onContentSizeChange={() => {
                if (messages.length > 0) {
                  setTimeout(() => scrollToBottom(), 50);
                }
              }}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  colors={['#007AFF']}
                  tintColor="#007AFF"
                />
              }
            />
          )}
        </View>

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputWrapper}>
            <TextInput
              ref={inputRef}
              style={[styles.textInput, isOverLimit && styles.textInputError]}
              placeholder="Message Oasis..."
              placeholderTextColor="#999"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={MAX_INPUT_CHARS + 100} // Allow typing slightly over to show error
              editable={!isSendingMessage}
              returnKeyType="default"
            />
            {showCharCounter && (
              <Text style={[styles.charCounter, isOverLimit && styles.charCounterError]}>
                {charCount}/{MAX_INPUT_CHARS}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!canSend}
          >
            {isSendingMessage ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendButtonIcon}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  keyboardAvoidingView: {
    flex: 1,
  },

  // Header Buttons
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginRight: 8,
  },
  headerButton: {
    padding: 4,
  },
  headerButtonIcon: {
    fontSize: 20,
  },
  deleteIcon: {
    color: '#FF4444',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  // Message Rows
  messageRow: {
    marginBottom: 12,
  },
  messageRowUser: {
    alignItems: 'flex-end',
  },
  messageRowAI: {
    alignItems: 'flex-start',
  },

  // Message Bubbles
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#F0F0F0',
    borderBottomLeftRadius: 4,
  },
  optimisticBubble: {
    opacity: 0.7,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  aiMessageText: {
    color: '#1a1a1a',
  },

  // Message Times
  messageTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    marginHorizontal: 4,
  },
  userMessageTime: {
    textAlign: 'right',
  },
  aiMessageTime: {
    textAlign: 'left',
  },

  // System Messages
  systemMessageContainer: {
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 20,
  },
  systemMessageText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Thinking Indicator
  thinkingBubble: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  thinkingDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thinkingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#666',
    marginHorizontal: 3,
  },

  // Input Bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  inputWrapper: {
    flex: 1,
    marginRight: 8,
  },
  textInput: {
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textInputError: {
    borderColor: '#ff3b30',
  },
  charCounter: {
    position: 'absolute',
    bottom: -18,
    right: 12,
    fontSize: 11,
    color: '#999',
  },
  charCounterError: {
    color: '#ff3b30',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },

  // Loading State
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },

  // Error State
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
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
});

export default ChatScreen;
