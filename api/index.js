const { createApp } = require('../index');

const app = createApp();

module.exports = (req, res) => {
  app(req, res);
};