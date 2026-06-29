const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const rootContext = req.headers['x-forwarded-prefix'] || '';
  const headless = req.query.headless === 'true';
  res.render('jami/index', { layout: false, rootContext, headless });
});

router.get('/view', (req, res) => {
  const rootContext = req.headers['x-forwarded-prefix'] || '';
  res.render('jami/view', { layout: false, rootContext });
});

module.exports = router;
