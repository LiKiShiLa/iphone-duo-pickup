const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAvailability, PARTS, classifyStore, fetchApple } = require('../server');
const inventory = Object.fromEntries(Object.values(PARTS).map((x, i) => [x, {pickupDisplay:i===0?'available':'unavailable',pickupSearchQuote:'可取貨'}]));
const fixture = {body:{content:{pickupMessage:{stores:[
 {storeName:'Apple 台北 101',partsAvailability:inventory},
 {storeName:'Apple 信義 A13',partsAvailability:inventory}
]}}}};
test('correctly maps Taiwan store names',()=>{
 assert.equal(classifyStore({retailStore:{address:{companyName:'Apple 信義 A13'}}}), 'xinyia13');
 assert.equal(classifyStore({retailStore:{address:{companyName:'台北 101'}}}), 'taipei101');
});
test('parses all eight Apple part numbers for both stores',()=>{
 const res=normalizeAvailability(fixture);
 assert.equal(res.stores.length,2);
 for(const store of res.stores) {
  assert.equal(Object.keys(store.inventory).length,8);
  assert.equal(store.inventory['MK2D4ZP/A'].status,'available');
  assert.equal(store.inventory['MK2L4ZP/A'].status,'unavailable');
 }
});
test('unknown state when part not returned',()=>{
 const res=normalizeAvailability({body:{content:{pickupMessage:{stores:[{storeName:'Apple 台北 101',partsAvailability:{'MK2D4ZP/A':{pickupDisplay:'available'}}}]}}}});
 assert.equal(res.stores[0].inventory['MK2L4ZP/A'].status,'unknown');
 assert.equal(res.stores[1].inventory['MK2D4ZP/A'].status,'unknown');
});
test('fail closed for malformed responses',()=>{
 assert.throws(()=>normalizeAvailability({}),/回傳格式無法辨識/);
 assert.throws(()=>normalizeAvailability({body:{content:{pickupMessage:{stores:[]}}}}),/未回傳任何門市/);
 assert.throws(()=>normalizeAvailability({body:{content:{pickupMessage:{stores:[{storeName:'X',partsAvailability:inventory}]}}}}),/無法辨識/);
});

// Actual 2026-10-22 Apple Taiwan endpoint structure: body.stores (no body.content).
test('parses current Apple Taiwan body.stores schema (regression)',()=>{
 const current = {head:{status:'200'}, body:{stores:[
  {storeNumber:'R713',storeName:'台北 101', partsAvailability:{
   'MK2D4ZP/A':{pickupDisplay:'unavailable',pickupSearchQuote:'目前無法提供'},
   'MK2E4ZP/A':{pickupDisplay:'available',pickupSearchQuote:'今日可取貨'}}},
  {storeNumber:'R694',storeName:'信義 A13',partsAvailability:{
   'MK2D4ZP/A':{pickupDisplay:'unavailable'}}}
 ]}};
 const res = normalizeAvailability(current);
 assert.equal(res.stores.find(x=>x.id==='taipei101').inventory['MK2D4ZP/A'].status,'unavailable');
 assert.equal(res.stores.find(x=>x.id==='taipei101').inventory['MK2E4ZP/A'].status,'available');
 assert.equal(res.stores.find(x=>x.id==='xinyia13').inventory['MK2D4ZP/A'].status,'unavailable');
 // A SKU absent from the API is unknown, NOT out of stock.
 assert.equal(res.stores.find(x=>x.id==='xinyia13').inventory['MK2E4ZP/A'].status,'unknown');
});
test('prefers immutable store number when localized store name is different',()=>{
 assert.equal(classifyStore({storeNumber:'R713',storeName:'Other language'}),'taipei101');
 assert.equal(classifyStore({retailStore:{storeNumber:'R694'}}),'xinyia13');
});
test('rejects response with stores but no recognizable availability',()=>{
 assert.throws(()=>normalizeAvailability({body:{stores:[
  {storeNumber:'R713',partsAvailability:{'MK2D4ZP/A':{pickupDisplay:'soon'}}}
 ]}}),/未提供可辨識/);
});

test('server can parse the current API response end-to-end',async()=>{
 const originalFetch = global.fetch;
 let calledUrl;
 global.fetch = async (url,opts)=>{
  calledUrl=new URL(url);
  assert.equal(opts.headers.Referer,'https://www.apple.com/tw/shop/buy-iphone/iphone-duo');
  return {ok:true, status:200, text:async()=>JSON.stringify({head:{status:'200'},body:{stores:[
   {storeNumber:'R713',partsAvailability:{'MK2D4ZP/A':{pickupDisplay:'unavailable'}}},
   {storeNumber:'R694',partsAvailability:{'MK2D4ZP/A':{pickupDisplay:'available'}}}
  ]}})};
 };
 try {
  const result=await fetchApple();
  assert.equal(result.stores[0].inventory['MK2D4ZP/A'].status,'unavailable');
  assert.equal(result.stores[1].inventory['MK2D4ZP/A'].status,'available');
  assert.equal(calledUrl.pathname,'/tw/shop/retail/pickup-message');
  assert.equal(calledUrl.searchParams.get('location'),'110');
  assert.equal([...calledUrl.searchParams.keys()].filter(k=>k.startsWith('parts.')).length,8);
 } finally {global.fetch=originalFetch;}
});
