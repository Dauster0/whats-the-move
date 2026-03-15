import AsyncStorage from "@react-native-async-storage/async-storage";

const HIDDEN_SUGGESTIONS_KEY = "hidden_suggestions_v1";

export type HiddenSuggestion = {
  id: string;
  title: string;
  hiddenAt: string;
};

export async function getHiddenSuggestions(): Promise<HiddenSuggestion[]> {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_SUGGESTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addHiddenSuggestion(item: HiddenSuggestion): Promise<void> {
  const current = await getHiddenSuggestions();
  const withoutSameId = current.filter((x) => x.id !== item.id);
  const next = [item, ...withoutSameId];
  await AsyncStorage.setItem(HIDDEN_SUGGESTIONS_KEY, JSON.stringify(next));
}

export async function removeHiddenSuggestion(id: string): Promise<void> {
  const current = await getHiddenSuggestions();
  const next = current.filter((x) => x.id !== id);
  await AsyncStorage.setItem(HIDDEN_SUGGESTIONS_KEY, JSON.stringify(next));
}

export async function clearHiddenSuggestions(): Promise<void> {
  await AsyncStorage.removeItem(HIDDEN_SUGGESTIONS_KEY);
}