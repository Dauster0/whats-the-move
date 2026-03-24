import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "concierge_recent_titles_v1";
const MAX = 18;

export async function getRecentConciergeTitles(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function pushRecentConciergeTitle(title: string): Promise<void> {
  const t = String(title || "").trim();
  if (t.length < 2) return;
  try {
    const prev = await getRecentConciergeTitles();
    const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
