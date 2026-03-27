import type { HungerPreference } from "../lib/food-preference";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type MoveCategory = "micro" | "short" | "social";

export type CompletedMove = {
  move: string;
  category: MoveCategory;
  durationMinutes: number;
  completedAt: string;
};

export type UserPreferences = {
  interests: string[];
  socialMode: "solo" | "social" | "both";
  budget: "free" | "cheap" | "flexible";
  energyMode: "low" | "medium" | "high" | "mixed";
  placeMode: "indoors" | "outdoors" | "both";
  preferredTimes: ("morning" | "midday" | "afternoon" | "evening" | "night")[];
  /** Neighborhood or city — used in AI copy & booking search context */
  homeCity: string;
  /** School, campus, or work area — optional anchor for "near campus" style ideas */
  schoolOrWork: string;
  ageRange: "under18" | "18-21" | "18-24" | "25-34" | "35-44" | "45+" | "prefer_not";
  /** Separate from socialMode: introverts get fewer "ping a friend" nudges */
  socialBattery: "introvert" | "ambivert" | "extrovert";
  /** Food tilt for concierge deck (same idea as old "Hungry?" full finder). */
  hungerPreference: HungerPreference;
  /** How the user gets around — affects distance bias in suggestions. */
  transportMode: "walking" | "cycling" | "transit" | "driving";
};

type MoveContextType = {
  completedMoves: CompletedMove[];
  addCompletedMove: (
    move: string,
    category: MoveCategory,
    durationMinutes: number
  ) => void;
  clearMoves: () => void;

  preferences: UserPreferences;
  interests: string[];
  setInterests: (selectedInterests: string[]) => void;
  setPreferences: (prefs: UserPreferences) => void;
  setPreferencesAndFinishOnboarding: (prefs: UserPreferences) => void;

  resetOnboarding: () => void;
  hasFinishedOnboarding: boolean;
  streakCount: number;
  isLoaded: boolean;
};

const MoveContext = createContext<MoveContextType | undefined>(undefined);

const MOVES_STORAGE_KEY = "completed_moves";
const PREFERENCES_STORAGE_KEY = "user_preferences_v3";
const ONBOARDING_STORAGE_KEY = "has_finished_onboarding";

const DEFAULT_PREFERENCES: UserPreferences = {
  interests: [],
  socialMode: "both",
  budget: "cheap",
  energyMode: "mixed",
  placeMode: "both",
  preferredTimes: ["morning", "midday", "afternoon", "evening", "night"],
  homeCity: "",
  schoolOrWork: "",
  ageRange: "prefer_not",
  socialBattery: "ambivert",
  hungerPreference: "any",
  transportMode: "driving",
};

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDayDifference(a: Date, b: Date) {
  const startA = getStartOfDay(a).getTime();
  const startB = getStartOfDay(b).getTime();
  return Math.round((startA - startB) / (1000 * 60 * 60 * 24));
}

function calculateStreak(completedMoves: CompletedMove[]) {
  if (completedMoves.length === 0) return 0;

  const uniqueDays = Array.from(
    new Set(
      completedMoves.map((move) =>
        getStartOfDay(new Date(move.completedAt)).toISOString()
      )
    )
  )
    .map((dateString) => new Date(dateString))
    .sort((a, b) => b.getTime() - a.getTime());

  if (uniqueDays.length === 0) return 0;

  const today = getStartOfDay(new Date());
  const mostRecentDay = getStartOfDay(uniqueDays[0]);
  const daysFromToday = getDayDifference(today, mostRecentDay);

  if (daysFromToday > 1) return 0;

  let streak = 1;

  for (let i = 0; i < uniqueDays.length - 1; i++) {
    const currentDay = getStartOfDay(uniqueDays[i]);
    const nextDay = getStartOfDay(uniqueDays[i + 1]);
    const diff = getDayDifference(currentDay, nextDay);

    if (diff === 1) streak += 1;
    else break;
  }

  return streak;
}

