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

console.log('ENV CHECK:', { 
  SHOPIFY_DOMAIN: !!SHOPIFY_DOMAIN, 
  SHOPIFY_TOKEN: !!SHOPIFY_TOKEN ? 'SET' : 'MISSING',
  CJ_API_KEY: !!CJ_API_KEY ? 'SET' : 'MISSING',
  MARGIN 
});

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_DOMAIN}/admin/api/2024-07`,
  headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' }
});

app.get('/', (req, res) => {
  res.send('DropshipHub running — MA fashion house connected ✅');
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    shopify_domain: SHOPIFY_DOMAIN || 'MISSING - SET IN RENDER ENV',
    has_token: !!SHOPIFY_TOKEN,
    has_cj: !!CJ_API_KEY,
    margin: MARGIN, 
    time: new Date().toISOString() 
  });
});

app.get('/api/search', async (req, res) => {
  try {
    const { q = 'fashion', keyword } = req.query;
    const searchKey = q || keyword || 'fashion';
    
    if (!CJ_API_KEY) {
      return res.json({ 
        error: 'CJ_API_KEY missing in Render env - showing mock',
        mock: true,
        data: { list: [] } 
      });
    }

    const r = await axios.get('https://developers.cjdropshipping.com/api2.0/v1/product/list', {
      headers: { 'CJ-Access-Token': CJ_API_KEY },
      params: { keyword: searchKey, pageNum: 1, pageSize: 20 }
    });
    res.json(r.data);
  } catch (e) {
    console.error('CJ search error:', e.response?.data || e.message);
    res.status(200).json({ 
      error: 'CJ API failed - using mock',
      details: e.response?.data || e.message,
      mock: true
    });
  }
});

app.get('/api/cj/search', async (req, res) => {
  try {
    const { keyword = 'fashion', page = 1 } = req.query;
    const r = await axios.get('https://developers.cjdropshipping.com/api2.0/v1/product/list', {
      headers: { 'CJ-Access-Token': CJ_API_KEY },
      params: { keyword, pageNum: page, pageSize: 20 }
    });
    res.json(r.data);
  } catch (e) {
    console.error('CJ error', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

app.post('/api/import', async (req, res) => {
  try {
    console.log('Import body:', JSON.stringify(req.body).substring(0, 500));
    
    if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
      return res.status(500).json({ 
        error: 'SHOPIFY_DOMAIN or SHOPIFY_TOKEN missing in Render Environment Variables! Go to Render -> Environment -> Add them.',
        has_domain: !!SHOPIFY_DOMAIN,
        has_token: !!SHOPIFY_TOKEN
      });
    }

    const { cjProduct } = req.body;
    if (!cjProduct) return res.status(400).json({ error: 'cjProduct required in body' });
    
    // Handle both real CJ and mock products from dashboard
    const cjPrice = parseFloat(
      cjProduct.sellPrice || 
      cjProduct.productSellPrice || 
      cjProduct.price || 
      cjProduct.productPrice ||
      89.99
    );
    const myPrice = (cjPrice * (1 + MARGIN)).toFixed(2);

    const productName = cjProduct.productNameEn || cjProduct.productName || cjProduct.name || cjProduct.title || 'MA Fashion Product';
    const description = cjProduct.description || productName + ' - Premium quality from MA Fashion House. Imported via DropshipHub.';
    
    // Handle images - mock uses images array of strings, real CJ uses productImageSet
    let imageList = [];
    if (cjProduct.productImageSet && Array.isArray(cjProduct.productImageSet)) {
      imageList = cjProduct.productImageSet.slice(0, 5).map(src => ({ src: typeof src === 'string' ? src : src.productImage || src.image || src.src }));
    } else if (cjProduct.images && Array.isArray(cjProduct.images)) {
      imageList = cjProduct.images.slice(0, 5).map(src => ({ src: typeof src === 'string' ? src : src.src || src.url }));
    } else if (cjProduct.image) {
      imageList = [{ src: typeof cjProduct.image === 'string' ? cjProduct.image : cjProduct.image.src }];
    }

    const shopifyProduct = {
      product: {
        title: productName,
        body_html: description,
        vendor: 'CJdropshipping',
        product_type: cjProduct.categoryName || cjProduct.category || 'Fashion',
        tags: 'cjdropshipping, MA fashion house, dropshiphub, ' + (cjProduct.categoryName || 'fashion'),
        images: imageList,
        variants: [{
          price: myPrice,
          sku: cjProduct.pid || cjProduct.vid || cjProduct.sku || Date.now().toString(),
          inventory_management: null
        }]
      }
    };

    console.log('Sending to Shopify:', JSON.stringify(shopifyProduct).substring(0, 800));
    const r = await shopify.post('/products.json', shopifyProduct);
    console.log('Shopify success:', r.data.product.id);
    res.json({ success: true, shopifyProduct: r.data.product, myPrice, cjPrice });
  } catch (e) {
    console.error('Import error:', e.response?.data || e.message);
    const errorDetail = e.response?.data || e.message;
    res.status(500).json({ 
      error: 'Shopify import failed',
      details: errorDetail,
      hint: 'Check SHOPIFY_DOMAIN and SHOPIFY_TOKEN in Render Env. Domain should be like ma-fashion-house.myshopify.com without https://'
    });
  }
});

// IMPORTANT: Return JSON for all errors, not HTML
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Dropshiphub listening on ${PORT}`);
  console.log(`MA Fashion House connected to ${SHOPIFY_DOMAIN}`);
});
