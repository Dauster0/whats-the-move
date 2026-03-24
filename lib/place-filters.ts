/**
 * Filters for "going out" suggestions — exclude errands, groceries, and
 * family venues that are closed or inappropriate late at night.
 */

const GROCERY_NAME_RE =
  /\b(trader\s*joe'?s?|whole\s*foods|safeway|ralphs|vons|pavilions|albertsons|kroger|publix|aldi|lidl|costco|walmart\s*supercenter|99\s*ranch|hmart|h\s*mart|sprouts|gelson'?s|smart\s*&\s*final|food\s*4\s*less|super\s*market|supermarket|grocery\s*outlet|grocery\s*store)\b/i;

/** True if this is basically grocery shopping / errands, not a night out. */
export function isGroceryOrErrandPlace(
  sourceName: string,
  exactTitle?: string,
  category?: string
): boolean {
  const s = `${sourceName || ""} ${exactTitle || ""}`.toLowerCase();
  if (GROCERY_NAME_RE.test(s)) return true;
  const cat = (category || "").toLowerCase();
  if (cat === "supermarket" || cat === "grocery_store" || cat === "convenience_store") {
    return true;
  }
  return false;
}

const LATE_NIGHT_FAMILY_RE =
  /\b(chuck\s*e\.?\s*cheese|chuck\s*e\s*cheese|peter\s*piper\s*pizza|sky\s*zone|urban\s*air|launch\s*trampoline|bounce\s*u|kids\s*fun|children'?s\s*museum)\b/i;

/**
 * After ~9 PM: drop family / early-closing entertainment that isn't a real night out.
 */
export function isLateNightInappropriateVenue(
  sourceName: string,
  exactTitle?: string,
  category?: string
): boolean {
  const s = `${sourceName || ""} ${exactTitle || ""}`;
  if (LATE_NIGHT_FAMILY_RE.test(s)) return true;
  const cat = (category || "").toLowerCase();
  // Family arcades / pizza play places — not great after 9 PM for "the move"
  if (cat === "arcade" && /\b(chuck|pizza|play|kids|family|children)\b/i.test(s)) {
    return true;
  }
  return false;
}
