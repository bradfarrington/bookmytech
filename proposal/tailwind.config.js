/** Book My Tech — Tailwind preset
 *  Usage: `presets: [require('./tailwind.config.js')]`
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          dark: '#1E3A8A',
          accent: '#3B82F6',
        },
        text: {
          DEFAULT: '#0F172A',
          secondary: '#334155',
        },
        border: '#E2E8F0',
        background: '#F8FAFC',
        surface: '#FFFFFF',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        tag: {
          'active-bg': '#DBEAFE',
          'active-text': '#1E3A8A',
          'success-bg': '#DCFCE7',
          'success-text': '#15803D',
          'pending-bg': '#FEF3C7',
          'pending-text': '#B45309',
          'error-bg': '#FEE2E2',
          'error-text': '#B91C1C',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        h1: ['48px', { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '700' }],
        h2: ['36px', { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '600' }],
        h3: ['28px', { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '600' }],
        h4: ['22px', { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '500' }],
        'body-lg': ['18px', { lineHeight: '1.6' }],
        body: ['16px', { lineHeight: '1.6' }],
        small: ['14px', { lineHeight: '1.6' }],
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '24px',
        6: '32px',
        7: '48px',
        8: '64px',
      },
      maxWidth: {
        layout: '1200px',
      },
      borderRadius: {
        input: '8px',
        button: '10px',
        card: '16px',
        pill: '999px',
      },
      boxShadow: {
        card: '0 4px 20px rgba(0, 0, 0, 0.05)',
        'input-focus': '0 0 0 3px rgba(37, 99, 235, 0.15)',
      },
      height: {
        input: '48px',
      },
    },
  },
};
