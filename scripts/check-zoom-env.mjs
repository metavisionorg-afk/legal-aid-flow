#!/usr/bin/env node
// Paste-safe Zoom env checker (no heredocs, safe for command history)
import { config } from 'dotenv';
config();

const accountId = process.env.ZOOM_ACCOUNT_ID || '';
const clientId = process.env.ZOOM_CLIENT_ID || '';
const clientSecret = process.env.ZOOM_CLIENT_SECRET || '';

console.log('ZOOM_ACCOUNT_ID:', accountId ? 'SET' : 'MISSING');
console.log('ZOOM_CLIENT_ID:', clientId ? 'SET' : 'MISSING');
console.log('ZOOM_CLIENT_SECRET:', clientSecret ? 'SET' : 'MISSING');

const allSet = accountId && clientId && clientSecret;
console.log('\nZoom Integration:', allSet ? 'ENABLED' : 'DISABLED');

process.exit(allSet ? 0 : 1);
