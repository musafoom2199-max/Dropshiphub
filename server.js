import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
app.use(express.json());
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const CJ_API_KEY = process.env.CJ_API_KEY;
const MARGIN = parseFloat(process.env.PROFIT_MARGIN || '0.15');
const shopify = axios.create({
  baseURL: `https://${SHOPIFY_DOMAIN}/admin/api/2024-07`,
  headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' }
});
app.get('/api/cj/search', async (req, res) => {
  try {
    const { keyword = 'fashion', page = 1 } = req.query;
    const r = await axios.get('https://developers.cjdropshipping.com/api2.0/v1/product/list', {
      headers: { 'CJ-Access-Token': CJ_API_KEY },
      params: { keyword, pageNum: page, pageSize: 20 }
    });
    res.json(r.data);
  } catch(e){ res.status(500).json({ error: e.response?.data || e.message }); }
});
app.post('/api/import', async (req, res) => {
  try {
    const { cjProduct } = req.body;
    const cjPrice = parseFloat(cjProduct.sellPrice || cjProduct.productPrice || 10);
    const myPrice = (cjPrice * (1 + MARGIN)).toFixed(2);
    const shopifyProduct = {
      product: {
        title: cjProduct.productNameEn || cjProduct.productName,
        body_html: cjProduct.description || cjProduct.productName,
        vendor: 'CJdropshipping',
        product_type: cjProduct.categoryName || 'Fashion',
        tags: 'cjdropshipping, MA fashion house',
        images: (cjProduct.productImageSet || []).slice(0,5).map(url=>({src:url})),
        variants: [{
          price: myPrice,
          sku: cjProduct.pid || cjProduct.vid,
          inventory_management: null,
          inventory_quantity: 100
        }]
      }
    };
    const r = await shopify.post('/products.json', shopifyProduct);
    res.json({ success: true, shopifyProduct: r.data.product, cjCost: cjPrice, myPrice, profit: (myPrice - cjPrice).toFixed(2) });
  } catch(e){ res.status(500).json({ error: e.response?.data || e.message }); }
});
app.get('/', (req,res)=> res.send('DropshipHub running — MA fashion house connected'));
app.listen(process.env.PORT||3000, ()=> console.log(`DropshipHub listening on ${process.env.PORT||3000}`));
