const sharedLayoutTokens = {
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 44,
  },
  radii: {
    xs: 10,
    sm: 14,
    md: 18,
    lg: 24,
    xl: 32,
    pill: 999,
  },
  typography: {
    regular: 'Manrope_400Regular',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
  },
  motion: {
    welcomeRevealMs: 900,
    welcomeRevealReducedMs: 260,
    orbBaseDurationMs: 10500,
    orbDepthDurationMs: 7200,
    orbVarianceDurationMs: 3400,
    fluidFlowAMs: 6100,
    fluidFlowBMs: 7900,
    fluidBreathInMs: 3600,
    fluidBreathOutMs: 4200,
    tapRippleMs: 840,
    portalCopyFadeMs: 190,
    portalExpansionDelayMs: 145,
    portalSurfaceFadeMs: 275,
    portalExpansionMs: 690,
    portalOverlayFadeMs: 205,
    portalReducedFadeMs: 240,
  },
};

const baseTheme = {
  ...sharedLayoutTokens,
  colors: {
    bg: '#FFFFFF',
    text: '#111111',
    subtext: '#6B6B6B',
    primary: '#000000',
    onPrimary: '#FFFFFF',
    border: '#E6E6E6',
    divider: '#EEEEEE',
    surface: '#FFFFFF',
    surfaceSoft: '#F4F4F4',
    legal: '#8A8A8A',
    success: '#2F9E69',
    warning: '#D99527',
    danger: '#D95C62',
  },
  welcome: {
    brandInk: '#0A1222',
    authBackground: ['#F7FCFF', '#FCFEFF', '#F6FFF9'],
    portalBackground: ['#F3FAFF', '#FCFEFF', '#F4FFF8'],
    skyWash: 'rgba(126,207,255,0.08)',
    gardenWash: 'rgba(116,225,157,0.07)',
    orbPalette: [
      [83, 205, 235],
      [83, 159, 255],
      [112, 220, 157],
      [255, 152, 139],
      [167, 139, 250],
      [255, 207, 89],
    ],
    orbGlassTop: 'rgba(255,255,255,0.68)',
    orbBorder: 'rgba(255,255,255,0.64)',
    orbHighlight: 'rgba(255,255,255,0.22)',
    promptLine: 'rgba(17,17,17,0.35)',
  },
  fluid: {
    surfaceGradient: ['#F8FDFF', '#DDF4FF', '#ECFAFF'],
    surfaceBackground: '#EAF8FF',
    particle: '#4DB9E5',
    outline: '#0A1222',
    boundaryRipple: 'rgba(70,186,233,0.72)',
    shadow: '#62BFE8',
    portalWash: ['#EAF9FF', '#CDEFFF', '#F4FCFF'],
    portalShadow: '#8FD7F4',
    lightGradient: [
      'rgba(255,255,255,0)',
      'rgba(255,255,255,0.82)',
      'rgba(141,220,250,0.08)',
      'rgba(255,255,255,0)',
    ],
  },
  circle: {
    accent: '#4DB9E5',
    accentSoft: '#DDF4FF',
    profileBackground: '#FFFFFF',
    headerGradient: ['#F7FCFF', '#EAF8FF'],
    decalPalette: ['#53CDEB', '#70DC9D', '#A78BFA', '#FF988B', '#FFCF59'],
  },
};

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function mergeThemeTokens(base, overrides) {
  if (!isPlainObject(overrides)) return base;

  const result = { ...base };
  Object.entries(overrides).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(base?.[key])) {
      result[key] = mergeThemeTokens(base[key], value);
    } else {
      result[key] = value;
    }
  });
  return result;
}

function createTheme({ id, name, description, overrides = {} }) {
  return {
    ...mergeThemeTokens(baseTheme, overrides),
    id,
    name,
    description,
  };
}

export const THEME_IDS = {
  AQUA_DAYLIGHT: 'aqua-daylight',
  CITRUS_GARDEN: 'citrus-garden',
  BUBBLEGUM_SKY: 'bubblegum-sky',
  AFTER_RAIN: 'after-rain',
};

export const DEFAULT_THEME_ID = THEME_IDS.AQUA_DAYLIGHT;

