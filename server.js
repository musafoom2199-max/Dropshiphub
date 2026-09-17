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

app.get('/', (req, res) => res.send('DropshipHub V3 — MA fashion house ✅'));
app.get('/api/health', (req, res) => res.json({ status:'ok', version:'V3', shopify_domain: SHOPIFY_DOMAIN, has_token:!!SHOPIFY_TOKEN, has_cj:!!CJ_API_KEY, margin:MARGIN, time:new Date().toISOString() }));

// NEW — This makes My Store tab work!
app.get('/api/shopify/products', async (req, res) => {
  try {
    const r = await shopify.get('/products.json?limit=50&order=created_at desc');
    const products = r.data.products.map(p => ({ 
      id:p.id, title:p.title, handle:p.handle, status:p.status, 
      price:p.variants?.[0]?.price, image:p.images?.[0]?.src, 
      admin_url:`https://${SHOPIFY_DOMAIN}/admin/products/${p.id}`, 
      store_url:`https://${SHOPIFY_DOMAIN}/products/${p.handle}` 
    }));
    res.json({ success:true, count:products.length, products });
  } catch(e) {
    res.status(500).json({ error:'Shopify fetch failed', details:e.response?.data||e.message });
  }
});

const MOCK_ABAYAS = [
  { pid:'mock-noor-001', productNameEn:'Noor Embroidered Abaya - Midnight Black', sellPrice:'68.00', productImage:'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=500', images:['https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600'], categoryName:'Abaya', description:'Luxury embroidered abaya' },
  { pid:'mock-sahara-002', productNameEn:'Sahara Linen Maxi Dress - Desert Sand', sellPrice:'55.00', productImage:'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=500', images:['https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600'], categoryName:'Maxi Dress', description:'Breathable linen maxi dress' }
];

app.get('/api/search', async (req, res) => {
  const { q='abaya' } = req.query;
  if (!process.env.CJ_API_KEY) return res.json({ success:true, mock:true, data:{ list:MOCK_ABAYAS } });
  try { const r = await axios.get('https://developers.cjdropshipping.com/api2.0/v1/product/list', { headers:{ 'CJ-Access-Token':process.env.CJ_API_KEY }, params:{ keyword:q, pageNum:1, pageSize:20 } }); res.json(r.data); }
  catch(e){ res.json({ mock:true, data:{ list:MOCK_ABAYAS } }); }
});

app.post('/api/import', async (req, res) => {
  try {
    const { cjProduct } = req.body;
    const cjPrice = parseFloat(cjProduct.sellPrice||68);
    const myPrice = (cjPrice*(1+MARGIN)).toFixed(2);
    const shopifyProduct = { product:{ title:cjProduct.productNameEn, body_html:cjProduct.description, vendor:'MA Fashion House', product_type:cjProduct.categoryName||'Abaya', tags:'abaya, MA fashion', images:(cjProduct.images||[cjProduct.productImage]).slice(0,5).map(src=>({src:typeof src==='string'?src:src})), variants:[{ price:myPrice, sku:cjProduct.pid, inventory_management:null }] } };
    const r = await shopify.post('/products.json', shopifyProduct);
    res.json({ success:true, shopifyProduct:r.data.product, myPrice, cjPrice });
  } catch(e) {
    let d=e.response?.data||e.message;
    if(typeof d==='string'&&d.includes('<!DOCTYPE')) return res.status(500).json({ error:'Token mismatch! Regenerate token!', details:d.substring(0,200) });
    res.status(500).json({ error:'Import failed', details:d });
  }
});

app.use((err,req,res,next)=>res.status(500).json({ error:err.message }));
app.listen(PORT, ()=>console.log(`V3 listening on ${PORT}`));
