// Vercel Serverless Function: /api/sectors/sina
// 代理新浪财经获取行业/概念板块数据
const https = require('https');
const http = require('http');

function fetchText(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.sina.com.cn/',
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');

  try {
    const type = req.query.type || 'industry';
    const sinaUrl = type === 'industry'
      ? 'https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php'
      : 'https://money.finance.sina.com.cn/q/view/newFLJK.php?param=class';

    const buf = await fetchText(sinaUrl);
    const raw = decodeGBK(buf);
    const m = raw.match(/=\s*(\{[\s\S]*\})/);
    if (!m) throw new Error('parse error');

    const obj = JSON.parse(m[1]);
    const sectors = [];
    for (const [, val] of Object.entries(obj)) {
      const p = val.split(',');
      if (p.length >= 13) {
        sectors.push({
          name: p[1], count: parseInt(p[2]) || 0,
          changePct: parseFloat(p[5]) || 0,
          volume: parseFloat(p[6]) || 0,
          amount: parseFloat(p[7]) || 0,
          turnover: parseFloat(p[11]) || 0,
          leadName: p[12] || '',
        });
      }
    }
    res.status(200).json({ ok: true, data: sectors, source: 'sina', type });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message, source: 'sina' });
  }
};
