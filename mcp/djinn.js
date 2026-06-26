'use strict';

const path = require('path');
const { DJinn, Schema, serveMcp } = require('@d0iloppa/djinn');

const db = new DJinn(path.join(__dirname, '../data/notion_meta.db'), { cacheSize: 256 });

db.define('nodes', new Schema({
  title: { type: 'string', required: true },
  grp:   { type: 'string', required: true },
  url:   { type: 'string' },
  tags:  { type: 'json',  default: [] },
}), { indexes: ['grp'] });

db.define('edges', new Schema({
  source: { type: 'string', required: true },
  target: { type: 'string', required: true },
}), { indexes: ['source', 'target'] });

db.define('meta', new Schema({
  value: { type: 'string', required: true },
}));

serveMcp(db, { name: 'djinn', version: '0.1.0' });
