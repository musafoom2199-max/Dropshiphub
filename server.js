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

// Root - shows you're live
app.get('/', (req, res) => {
  res.send('DropshipHub running — MA fashion house connected ✅');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', shopify: SHOPIFY_DOMAIN, margin: MARGIN, time: new Date().toISOString() });
});

// Search CJ products
app.get('/api/cj/search', async (req, res) => {
  try {
    const { keyword = 'fashion', page = 1 } = req.query;
    const r = await axios.get('https://developers.cjdropshipping.com/api2.0/v1/product/list', {
      headers: { 'CJ-Access-Token': CJ_API_KEY },
      params: { keyword, pageNum: page, pageSize: 20 }
    });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// Also support /api/search for dashboard
app.get('/api/search', async (req, res) => {
  try {
    const { q = 'fashion', keyword, page = 1 } = req.query;
    const searchKey = q || keyword || 'fashion';
    const r = await axios.get('https://developers.cjdropshipping.com/api2.0/v1/product/list', {
      headers: { 'CJ-Access-Token': CJ_API_KEY },
      params: { keyword: searchKey, pageNum: page, pageSize: 20 }
    });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// Import to Shopify
app.post('/api/import', async (req, res) => {
  try {
    const { cjProduct } = req.body;
    if (!cjProduct) return res.status(400).json({ error: 'cjProduct required' });
    
    const cjPrice = parseFloat(cjProduct.sellPrice || cjProduct.productSellPrice || cjProduct.price || 10);
    const myPrice = (cjPrice * (1 + MARGIN)).toFixed(2);

    const shopifyProduct = {
      product: {
        title: cjProduct.productNameEn || cjProduct.productName || cjProduct.name || 'MA Fashion Product',
        body_html: cjProduct.description || cjProduct.productNameEn || 'Imported from CJdropshipping - MA Fashion House',
        vendor: 'CJdropshipping',
        product_type: cjProduct.categoryName || 'Fashion',
        tags: 'cjdropshipping, MA fashion house, ' + (cjProduct.categoryName || 'fashion'),
        images: (cjProduct.productImageSet || cjProduct.images || []).slice(0, 5).map(src => ({ src: typeof src === 'string' ? src : src.productImage || src })),
        variants: [{
          price: myPrice,
          sku: cjProduct.pid || cjProduct.vid || Date.now().toString(),
          inventory_management: null,
          inventory_quantity: 100
        }]
      }
    };

    const r = await shopify.post('/products.json', shopifyProduct);
    res.json({ success: true, shopifyProduct: r.data.product, myPrice, cjPrice });
  } catch (e) {
    console.error('Import error:', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Dropshiphub listening on ${PORT}`);
  console.log(`MA Fashion House connected to ${SHOPIFY_DOMAIN}`);
});