export function MoveProvider({ children }: { children: ReactNode }) {
  const [completedMoves, setCompletedMoves] = useState<CompletedMove[]>([]);
  const [preferences, setPreferencesState] =
    useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [hasFinishedOnboarding, setHasFinishedOnboarding] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function loadAllData() {
      try {
        const savedMoves = await AsyncStorage.getItem(MOVES_STORAGE_KEY);
        const savedPreferences = await AsyncStorage.getItem(
          PREFERENCES_STORAGE_KEY
        );
        const savedOnboarding = await AsyncStorage.getItem(
          ONBOARDING_STORAGE_KEY
        );
        console.log("Onboarding complete flag:", await AsyncStorage.getItem("hasCompletedOnboarding"));

        if (savedMoves) {
          setCompletedMoves(JSON.parse(savedMoves));
        }

        if (savedPreferences) {
          const parsed = JSON.parse(savedPreferences);
          setPreferencesState({
            ...DEFAULT_PREFERENCES,
            ...parsed,
            interests: Array.isArray(parsed?.interests) ? parsed.interests : [],
            preferredTimes: Array.isArray(parsed?.preferredTimes)
              ? parsed.preferredTimes
              : DEFAULT_PREFERENCES.preferredTimes,
            homeCity: typeof parsed?.homeCity === "string" ? parsed.homeCity : "",
            schoolOrWork:
              typeof parsed?.schoolOrWork === "string" ? parsed.schoolOrWork : "",
            ageRange:
              parsed?.ageRange === "under18" ||
              parsed?.ageRange === "18-21" ||
              parsed?.ageRange === "18-24" ||
              parsed?.ageRange === "25-34" ||
              parsed?.ageRange === "35-44" ||
              parsed?.ageRange === "45+" ||
              parsed?.ageRange === "prefer_not"
                ? parsed.ageRange
                : "prefer_not",
            socialBattery:
              parsed?.socialBattery === "introvert" ||
              parsed?.socialBattery === "ambivert" ||
              parsed?.socialBattery === "extrovert"
                ? parsed.socialBattery
                : "ambivert",
            hungerPreference:
              parsed?.hungerPreference === "hungry" ||
              parsed?.hungerPreference === "not_hungry" ||
              parsed?.hungerPreference === "any"
                ? parsed.hungerPreference
                : "any",
            transportMode:
              parsed?.transportMode === "walking" ||
              parsed?.transportMode === "cycling" ||
              parsed?.transportMode === "transit" ||
              parsed?.transportMode === "driving"
                ? parsed.transportMode
                : "driving",
          });
        }

        const legacyOnboarding = await AsyncStorage.getItem("hasCompletedOnboarding");
        if (savedOnboarding === "true" || legacyOnboarding === "true") {
          setHasFinishedOnboarding(true);
        }
      } catch (error) {
        console.log("Failed to load app data", error);
      } finally {
        setIsLoaded(true);
      }
    }

    loadAllData();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    async function saveAll() {
      try {
        await AsyncStorage.setItem(
          MOVES_STORAGE_KEY,
          JSON.stringify(completedMoves)
        );
        await AsyncStorage.setItem(
          PREFERENCES_STORAGE_KEY,
          JSON.stringify(preferences)
        );
        await AsyncStorage.setItem(
          ONBOARDING_STORAGE_KEY,
          String(hasFinishedOnboarding)
        );
      } catch (error) {
        console.log("Failed to save app data", error);
      }
    }

    saveAll();
  }, [completedMoves, preferences, hasFinishedOnboarding, isLoaded]);

  function addCompletedMove(
    move: string,
    category: MoveCategory,
    durationMinutes: number
  ) {
    const newMove: CompletedMove = {
      move,
      category,
      durationMinutes,
      completedAt: new Date().toISOString(),
    };

    setCompletedMoves((prev) => [newMove, ...prev]);
  }

  function clearMoves() {
    setCompletedMoves([]);
  }

  function setInterests(selectedInterests: string[]) {
    setPreferencesState((prev) => ({
      ...prev,
      interests: selectedInterests,
    }));
  }

  function setPreferences(next: UserPreferences) {
    setPreferencesState(next);
  }

  function setPreferencesAndFinishOnboarding(next: UserPreferences) {
    setPreferencesState(next);
    setHasFinishedOnboarding(true);
  }

  function resetOnboarding() {
    setPreferencesState(DEFAULT_PREFERENCES);
    setHasFinishedOnboarding(false);
  }

  const streakCount = calculateStreak(completedMoves);

  const value = useMemo(
    () => ({
      completedMoves,
      addCompletedMove,
      clearMoves,
      preferences,
      interests: preferences.interests,
      setInterests,
      setPreferences,
      setPreferencesAndFinishOnboarding,
      resetOnboarding,
      hasFinishedOnboarding,
      streakCount,
      isLoaded,
    }),
    [completedMoves, preferences, hasFinishedOnboarding, streakCount, isLoaded]
  );

  return <MoveContext.Provider value={value}>{children}</MoveContext.Provider>;
}

export function useMoveStore() {
  const context = useContext(MoveContext);

  if (!context) {
    throw new Error("useMoveStore must be used inside MoveProvider");
  }

  return context;
}