#!/usr/bin/env node
'use strict';

const path = require('path');
const { startServer } = require(path.join(__dirname, '../server/index.js'));

startServer();
