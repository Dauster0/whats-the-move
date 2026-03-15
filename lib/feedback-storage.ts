import AsyncStorage from "@react-native-async-storage/async-storage";

const FEEDBACK_KEY = "suggestion_feedback_v1";

export type FeedbackValue = "liked" | "disliked";

export type SuggestionFeedback = {
  id: string;
  title: string;
  category: "micro" | "short" | "social";
  value: FeedbackValue;
  updatedAt: string;
};

export async function getSuggestionFeedback(): Promise<SuggestionFeedback[]> {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setSuggestionFeedback(
  item: SuggestionFeedback
): Promise<void> {
  const current = await getSuggestionFeedback();
  const next = [item, ...current.filter((x) => x.id !== item.id)];
  await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify(next));
}

export async function removeSuggestionFeedback(id: string): Promise<void> {
  const current = await getSuggestionFeedback();
  const next = current.filter((x) => x.id !== id);
  await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify(next));
}

export async function clearSuggestionFeedback(): Promise<void> {
  await AsyncStorage.removeItem(FEEDBACK_KEY);
}

export function getFeedbackMap(items: SuggestionFeedback[]) {
  const map = new Map<string, SuggestionFeedback>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
}