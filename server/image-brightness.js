/**
 * Detect near-white hero images (logos on white) using Sharp + top-band sampling.
 */

let sharpMod = null;
async function getSharp() {
  if (sharpMod) return sharpMod;
  try {
    const m = await import("sharp");
    sharpMod = m.default;
    return sharpMod;
  } catch {
    return null;
  }
}

/**
 * True if average brightness of top ~20% of image > 240 (likely logo on white).
 */
export async function isImageTopRegionPredominantlyWhite(imageUrl) {
  const sharp = await getSharp();
  if (!sharp) return false;
  const url = String(imageUrl || "").trim();
  if (!url.startsWith("http")) return false;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WhatsTheMove/1.0)" },
    });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return false;
    const topH = Math.max(1, Math.floor(meta.height * 0.2));
    const { data, info } = await sharp(buf)
      .extract({ left: 0, top: 0, width: meta.width, height: topH })
      .resize({ width: Math.min(480, meta.width) })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels || 3;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += ch) {
      const rv = data[i];
      const gv = data[i + 1];
      const bv = data[i + 2];
      sum += (rv + gv + bv) / 3;
      n += 1;
    }
    const avg = n ? sum / n : 0;
    return avg > 240;
  } catch {
    return false;
  }
}
