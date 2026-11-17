/**
 * Centralized Design System Tokens (Arabic PDF to Book v2.9.6)
 * Single source of truth for all colors, typography, spacing, shadows, and borders
 * across Web UI and Word (DOCX) export.
 */

export const DESIGN_TOKENS = {
  colors: {
    // Heritage Azhari Palette
    royalGreen: '#0B4F2C',
    royalGreenLight: '#146C3E',
    royalGreenBg: '#EBF5F0',
    
    heritageGold: '#A67C00',
    heritageGoldLight: '#C99700',
    heritageGoldBg: '#FDF8E8',
    
    warmIvory: '#F7F2E3',
    warmIvoryLight: '#FAF7EE',
    warmIvoryBorder: '#E5DCBE',
    
    deepNavy: '#1F3864',
    deepNavyLight: '#2C4E8A',
    deepNavyBg: '#EDF2FA',
    
    questionMaroon: '#7B1E1E',
    questionMaroonLight: '#9E2A2A',
    questionMaroonBg: '#FDF0F0',
    
    inkSub: '#2E4B73',
    
    // Neutral & Surface
    surface: '#FFFFFF',
    surfaceSubtle: '#F8FAFC',
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',
    textMain: '#0F172A',
    textMuted: '#475569',
    textSubtle: '#64748B',
    
    // Status
    success: '#059669',
    successBg: '#ECFDF5',
    warning: '#D97706',
    warningBg: '#FFFBEB',
    error: '#DC2626',
    errorBg: '#FEF2F2',
  },
  typography: {
    fontBody: 'Amiri, "Traditional Arabic", "Noto Naskh Arabic", sans-serif',
    fontHead: 'Amiri, "Traditional Arabic", "Noto Naskh Arabic", sans-serif',
    fontMono: 'Consolas, "Fira Code", monospace',
  },
  radii: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    '2xl': '1.5rem',
    '3xl': '2rem',
    full: '9999px',
  },
  shadows: {
    xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  },
} as const;

export type DesignTokenColors = keyof typeof DESIGN_TOKENS.colors;
