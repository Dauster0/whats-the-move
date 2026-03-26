import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "elsewhere_plus_entitlements_v1";
const MS_DAY = 86400000;
const MS_HOUR = 3600000;
const PAYWALL_COOLDOWN_MS = 48 * MS_HOUR;

export type EntitlementsRecord = {
  isSubscribed: boolean;
  trialEndsAt: string | null;
  /** First time user got Plus (trial start or purchase) — for “sharper picks” timing */
  plusStartedAt: string | null;
  lastPaywallDismissedAt: string | null;
  /** Once per calendar day when home gains focus after onboarding */
  sessionOpenCount: number;
  lastSessionOpenRecordedDay: string | null;
  refreshYmd: string | null;
  refreshCount: number;
  thirdRefreshUpsellDismissedYmd: string | null;
  trialEndingBannerShown: boolean;
  sharperPicksToastShown: boolean;
  fiveSessionUpsellShown: boolean;
};

const defaultState: EntitlementsRecord = {
  isSubscribed: false,
  trialEndsAt: null,
  plusStartedAt: null,
  lastPaywallDismissedAt: null,
  sessionOpenCount: 0,
  lastSessionOpenRecordedDay: null,
  refreshYmd: null,
  refreshCount: 0,
  thirdRefreshUpsellDismissedYmd: null,
  trialEndingBannerShown: false,
  sharperPicksToastShown: false,
  fiveSessionUpsellShown: false,
};

export function ymdLocal(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function isPlusEffective(r: EntitlementsRecord): boolean {
  if (r.isSubscribed) return true;
  if (r.trialEndsAt) {
    const t = new Date(r.trialEndsAt).getTime();
    if (!Number.isNaN(t) && t > Date.now()) return true;
  }
  return false;
}

export async function loadEntitlements(): Promise<EntitlementsRecord> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    const j = JSON.parse(raw) as Partial<EntitlementsRecord>;
    return { ...defaultState, ...j };
  } catch {
    return { ...defaultState };
  }
}

export async function saveEntitlements(patch: Partial<EntitlementsRecord>): Promise<EntitlementsRecord> {
  const cur = await loadEntitlements();
  const next = { ...cur, ...patch };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** True if we may show an upgrade prompt (48h after last “Maybe later” on paywall). */
export async function canShowPaywallAfterDismiss(): Promise<boolean> {
  const cur = await loadEntitlements();
  if (!cur.lastPaywallDismissedAt) return true;
  return Date.now() - new Date(cur.lastPaywallDismissedAt).getTime() >= PAYWALL_COOLDOWN_MS;
}

export async function dismissPaywall(): Promise<void> {
  await saveEntitlements({ lastPaywallDismissedAt: new Date().toISOString() });
}

export async function startFreeTrial(): Promise<EntitlementsRecord> {
  const cur = await loadEntitlements();
  const trialEndsAt = new Date(Date.now() + 7 * MS_DAY).toISOString();
  return saveEntitlements({
    trialEndsAt,
    plusStartedAt: cur.plusStartedAt ?? new Date().toISOString(),
    trialEndingBannerShown: false,
  });
}

/** Simulated purchase — wire StoreKit later. */
export async function grantPlusSubscription(): Promise<EntitlementsRecord> {
  const cur = await loadEntitlements();
  return saveEntitlements({
    isSubscribed: true,
    trialEndsAt: null,
    plusStartedAt: cur.plusStartedAt ?? new Date().toISOString(),
  });
}

async function rolloverRefreshDay(cur: EntitlementsRecord): Promise<EntitlementsRecord> {
  const y = ymdLocal();
  if (cur.refreshYmd === y) return cur;
  return saveEntitlements({
    refreshYmd: y,
    refreshCount: 0,
    thirdRefreshUpsellDismissedYmd: null,
  });
}

export async function canFreeUserDeckRefresh(): Promise<boolean> {
  const base = await loadEntitlements();
  const cur = await rolloverRefreshDay(base);
  if (isPlusEffective(cur)) return true;
  return cur.refreshCount < 3;
}

/** Call after a successful deck fetch from pull-to-refresh / filter change / initial load. */
export async function consumeDeckRefreshCredit(): Promise<{
  countAfter: number;
  justUsedThird: boolean;
}> {
  const base = await loadEntitlements();
  let cur = await rolloverRefreshDay(base);
  if (isPlusEffective(cur)) {
    return { countAfter: cur.refreshCount, justUsedThird: false };
  }
  const refreshCount = cur.refreshCount + 1;
  cur = await saveEntitlements({ refreshCount });
  return { countAfter: refreshCount, justUsedThird: refreshCount === 3 };
}

export async function dismissThirdRefreshUpsell(): Promise<void> {
  await saveEntitlements({ thirdRefreshUpsellDismissedYmd: ymdLocal() });
}

export function isThirdRefreshUpsellDismissedToday(r: EntitlementsRecord): boolean {
  return r.thirdRefreshUpsellDismissedYmd === ymdLocal();
}

export async function recordAppSessionOpen(): Promise<EntitlementsRecord> {
  const cur = await loadEntitlements();
  const today = ymdLocal();
  if (cur.lastSessionOpenRecordedDay === today) return cur;
  return saveEntitlements({
    sessionOpenCount: cur.sessionOpenCount + 1,
    lastSessionOpenRecordedDay: today,
  });
}

export function trialDaysRemaining(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / MS_DAY));
}

export function shouldShowTrialEndingBanner(r: EntitlementsRecord): boolean {
  if (!isPlusEffective(r) || r.isSubscribed) return false;
  if (r.trialEndingBannerShown) return false;
  return trialDaysRemaining(r.trialEndsAt) === 2;
}

export async function markTrialEndingBannerShown(): Promise<void> {
  await saveEntitlements({ trialEndingBannerShown: true });
}

export function shouldShowSharperPicksLine(r: EntitlementsRecord): boolean {
  if (!isPlusEffective(r) || r.sharperPicksToastShown) return false;
  if (!r.plusStartedAt) return false;
  const started = new Date(r.plusStartedAt).getTime();
  if (Number.isNaN(started)) return false;
  return Date.now() - started >= 14 * MS_DAY;
}

export async function markSharperPicksLineShown(): Promise<void> {
  await saveEntitlements({ sharperPicksToastShown: true });
}

/** Trial window ended and not subscribed — clears trial. */
export async function expireTrialIfNeeded(): Promise<boolean> {
  const cur = await loadEntitlements();
  if (cur.isSubscribed) return false;
  if (!cur.trialEndsAt) return false;
  if (new Date(cur.trialEndsAt).getTime() > Date.now()) return false;
  await saveEntitlements({
    trialEndsAt: null,
    trialEndingBannerShown: false,
  });
  return true;
}

export function isWildcardLocked(s: { deckRole?: string }, plus: boolean): boolean {
  if (plus) return false;
  const role = String(s.deckRole || "").toLowerCase();
  return role === "wildcard";
}

export async function markFiveSessionUpsellShown(): Promise<void> {
  await saveEntitlements({ fiveSessionUpsellShown: true });
}
