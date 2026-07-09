import React, { forwardRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetFooter,
  BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import api from '../services/api';
import { ChatMessage, ChatMessagesApiResponse, SendMessageApiResponse } from '../types/chat';

interface DailyOutlookSheetProps {
  chatId: string | null;
}

const DailyOutlookSheet = forwardRef<React.ElementRef<typeof BottomSheetModal>, DailyOutlookSheetProps>(
  ({ chatId }, ref) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [isSending, setIsSending] = useState(false);

    const snapPoints = useMemo(() => ['95.93%'], []);

    const loadMessages = useCallback(async (id: string) => {
      setIsLoadingMessages(true);
      try {
        const response = await api.get<ChatMessagesApiResponse>(`/api/chat/${id}/messages`);
        if (response.data.success) {
          setMessages(response.data.data || []);
        }
      } catch (error) {
        console.error('[DailyOutlookSheet] Error loading messages:', error);
      } finally {
        setIsLoadingMessages(false);
      }
    }, []);

    // Fresh chatId means the sheet was just opened for a new session — load its (empty) history.
    const handleSheetChange = useCallback((index: number) => {
      if (index >= 0 && chatId) {
        setMessages([]);
        loadMessages(chatId);
      }
    }, [chatId, loadMessages]);

    const handleSend = async () => {
      const content = inputText.trim();
      if (!content || !chatId || isSending) return;

      setInputText('');
      setIsSending(true);
      try {
        const response = await api.post<SendMessageApiResponse>('/api/chat/message', {
          chatId,
          content,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        if (response.data.success && response.data.data) {
          const { userMessage, assistantMessage } = response.data.data;
          setMessages(prev => [...prev, userMessage, assistantMessage]);
        }
      } catch (error) {
        console.error('[DailyOutlookSheet] Error sending message:', error);
        setInputText(content);
      } finally {
        setIsSending(false);
      }
    };

    // Pinned input bar — BottomSheetFooter tracks the sheet's animated position
    // and keyboard height itself, so this stays glued to the bottom regardless
    // of how much content is above it. Plain flex layout inside the sheet's
    // main content area does NOT reliably pin to the bottom in this library.
    const renderFooter = useCallback((footerProps: BottomSheetFooterProps) => (
      <BottomSheetFooter {...footerProps} bottomInset={Platform.OS === 'ios' ? 20 : 0}>
        <View style={styles.inputBar}>
          <BottomSheetTextInput
            style={styles.textInput}
            placeholder="Message Mercia..."
            placeholderTextColor="#666"
            value={inputText}
            onChangeText={setInputText}
            multiline
            editable={!isSending && !!chatId}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isSending || !chatId) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isSending || !chatId}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendButtonIcon}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </BottomSheetFooter>
    ), [inputText, isSending, chatId]);

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        onChange={handleSheetChange}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
        footerComponent={renderFooter}
      >
        <BottomSheetView style={styles.header}>
          <Text style={styles.headerTitle}>Daily Outlook</Text>
        </BottomSheetView>

        {isLoadingMessages ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#00D9A0" />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>Ask Mercia anything about your day.</Text>
          </View>
        ) : (
          <BottomSheetFlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            renderItem={({ item }) => (
              <View style={[
                styles.messageRow,
                item.role === 'user' ? styles.messageRowUser : styles.messageRowAI,
              ]}>
                <View style={[
                  styles.messageBubble,
                  item.role === 'user' ? styles.userBubble : styles.aiBubble,
                ]}>
                  <Text style={[
                    styles.messageText,
                    item.role === 'user' ? styles.userMessageText : styles.aiMessageText,
                  ]}>
                    {item.content}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
      </BottomSheetModal>
    );
  }
);

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: '#161616',
  },
  handleIndicator: {
    backgroundColor: '#555',
    width: 36,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 90,
  },
  messageRow: {
    marginBottom: 12,
  },
  messageRowUser: {
    alignItems: 'flex-end',
  },
  messageRowAI: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#00D9A0',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#232323',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  userMessageText: {
    color: '#0D0D0D',
  },
  aiMessageText: {
    color: '#E8E8E8',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#161616',
    borderTopWidth: 1,
    borderTopColor: '#232323',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1F1F1F',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: '#E8E8E8',
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00D9A0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#333',
  },
  sendButtonIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0D0D0D',
  },
});

export default DailyOutlookSheet;
