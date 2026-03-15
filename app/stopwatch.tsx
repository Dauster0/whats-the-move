import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, font, radius, spacing } from "../lib/theme";

const STORAGE_KEY = "stopwatch_data_v2";

type StoredData = {
  totalSecondsToday: number;
  lastDate: string;
  isRunning: boolean;
  lastTickAt: number | null;
};

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getRiskLevel(seconds: number) {
  const minutes = seconds / 60;

  if (minutes < 30) {
    return {
      label: "On track",
      color: colors.accent,
      message: "You still have the day in your hands.",
      suggestion: "Stay ahead of the loop.",
    };
  }

  if (minutes < 60) {
    return {
      label: "Drifting",
      color: "#FFD166",
      message: "You are starting to slide into autopilot.",
      suggestion: "A 2-minute move can break it.",
    };
  }

  if (minutes < 120) {
    return {
      label: "Deepening",
      color: "#FF9F43",
      message: "This is where the scroll starts stealing the day.",
      suggestion: "Swap 5–10 minutes right now.",
    };
  }

  return {
    label: "Spiral",
    color: "#FF6B6B",
    message: "You have been in passive mode long enough to feel it.",
    suggestion: "Do one real-world move immediately.",
  };
}

export default function StopwatchScreen() {
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  async function loadData() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);

      if (!raw) {
        setIsLoaded(true);
        return;
      }

      const data: StoredData = JSON.parse(raw);
      const today = getTodayString();

      if (data.lastDate !== today) {
        setTotalSeconds(0);
        setIsRunning(false);
        setIsLoaded(true);
        return;
      }

      let seconds = data.totalSecondsToday;
      if (data.isRunning && data.lastTickAt) {
        const elapsed = Math.floor((Date.now() - data.lastTickAt) / 1000);
        seconds += elapsed;
      }

      setTotalSeconds(seconds);
      setIsRunning(data.isRunning);
    } catch {
      // ignore
    } finally {
      setIsLoaded(true);
    }
  }

  async function saveData(seconds: number, running: boolean) {
    try {
      const data: StoredData = {
        totalSecondsToday: seconds,
        lastDate: getTodayString(),
        isRunning: running,
        lastTickAt: running ? Date.now() : null,
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  function startTimer() {
    if (intervalRef.current) return;

    intervalRef.current = setInterval(() => {
      setTotalSeconds((s) => s + 1);
    }, 1000);
  }

  function stopTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function toggle() {
    const next = !isRunning;
    setIsRunning(next);
    if (next) startTimer();
    else stopTimer();
  }

  function reset() {
    stopTimer();
    setIsRunning(false);
    setTotalSeconds(0);
    saveData(0, false);
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    if (isRunning) startTimer();
    else stopTimer();

    return () => stopTimer();
  }, [isRunning, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    if (totalSeconds % 5 === 0) {
      saveData(totalSeconds, isRunning);
    }
  }, [totalSeconds, isLoaded, isRunning]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appStateRef.current === "active" && nextState !== "active") {
        saveData(totalSeconds, isRunning);
      }

      if (appStateRef.current !== "active" && nextState === "active") {
        loadData();
      }

      appStateRef.current = nextState;
    });

    return () => sub.remove();
  }, [totalSeconds, isRunning]);

  if (!isLoaded) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const risk = getRiskLevel(totalSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const hoursDecimal = Math.floor((totalSeconds / 3600) * 10) / 10;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Phone time today</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={[styles.statusPill, { backgroundColor: risk.color }]}>
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: isRunning ? colors.bgDark : "transparent",
              borderColor: colors.bgDark,
            },
          ]}
        />
        <Text style={styles.statusLabel}>{risk.label}</Text>
      </View>

      <View style={styles.timerSection}>
        <Text style={styles.timerText}>{formatDuration(totalSeconds)}</Text>
        <Text style={styles.timerSub}>{isRunning ? "counting now" : "paused"}</Text>
      </View>

      <View style={styles.messageCard}>
        <Text style={styles.messageTitle}>{risk.message}</Text>
        <Text style={styles.messageText}>{risk.suggestion}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{minutes}</Text>
          <Text style={styles.statLabel}>minutes{"\n"}today</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text style={styles.statNum}>{Math.max(0, 120 - minutes)}</Text>
          <Text style={styles.statLabel}>min until{"\n"}2hr mark</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text style={styles.statNum}>{hoursDecimal}h</Text>
          <Text style={styles.statLabel}>total{"\n"}today</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.toggleButton, isRunning && styles.toggleButtonRunning]}
          onPress={toggle}
        >
          <Text style={styles.toggleButtonText}>
            {isRunning ? "⏸ Pause timer" : "▶ Start timer"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.moveButton}
          onPress={() =>
            router.push({
              pathname: "/suggestions",
              params: { minMinutes: "1", maxMinutes: "30" },
            })
          }
        >
          <Text style={styles.moveButtonText}>Swap time for a move →</Text>
        </Pressable>
      </View>

      <Pressable style={styles.resetBtn} onPress={reset}>
        <Text style={styles.resetText}>Reset today's count</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 60,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: font.sizeMd,
    color: colors.textMuted,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  backBtn: {
    width: 42,
    height: 42,
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  backArrow: {
    fontSize: font.sizeLg,
    color: colors.text,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: font.sizeMd,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.2,
  },
  headerRight: {
    width: 42,
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    borderRadius: radius.full,
    paddingVertical: 8,
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: spacing.lg,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  statusLabel: {
    fontSize: font.sizeSm,
    fontWeight: "800",
    color: colors.bgDark,
    letterSpacing: 0.2,
  },

  timerSection: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  timerText: {
    fontSize: 72,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -4,
    lineHeight: 80,
    fontVariant: ["tabular-nums"],
  },
  timerSub: {
    fontSize: font.sizeSm,
    color: colors.textMuted,
    fontWeight: "500",
    letterSpacing: 0.5,
    marginTop: 4,
  },

  messageCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  messageTitle: {
    fontSize: font.sizeMd,
    color: colors.text,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  messageText: {
    fontSize: font.sizeSm,
    color: colors.textSub,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },

  statsRow: {
    flexDirection: "row",
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNum: {
    fontSize: font.sizeXl,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  statLabel: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 3,
    lineHeight: 16,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },

  controls: {
    gap: 10,
    marginBottom: spacing.md,
  },
  toggleButton: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleButtonRunning: {
    backgroundColor: "#2A2A2A",
  },
  toggleButtonText: {
    color: colors.textInverse,
    fontSize: font.sizeLg,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  moveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
  },
  moveButtonText: {
    color: colors.bgDark,
    fontSize: font.sizeMd,
    fontWeight: "800",
    letterSpacing: -0.2,
  },

  resetBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  resetText: {
    fontSize: font.sizeSm,
    color: colors.textMuted,
    fontWeight: "600",
  },
});