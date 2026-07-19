// Vercel Serverless Function: /api/sectors/em
// 代理东方财富获取板块资金流数据 (JSONP -> JSON)
const https = require('https');
const http = require('http');

function fetchText(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://data.eastmoney.com/',
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');

  try {
    const fs = req.query.fs || 'm:90+t:2+f:!50';
    const pz = req.query.pz || '80';
    const fid = req.query.fid || 'f62';
    const cb = '_emcb' + Date.now();
    const emUrl = `https://push2.eastmoney.com/api/qt/clist/get?fid=${fid}&po=1&pz=${pz}&pn=1&np=1&fltt=2&invt=2&ut=b2884a393a59ad64002292a3e90d46a5&fs=${fs}&fields=f12,f14,f2,f3,f4,f5,f6,f7,f8,f10,f13,f15,f16,f17,f18,f20,f62,f184,f66,f69,f104,f105&cb=${cb}`;

    const buf = await fetchText(emUrl);
    const raw = buf.toString('utf-8');
    const jsonStr = raw.replace(new RegExp(`^${cb}\\(`), '').replace(/\)\s*;?\s*$/, '');
    const data = JSON.parse(jsonStr);

    res.status(200).json({
      ok: true,
      data: data?.data?.diff || [],
      total: data?.data?.total || 0,
      source: 'eastmoney',
    });
  } catch (e) {
    res.status(200).json({ ok: false, data: [], error: e.message, source: 'eastmoney' });
  }
};
