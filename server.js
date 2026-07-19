// Market Pulse Server - 静态文件 + API代理
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3210;
const WWW = __dirname;

function fetchText(url, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://quote.eastmoney.com/',
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

const MIME = { '.html':'text/html;charset=utf-8', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const p = u.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  try {
    // API Routes
    if (p === '/api/indices') {
      const codes = u.searchParams.get('codes') || 'sh000001,sz399001,sz399006,sh000688,sz899050,sz399005';
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
      json({ ok: true, data: indices, source: 'tencent' });

    } else if (p === '/api/sectors/sina') {
      const type = u.searchParams.get('type') || 'industry';
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
      json({ ok: true, data: sectors, source: 'sina', type });

    } else if (p === '/api/sectors/em') {
      const fs2 = u.searchParams.get('fs') || 'm:90+t:2+f:!50';
      const pz = u.searchParams.get('pz') || '80';
      const fid = u.searchParams.get('fid') || 'f62';
      const cb = '_emcb' + Date.now();
      const emUrl = `https://push2.eastmoney.com/api/qt/clist/get?fid=${fid}&po=1&pz=${pz}&pn=1&np=1&fltt=2&invt=2&ut=b2884a393a59ad64002292a3e90d46a5&fs=${fs2}&fields=f12,f14,f2,f3,f4,f5,f6,f7,f8,f10,f13,f15,f16,f17,f18,f20,f62,f184,f66,f69,f104,f105&cb=${cb}`;
      try {
        const buf = await fetchText(emUrl, 8000);
        const raw = buf.toString('utf-8');
        const jsonStr = raw.replace(new RegExp(`^${cb}\\(`), '').replace(/\)\s*;?\s*$/, '');
        const data = JSON.parse(jsonStr);
        json({ ok: true, data: data?.data?.diff || [], total: data?.data?.total || 0, source: 'eastmoney' });
      } catch (e) {
        json({ ok: false, data: [], error: e.message, source: 'eastmoney' });
      }

    } else {
      // Static files
      let filePath = p === '/' ? '/standalone.html' : p;
      filePath = path.join(WWW, filePath);
      if (!filePath.startsWith(WWW)) { json({error:'forbidden'},403); return; }
      if (!fs.existsSync(filePath)) { json({error:'not found'},404); return; }
      const ext = path.extname(filePath);
      const ct = MIME[ext] || 'application/octet-stream';
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-cache' });
      res.end(data);
    }
  } catch (e) {
    json({ ok: false, error: e.message }, 502);
  }
});

server.listen(PORT, () => console.log(`Market Pulse running at http://localhost:${PORT}`));
