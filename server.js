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

console.log('ENV CHECK:', { SHOPIFY_DOMAIN, HAS_TOKEN: !!SHOPIFY_TOKEN, HAS_CJ: !!CJ_API_KEY });

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_DOMAIN}/admin/api/2024-07`,
  headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' }
});

app.get('/', (req, res) => {
  res.send('DropshipHub running — MA fashion house connected ✅');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', shopify: SHOPIFY_DOMAIN, has_token: !!SHOPIFY_TOKEN, margin: MARGIN, time: new Date().toISOString() });
});

app.get('/api/cj/search', async (req, res) => {
  try {
    const { keyword = 'fashion', page = 1 } = req.query;
    if (!CJ_API_KEY) return res.json({ result: false, message: 'CJ_API_KEY missing - using mock' });
    const r = await axios.get('https://developers.cjdropshipping.com/api2.0/v1/product/list', {
      headers: { 'CJ-Access-Token': CJ_API_KEY },
      params: { keyword, pageNum: page, pageSize: 20 }
    });
    res.json(r.data);
  } catch (e) {
    res.status(200).json({ result: false, error: e.response?.data || e.message, fallback: true });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const { q = 'fashion', keyword, page = 1 } = req.query;
    const searchKey = q || keyword || 'fashion';
    if (!CJ_API_KEY) return res.json({ result: false, message: 'CJ_API_KEY missing - using mock', fallback: true });
    const r = await axios.get('https://developers.cjdropshipping.com/api2.0/v1/product/list', {
      headers: { 'CJ-Access-Token': CJ_API_KEY },
      params: { keyword: searchKey, pageNum: page, pageSize: 20 }
    });
    res.json(r.data);
  } catch (e) {
    res.status(200).json({ result: false, error: e.response?.data || e.message, fallback: true });
  }
});

app.post('/api/import', async (req, res) => {
  try {
    if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
      return res.status(400).json({ success: false, error: `MISSING ENV: DOMAIN=${!!SHOPIFY_DOMAIN} TOKEN=${!!SHOPIFY_TOKEN}` });
    }
    const { cjProduct } = req.body;
    const productData = cjProduct || { productNameEn: 'Noor Embroidered Abaya', sellPrice: 89.99, description: 'MA Fashion House - Premium Abaya', categoryName: 'Abaya', pid: 'NOOR-001', productImageSet: ['https://images.unsplash.com/photo-1595777457583-95e059d581b8'] };
    
    const cjPrice = parseFloat(productData.sellPrice || productData.productSellPrice || productData.price || 89.99);
    const myPrice = (cjPrice * (1 + MARGIN)).toFixed(2);

    const shopifyProduct = {
      product: {
        title: productData.productNameEn || productData.productName || 'MA Fashion Product',
        body_html: productData.description || 'MA Fashion House - Premium Import',
        vendor: 'MA Fashion House',
        product_type: productData.categoryName || 'Fashion',
        tags: 'MA Fashion, abaya, curated',
        images: (productData.productImageSet || productData.images || ['https://images.unsplash.com/photo-1595777457583-95e059d581b8']).slice(0,5).map(src => ({ src: typeof src === 'string' ? src : src.productImage || src })),
        variants: [{ price: myPrice, sku: productData.pid || Date.now().toString(), inventory_management: null }]
      }
    };

    console.log('Importing to Shopify:', SHOPIFY_DOMAIN, shopifyProduct.product.title);
    const r = await shopify.post('/products.json', shopifyProduct);
    res.json({ success: true, shopifyProduct: r.data.product, myPrice, cjPrice });
  } catch (e) {
    console.error('IMPORT ERROR:', e.response?.data || e.message);
    const errorData = e.response?.data || e.message;
    const errorString = typeof errorData === 'string' ? errorData.substring(0,500) : JSON.stringify(errorData).substring(0,500);
    res.status(500).json({ success: false, error: errorString, full: e.response?.data });
  }
});

app.listen(PORT, () => {
  console.log(`Dropshiphub listening on ${PORT}`);
});
