export const colorsLight = {
  bg: "#F8F4EE",
  bgCard: "#FFFEFB",
  bgCardSoft: "#F3ECE1",
  bgMuted: "#EAE1D2",
  bgDark: "#1D1A17",

  text: "#181512",
  textSub: "#5E5449",
  textMuted: "#8A7D70",
  textInverse: "#FFFDF9",
  textOnDark: "#F5F2EC",

  /** Warm rust — avoids generic indigo “AI app” look */
  accent: "#8B3A1F",
  accentSoft: "#EDD5C8",
  accentWarm: "#B45309",

  border: "#E2D7C8",
  borderStrong: "#D5C7B3",
  borderDark: "#2A241E",

  shadow: "#000000",

  success: "#7FA36A",
  warning: "#D9A15B",
};

export const colorsDark = {
  bg: "#12100E",
  bgCard: "#1C1916",
  bgCardSoft: "#252219",
  bgMuted: "#2E2A24",
  bgDark: "#E8E4DC",

  text: "#F5F2EC",
  textSub: "#B8B0A4",
  textMuted: "#8A8278",
  textInverse: "#181512",
  textOnDark: "#F5F2EC",

  accent: "#E8A87C",
  accentSoft: "rgba(232, 168, 124, 0.22)",
  accentWarm: "#F4C4A8",

  border: "#2E2A24",
  borderStrong: "#3D3830",
  borderDark: "#E8E4DC",

  shadow: "#000000",

  success: "#7FA36A",
  warning: "#D9A15B",
};

/** @deprecated Use useThemeColors() for theme-aware colors */
export const colors = colorsLight;

export function getColors(isDark: boolean) {
  return isDark ? colorsDark : colorsLight;
}

/** Mostly square corners — reads more editorial / human than pill cards */
export const radius = {
  sm: 2,
  md: 3,
  lg: 4,
  xl: 4,
  /** Tags and chips: slight corner, not full pill */
  full: 6,
};

export const spacing = {
  xs: 8,
  sm: 14,
  md: 22,
  lg: 30,
  xl: 42,
  xxl: 64,
};

export const font = {
  sizeXs: 11,
  sizeSm: 13,
  sizeMd: 16,
  sizeLg: 21,
  sizeXl: 30,
  sizeXxl: 40,
  sizeHero: 54,
};