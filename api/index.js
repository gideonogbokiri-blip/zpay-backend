const { createApp } = require('../index');
const { load } = require('../store');

let app = null;

module.exports = async (req, res) => {
  if (!app) {
    await load();
    app = createApp();
  }
  app(req, res);
};