import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load the gambling site's own .env (this company is fully separate from the bank).
dotenv.config({ path: resolve(process.cwd(), '.env') });

export const config = {
  port: Number(process.env.PORT || 4100),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5180',
  jwtSecret: process.env.JWT_SECRET || 'lucky-spin-dev-secret-change-me',
  cookieName: 'casino_session',

  // The Mock Bank is an external company we integrate with purely over HTTP.
  bank: {
    apiUrl: (process.env.BANK_API_URL || 'http://localhost:3000/api').replace(/\/$/, ''),
    webUrl: process.env.BANK_WEB_URL || 'http://localhost:5173', // hosted Connect page origin
    partnerKey: process.env.BANK_PARTNER_KEY || 'sk_test_luckyspin_dev',
  },

  // Our merchant identity as seen on the cardholder's bank statement.
  merchant: {
    name: process.env.MERCHANT_NAME || 'Lucky Spin Casino',
    mcc: '7995', // betting / casino gambling
    city: 'Las Vegas',
  },
};
