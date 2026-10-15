'use strict';

const path = require('path');
const { DJinn, VecDriver, serveMcp } = require('@d0iloppa/djinn');

const db = new DJinn(path.join(__dirname, '../data/notion_meta.db'), { cacheSize: 256 });

db.define('nodes', { indexes: ['grp', 'nodeType'] });
db.define('edges', { indexes: ['source', 'target'] });
db.define('meta');

VecDriver.attach(db).define('nodes', 3072);

serveMcp(db, { name: 'djinn', version: '0.2.0' });
