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

  accent: "#F5F0E8",
  accentSoft: "rgba(245, 240, 232, 0.18)",
  accentWarm: "#F5F0E8",

  border: "#2E2A24",
  borderStrong: "#3D3830",
  borderDark: "#E8E4DC",

  shadow: "#000000",

  success: "#7FA36A",
  warning: "#D9A15B",
};

/** Legacy import — app uses dark identity everywhere; keep in sync with useThemeColors(). */
export const colors = colorsDark;

export function getColors(_isDark: boolean) {
  return colorsDark;
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
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