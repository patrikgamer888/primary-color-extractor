// Fast colour‑extract API  – returns only HEX (pretty‑printed)
const fetch = require('node-fetch');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

exports.handler = async (event) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  const imageUrl = event.queryStringParameters?.imageUrl;
  if (!imageUrl) return { statusCode: 400, headers, body: 'imageUrl is required' };

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
    const buf = await res.buffer();

    // Decode
    const img = await loadImage(buf);

    // Speed: down‑scale large images to max 64 px in either dimension
    const MAX = 64;
    const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    // Count colours (quantised to 16 levels per channel for speed)
    const { data } = ctx.getImageData(0, 0, w, h);
    const counts = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue; // skip transparent
      const r = data[i] & 0xF0;
      const g = data[i + 1] & 0xF0;
      const b = data[i + 2] & 0xF0;
      const key = (r << 16) | (g << 8) | b;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    // Get most frequent bucket
    let topKey = 0, topCount = 0;
    for (const [k, c] of counts) if (c > topCount) { topKey = k; topCount = c; }

    const hex = '#' + topKey.toString(16).padStart(6, '0').toUpperCase();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ hex }, null, 2), // pretty JSON
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: e.message }, null, 2) };
  }
};
