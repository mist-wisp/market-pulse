// Vercel Serverless Function: /api/indices
// 代理腾讯行情API获取大盘指数
const https = require('https');
const http = require('http');

function fetchText(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://gu.qq.com/',
      },
      timeout,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function decodeGBK(buf) {
  try { return new TextDecoder('gbk').decode(buf); }
  catch { return buf.toString('utf-8'); }
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');

  try {
    const codes = req.query.codes || 'sh000001,sz399001,sz399006,sh000688,sz899050,sz399005';
    const buf = await fetchText(`https://qt.gtimg.cn/q=${codes}`);
    const raw = decodeGBK(buf);
    const indices = [];
    for (const line of raw.split(';')) {
      if (!line.includes('~') || line.includes('none_match')) continue;
      const p = line.split('~');
      if (p.length > 35) {
        indices.push({
          name: p[1], code: p[2],
          price: parseFloat(p[3]),
          change: parseFloat(p[31] || p[4]),
          changePct: parseFloat(p[32] || p[5]),
          volume: parseFloat(p[6]),
          amount: parseFloat(p[37] || p[7]),
        });
      }
    }
    res.status(200).json({ ok: true, data: indices, source: 'tencent' });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message, source: 'tencent' });
  }
};
