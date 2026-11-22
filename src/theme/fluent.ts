// Microsoft Fluent Design System Tokens for LogixMobile (Aligned with logix_react)

export const fluent = {
    colors: {
        // Theme Primary (Communication Blue)
        primary: '#0078d4',
        primaryDark: '#106ebe',
        primaryDarker: '#005a9e',
        primaryLight: '#c7e0f4',
        primaryLighter: '#deecf9',
        primaryLighterAlt: '#eff6fc',

        // Neutrals
        black: '#000000',
        neutralDark: '#1b1a19',
        neutralPrimary: '#201f1e',
        neutralPrimaryAlt: '#3b3a39',
        neutralSecondary: '#605e5c',
        neutralSecondaryAlt: '#8a8886',
        neutralTertiary: '#a19f9d',
        neutralTertiaryAlt: '#c8c6c4',
        neutralQuaternary: '#d2d0ce',
        neutralLight: '#edebe9',
        neutralLighter: '#f3f2f1',
        neutralLighterAlt: '#faf9f8',
        white: '#ffffff',

        // Backgrounds
        pageBg: '#f3f2f1',
        cardBg: '#ffffff',

        // Semantic Status Colors
        success: '#107c41',
        successLight: '#dff6dd',
        successBorder: '#107c41',

        warning: '#797673',
        warningLight: '#fff4ce',
        warningBorder: '#d2d0ce',
        warningText: '#797673',

        error: '#a4262c',
        errorLight: '#fde7e9',
        errorBorder: '#f8b6be',

        info: '#0078d4',
        infoLight: '#eff6fc',
        infoBorder: '#c7e0f4',
    },

    radius: {
        none: 0,
        xs: 2,
        sm: 4,
        md: 6,
        lg: 8,
    },

    shadows: {
        card: {
            elevation: 1,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
        },
        elevated: {
            elevation: 2,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 4,
        },
    },

    borders: {
        thin: 1,
        medium: 1.5,
        thick: 2,
        color: '#d2d0ce',
        colorLight: '#edebe9',
        colorDark: '#8a8886',
        focus: '#0078d4',
    },
} as const;

export default fluent;
