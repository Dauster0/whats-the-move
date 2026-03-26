import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@concierge/last-committed-v1";

type CommittedMove = {
  title: string;
  category: string;
  committedAt: string;
  ratedAt?: string;
};

export async function saveCommittedMove(title: string, category: string): Promise<void> {
  const data: CommittedMove = { title, category, committedAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

export async function getPendingCommittedCheckIn(): Promise<CommittedMove | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CommittedMove;
    if (data.ratedAt) return null;
    const ageMs = Date.now() - new Date(data.committedAt).getTime();
    if (ageMs > 18 * 60 * 60 * 1000) return null; // expire after 18h
    return data;
  } catch {
    return null;
  }
}

export async function dismissCommittedCheckIn(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as CommittedMove;
    data.ratedAt = new Date().toISOString();
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}
