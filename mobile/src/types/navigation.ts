// Navigation types for the Oasis app

import { NavigationProp, RouteProp } from '@react-navigation/native';
import { Chat } from './chat';

// Question context for chats initiated from question answers
export interface QuestionContext {
  questionId: string;
  questionText: string;
  userAnswer: string;
}

// Oasis tab stack navigation
export type OasisStackParamList = {
  OasisHome: undefined;
  ChatScreen: {
    chatId: string;
    chat: Chat;
    isFromQuestion?: boolean;
    questionContext?: QuestionContext;
  };
};

// Navigation prop for screens in the Oasis stack
export type OasisScreenNavigationProp = NavigationProp<OasisStackParamList>;

// Navigation prop specifically for ChatScreen
export type ChatScreenNavigationProp = NavigationProp<OasisStackParamList, 'ChatScreen'>;

// Route props for specific screens
export type ChatScreenRouteProp = RouteProp<OasisStackParamList, 'ChatScreen'>;
