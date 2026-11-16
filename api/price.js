import { lookup } from '../lib/scraper.js';

// Seuls les sites concurrents sont autorisés (évite que l'API serve de proxy ouvert)
const ALLOWED = (process.env.ALLOWED_HOSTS ||
  'yesstyle.com,koreanskincare.com,koreanskincare.nl,yoonah.fr,kbeauty-cosmetics.com,sevenyoung.com,littlewonderland.eu,ksisters.fr,google.com,google.fr')
  .split(',').map((h) => h.trim()).filter(Boolean);

const allowed = (url) => {
  try {
    const { protocol, hostname } = new URL(url);
    return /^https?:$/.test(protocol) && ALLOWED.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch { return false; }
};

export default async function handler(req, res) {
  const { url, q = '' } = req.query;
  if (!url || !allowed(url)) return res.status(400).json({ status: 'erreur', error: 'Site non autorisé' });
  const result = await lookup(url, String(q).slice(0, 200));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(result);
}