export const THEME_REGISTRY = {
  [THEME_IDS.AQUA_DAYLIGHT]: createTheme({
    id: THEME_IDS.AQUA_DAYLIGHT,
    name: 'Aqua Daylight',
    description: 'The default Circles atmosphere: clear water, open sky, and soft green light.',
  }),
  [THEME_IDS.CITRUS_GARDEN]: createTheme({
    id: THEME_IDS.CITRUS_GARDEN,
    name: 'Citrus Garden',
    description: 'Fresh lime, warm sunlight, and a bright garden glow.',
    overrides: {
      welcome: {
        authBackground: ['#FBFFF4', '#FFFFFB', '#F4FFF8'],
        portalBackground: ['#F7FFE9', '#FFFFFB', '#F2FFF7'],
        skyWash: 'rgba(255,215,92,0.08)',
        gardenWash: 'rgba(116,225,157,0.12)',
        orbPalette: [
          [123, 224, 132],
          [194, 233, 91],
          [255, 210, 77],
          [92, 202, 190],
          [255, 158, 111],
          [116, 172, 255],
        ],
      },
      fluid: {
        surfaceGradient: ['#FDFFF8', '#E9F9C9', '#F6FFF1'],
        surfaceBackground: '#F2FAD9',
        particle: '#7BCB75',
        boundaryRipple: 'rgba(111,199,103,0.72)',
        shadow: '#B4DC76',
        portalWash: ['#FAFFE9', '#EAF8C8', '#F8FFF1'],
        portalShadow: '#C9E887',
      },
      circle: {
        accent: '#74C96E',
        accentSoft: '#EAF8C8',
        headerGradient: ['#FBFFF4', '#F0FBD8'],
        decalPalette: ['#7BE084', '#C2E95B', '#FFD24D', '#5CCABE', '#FF9E6F'],
      },
    },
  }),
  [THEME_IDS.BUBBLEGUM_SKY]: createTheme({
    id: THEME_IDS.BUBBLEGUM_SKY,
    name: 'Bubblegum Sky',
    description: 'Soft cyan, pink, and lavender with a playful glassy finish.',
    overrides: {
      welcome: {
        authBackground: ['#F7FCFF', '#FFF9FD', '#FBF8FF'],
        portalBackground: ['#F2FBFF', '#FFF8FD', '#FAF7FF'],
        skyWash: 'rgba(107,203,255,0.10)',
        gardenWash: 'rgba(242,145,209,0.08)',
        orbPalette: [
          [82, 195, 239],
          [245, 151, 210],
          [177, 137, 248],
          [255, 187, 216],
          [119, 224, 218],
          [255, 215, 111],
        ],
      },
      fluid: {
        surfaceGradient: ['#FBFDFF', '#E1F3FF', '#F9EFFF'],
        surfaceBackground: '#EDF6FF',
        particle: '#6EBDEB',
        boundaryRipple: 'rgba(130,171,236,0.72)',
        shadow: '#A6C6F3',
        portalWash: ['#F2FAFF', '#E2F2FF', '#F9EFFF'],
        portalShadow: '#B5CFF1',
      },
      circle: {
        accent: '#8A8DEB',
        accentSoft: '#EEE9FF',
        headerGradient: ['#F7FCFF', '#FFF1FA'],
        decalPalette: ['#52C3EF', '#F597D2', '#B189F8', '#77E0DA', '#FFD76F'],
      },
    },
  }),
  [THEME_IDS.AFTER_RAIN]: createTheme({
    id: THEME_IDS.AFTER_RAIN,
    name: 'After Rain',
    description: 'Deep blue structure with reflective aqua and muted violet light.',
    overrides: {
      colors: {
        bg: '#F8FBFD',
        text: '#0A1222',
        subtext: '#586675',
        primary: '#0A1222',
        border: '#DCE5EB',
        divider: '#E8EEF2',
        surfaceSoft: '#EEF4F7',
      },
      welcome: {
        authBackground: ['#EEF6FA', '#F8FBFD', '#F4F1FA'],
        portalBackground: ['#EAF4F8', '#F8FBFD', '#F2EFF8'],
        skyWash: 'rgba(71,154,207,0.10)',
        gardenWash: 'rgba(135,119,185,0.07)',
        orbPalette: [
          [67, 157, 207],
          [70, 194, 207],
          [124, 112, 184],
          [102, 170, 213],
          [120, 196, 176],
          [196, 167, 214],
        ],
      },
      fluid: {
        surfaceGradient: ['#F5FBFD', '#CFEAF3', '#EAE6F5'],
        surfaceBackground: '#DDEFF4',
        particle: '#3F9FC5',
        boundaryRipple: 'rgba(58,148,190,0.72)',
        shadow: '#78ABC4',
        portalWash: ['#EEF8FA', '#D7ECF3', '#ECE8F5'],
        portalShadow: '#8EB7CB',
      },
      circle: {
        accent: '#3F9FC5',
        accentSoft: '#D7ECF3',
        profileBackground: '#F8FBFD',
        headerGradient: ['#EEF6FA', '#E9E6F4'],
        decalPalette: ['#439DCF', '#46C2CF', '#7C70B8', '#78C4B0', '#C4A7D6'],
      },
    },
  }),
};

export const DEFAULT_THEME = THEME_REGISTRY[DEFAULT_THEME_ID];

export const THEME_OPTIONS = Object.values(THEME_REGISTRY).map((theme) => ({
  id: theme.id,
  name: theme.name,
  description: theme.description,
  accent: theme.circle.accent,
  accentSoft: theme.circle.accentSoft,
}));

export function isKnownTheme(themeId) {
  return !!THEME_REGISTRY[themeId];
}

export function getTheme(themeId = DEFAULT_THEME_ID) {
  return THEME_REGISTRY[themeId] || DEFAULT_THEME;
}

export function resolveTheme(themeId = DEFAULT_THEME_ID, overrides = null) {
  const theme = getTheme(themeId);
  if (!overrides) return theme;
  return {
    ...mergeThemeTokens(theme, overrides),
    id: theme.id,
    name: theme.name,
    description: theme.description,
  };
}
