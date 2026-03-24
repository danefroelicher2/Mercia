// Mercia Design System
// Professional dark theme with orange accents

export const colors = {
  // Backgrounds
  screenBg: '#1A1A1A',        // Almost black - main background
  cardBg: '#2A2A2A',          // Dark gray - card backgrounds
  inputBg: '#333333',         // Input field background

  // Text
  textPrimary: '#FFFFFF',     // White - main text
  textSecondary: '#A0A0A0',   // Light gray - timestamps, labels
  textTertiary: '#707070',    // Darker gray - placeholders

  // Accents
  primary: '#FF6B35',         // Vibrant orange - main accent
  success: '#00D9A0',         // Teal green - checkmarks, success states
  error: '#FF4444',           // Red - errors
  warning: '#FF9500',         // Orange warning

  // Borders & Dividers
  border: '#3A3A3A',          // Subtle gray - borders
  divider: '#2A2A2A',         // Section dividers

  // Press states
  pressHighlight: 'rgba(255, 107, 53, 0.1)', // Subtle orange tint for press
} as const;

export const spacing = {
  screenPadding: 20,          // Left/right screen margins
  sectionGap: 16,             // Gap between sections
  cardPadding: 16,            // Inside card padding
  elementGap: 12,             // Gap between elements in a card
  smallGap: 8,                // Small gaps
} as const;

export const typography = {
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
  },
  questionText: {
    fontSize: 17,
    fontWeight: '400' as const,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  bodyText: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as const,
    color: colors.textSecondary,
  },
  timestamp: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: colors.textTertiary,
  },
} as const;

export const cardStyle = {
  backgroundColor: colors.cardBg,
  borderRadius: 12,
  borderLeftWidth: 3,
  borderLeftColor: colors.primary,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 4,
  elevation: 3,
} as const;

export const buttonStyles = {
  primary: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '500' as const,
  },
  disabled: {
    opacity: 0.5,
  },
} as const;

export const inputStyles = {
  container: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
  },
  text: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  placeholder: colors.textTertiary,
} as const;
