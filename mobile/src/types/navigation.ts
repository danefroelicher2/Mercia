// Navigation types for the Mercia app

import { NavigationProp, RouteProp } from '@react-navigation/native';
import { Chat } from './chat';

// Question context for chats initiated from question answers
export interface QuestionContext {
  questionId: string;
  questionText: string;
  userAnswer: string;
}

// Mercia tab stack navigation
export type MerciaStackParamList = {
  MerciaHome: undefined;
  ChatScreen: {
    chatId: string;
    chat: Chat;
    isFromQuestion?: boolean;
    questionContext?: QuestionContext;
  };
};

// Navigation prop for screens in the Mercia stack
export type MerciaScreenNavigationProp = NavigationProp<MerciaStackParamList>;

// Navigation prop specifically for ChatScreen
export type ChatScreenNavigationProp = NavigationProp<MerciaStackParamList, 'ChatScreen'>;

// Route props for specific screens
export type ChatScreenRouteProp = RouteProp<MerciaStackParamList, 'ChatScreen'>;
