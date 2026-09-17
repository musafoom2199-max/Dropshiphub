import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';
dotenv.config();
const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const CJ_API_KEY = process.env.CJ_API_KEY;
const MARGIN = parseFloat(process.env.PROFIT_MARGIN || '0.15');
const PORT = process.env.PORT || 10000;

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_DOMAIN}/admin/api/2024-07`,
  headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' }
});

app.get('/', (req, res) => res.send('DropshipHub V4 — 2026 API Fixed ✅'));
app.get('/api/health', (req, res) => res.json({ status:'ok', version:'V4-2026-fix', shopify_domain: SHOPIFY_DOMAIN, has_token:!!SHOPIFY_TOKEN, has_cj:!!CJ_API_KEY, cj_key_preview: CJ_API_KEY? CJ_API_KEY.substring(0,10)+'...' : 'MISSING', margin:MARGIN, time:new Date().toISOString() }));

app.get('/api/shopify/products', async (req, res) => {
  try {
    const r = await shopify.get('/products.json?limit=50&order=created_at desc');
    const products = r.data.products.map(p => ({ id:p.id, title:p.title, handle:p.handle, status:p.status, price:p.variants?.[0]?.price, image:p.images?.[0]?.src, admin_url:`https://${SHOPIFY_DOMAIN}/admin/products/${p.id}`, store_url:`https://${SHOPIFY_DOMAIN}/products/${p.handle}` }));
    res.json({ success:true, count:products.length, products });
  } catch(e) { res.status(500).json({ error:'Shopify fetch failed', details:e.response?.data||e.message }); }
});

// V4 MOCK — Generates ANY product you search!
function genMock(keyword){
  const kw = keyword.charAt(0).toUpperCase()+keyword.slice(1);
  const imgs = {
    shoes:['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500','https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=500'],
    bag:['https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=500','https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=500'],
    watch:['https://images.unsplash.com/photo-1524805444973-bf390e004138?w=500'],
    abaya:['https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=500'],
    default:['https://images.unsplash.com/photo-1445205170230-053b83016050?w=500']
  };
  const imgList = imgs[keyword.toLowerCase()] || imgs.default;
  return [1,2,3,4,5].map(i=>({
    pid:`mock-${keyword}-${i}`, productNameEn:`${kw} Premium ${kw} Style ${i} - MA Fashion`, productName:`${kw} Style ${i}`, sellPrice:(45+i*7).toString(), productImage:imgList[0], images:imgList, productImageSet:imgList, categoryName:kw, description:`Premium ${keyword} for MA Fashion House. High quality, fast shipping from CJdropshipping. Perfect for Nigerian market.`
  }));
}

app.get('/api/search', async (req, res) => {
  try {
    const { q='abaya' } = req.query;
    const keyword = (q||'abaya').toLowerCase();
    console.log('Search for:', keyword, 'Has CJ:',!!CJ_API_KEY);

    if (!CJ_API_KEY) {
      console.log('No CJ key - using dynamic mock for', keyword);
      return res.json({ success:true, mock:true, keyword, count:5, data:{ list: genMock(keyword) } });
    }

    // Try real CJ API with your 2026 token
    try {
      const r = await axios.get('https://developers.cjdropshipping.com/api2.0/v1/product/list', {
        headers: { 'CJ-Access-Token': CJ_API_KEY },
        params: { keyword, pageNum:1, pageSize:20 }
      });
      console.log('CJ success, found:', r.data?.data?.list?.length);
      // If CJ returns empty, use dynamic mock so you still see something
      if (!r.data?.data?.list || r.data.data.list.length===0) {
        return res.json({ success:true, mock:true, fallback:true, keyword, data:{ list: genMock(keyword) } });
      }
      res.json(r.data);
    } catch(cjErr){
      console.error('CJ API failed with 2026 token:', cjErr.response?.data || cjErr.message);
      // Return real error so you know, plus mock fallback so UI still works
      res.json({ success:true, mock:true, cj_error: cjErr.response?.data || cjErr.message, keyword, data:{ list: genMock(keyword) } });
    }
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/import', async (req, res) => {
  try {
    const { cjProduct } = req.body;
    const cjPrice = parseFloat(cjProduct.sellPrice||50);
    const myPrice = (cjPrice*(1+MARGIN)).toFixed(2);
    const shopifyProduct = { product:{ title:cjProduct.productNameEn, body_html:cjProduct.description, vendor:'MA Fashion House', product_type:cjProduct.categoryName||'Fashion', tags:`${req.body.q||'fashion'}, MA fashion`, images:(cjProduct.images||[cjProduct.productImage]).slice(0,5).map(src=>({src:typeof src==='string'?src:src})), variants:[{ price:myPrice, sku:cjProduct.pid, inventory_management:null }] } };
    const r = await shopify.post('/products.json', shopifyProduct);
    res.json({ success:true, shopifyProduct:r.data.product, myPrice, cjPrice });
  } catch(e){ res.status(500).json({ error:'Import failed', details:e.response?.data||e.message }); }
});

app.use((err,req,res,next)=>res.status(500).json({ error:err.message }));
app.listen(PORT, ()=>console.log(`V4 listening on ${PORT} - 2026 token fix`));
