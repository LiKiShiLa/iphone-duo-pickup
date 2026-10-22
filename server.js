/**
 * iPhone Duo · Taiwan Apple Store pickup radar
 * Node.js 20+, zero dependencies.
 * Reads Apple's public-facing, undocumented retail pickup endpoint.
 * No login, checkout, purchase, or reservation is performed.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC = path.resolve(__dirname, 'public');
const PARTS = Object.freeze({
  '256-white': 'MK2D4ZP/A', '256-black': 'MK2E4ZP/A',
  '512-white': 'MK2F4ZP/A', '512-black': 'MK2G4ZP/A',
  '1tb-white': 'MK2H4ZP/A', '1tb-black': 'MK2J4ZP/A',
  '2tb-white': 'MK2K4ZP/A', '2tb-black': 'MK2L4ZP/A'
});
const STORE_LIST = [
  { id: 'taipei101', storeNumber: 'R713', name: '台北 101', address: '台北市信義區市府路 45 號', officialUrl:'https://www.apple.com/tw/retail/taipei101/' },
  { id: 'xinyia13', storeNumber: 'R694', name: '信義 A13', address: '台北市信義區松壽路 13 號', officialUrl:'https://www.apple.com/tw/retail/xinyia13/' }
];
const ALL_PARTS = Object.values(PARTS);
const CACHE_MS = 45_000;
let cached = null;
let pending = null;

function classifyStore(s) {
  // Official Apple Store numbers are more reliable than display names, which vary by locale.
  const num = String(s?.storeNumber || s?.retailStore?.storeNumber || '').toUpperCase();
  if (num === 'R713') return 'taipei101';
  if (num === 'R694') return 'xinyia13';
  const str = [s?.storeName, s?.storeTitle, s?.retailStore?.storeName, s?.retailStore?.storeTitle,
    s?.retailStore?.address?.companyName, s?.retailStore?.address?.street,
    s?.retailStore?.address?.streetAddress].filter(Boolean).join(' ').toLowerCase();
  if (/101|台北一零一|taipei\s*101|臺北\s*101/.test(str)) return 'taipei101';
  if (/a13|信義|xinyi/.test(str)) return 'xinyia13';
  return null;
}
function normalizeAvailability(json) {
  // Apple's live Taiwan endpoint (verified 2026-10-22) returns body.stores.
  // Older versions of the API used body.content.pickupMessage.stores.
  const stores = [json?.body?.stores, json?.body?.content?.pickupMessage?.stores]
    .find(Array.isArray);
  if (!stores) throw new Error('Apple 回傳格式無法辨識（未找到門市資料），無法確認庫存');
  if (!stores.length) throw new Error('Apple 未回傳任何門市，無法確認庫存');
  const output = STORE_LIST.map(s => ({ ...s, inventory: Object.fromEntries(ALL_PARTS.map(part => [part, { status: 'unknown', quote: '無法確認此規格' }])) }));
  let recognized = 0;
  let meaningful = 0;
  for (const store of stores) {
    const id = classifyStore(store);
    if (!id) continue;
    const target = output.find(x => x.id === id);
    recognized++;
    const avail = store.partsAvailability;
    if (!avail || typeof avail !== 'object' || Array.isArray(avail)) continue;
    for (const part of ALL_PARTS) {
      const row = avail[part] || avail[part.toUpperCase()] || avail[part.replace('/', '%2F')];
      if (!row) continue;
      const display = String(row.pickupDisplay || '').toLowerCase();
      const status = display === 'available' ? 'available' :
        display === 'unavailable' ? 'unavailable' : 'unknown';
      if (status !== 'unknown') meaningful++;
      const quote = [row.pickupSearchQuote, row.pickupDisplayQuote,
        row.messageTypes?.regular?.storePickupQuote].find(v => typeof v === 'string' && v.trim()) || '';
      target.inventory[part] = { status, quote, rawStatus: display };
    }
  }
  if (!recognized) throw new Error('Apple 回傳了門市，但無法辨識台北 101（R713）或信義 A13（R694）');
  if (!meaningful) throw new Error('Apple 未提供可辨識的取貨狀態，請至官網再次確認');
  return { ok: true, checkedAt: new Date().toISOString(), source: 'Apple 台灣官方取貨查詢', stores: output };
}
async function fetchApple() {
  const url = new URL('https://www.apple.com/tw/shop/retail/pickup-message');
  url.searchParams.set('pl', 'true');
  url.searchParams.set('mts.0', 'regular');
  url.searchParams.set('location', '110');
  ALL_PARTS.forEach((part, idx) => url.searchParams.set(`parts.${idx}`, part));
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 18_000);
  try {
    const r = await fetch(url, {
      signal: ac.signal, redirect: 'follow',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.6',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        'Referer': 'https://www.apple.com/tw/shop/buy-iphone/iphone-duo'
      }
    });
    if (!r.ok) throw new Error(r.status === 541 || r.status === 403 || r.status === 429
      ? `Apple 限制自動查詢（HTTP ${r.status}），目前無法確認庫存`
      : `Apple 查詢服務回傳 HTTP ${r.status}`);
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error('Apple 沒有回傳可解析的庫存資料'); }
    if (json?.head?.status && String(json.head.status) !== '200') throw new Error(`Apple 查詢狀態：${json.head.status}`);
    return normalizeAvailability(json);
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('Apple 查詢逾時，庫存狀態未知');
    throw e;
  } finally { clearTimeout(timer); }
}
function send(res, status, obj, cache = false) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache ? 'private, max-age=20' : 'no-store',
    'X-Content-Type-Options':'nosniff' });
  res.end(JSON.stringify(obj));
}
async function handle(req, res) {
  let u;
  try { u = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return send(res, 400, {error:'無效網址'}); }
  if (u.pathname === '/api/check') {
    if (req.method !== 'GET') return send(res, 405, {error:'只支援 GET'});
    if (cached && Date.now() - cached.time < CACHE_MS) return send(res, 200, {...cached.data, cacheAgeSeconds: Math.round((Date.now()-cached.time)/1000)}, true);
    if (!pending) {
      pending = fetchApple().then(data => { cached = {time:Date.now(), data}; return data; }).finally(() => {pending = null;});
    }
    try { return send(res, 200, await pending); }
    catch (e) { return send(res, 503, {ok:false, error:e.message || '官方查詢失敗', checkedAt: new Date().toISOString()}); }
  }
  if (u.pathname === '/api/config') return send(res, 200, { parts: PARTS, stores:STORE_LIST, minRefreshSeconds:60 });
  if (u.pathname === '/health') return send(res, 200, {ok:true, version:'1.1', service:'iPhone Duo Pickup Radar'});
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {error:'Method not allowed'});
  let file = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
  if (!['index.html','style.css','app.js','favicon.svg'].includes(file)) {
    res.writeHead(404); return res.end('Not found');
  }
  const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript; charset=utf-8';
  try {
    const data = await fs.readFile(path.join(PUBLIC, file));
    res.writeHead(200, {'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {res.writeHead(404); res.end('Not found');}
}
if (require.main === module) {
  http.createServer((req,res) => {handle(req,res).catch(err => send(res,500,{ok:false,error:err.message}));}).listen(PORT, HOST, () => {
    console.log(`iPhone Duo 取貨雷達啟動：http://${HOST}:${PORT}`);
    console.log('資料來源：Apple 台灣零售取貨介面；查詢結果取決於 Apple 服務是否允許。');
  });
}
module.exports = {PARTS, STORE_LIST, classifyStore, normalizeAvailability, fetchApple, handle};
