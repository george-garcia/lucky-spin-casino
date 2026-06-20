import { config } from './config';
import { createApp } from './app';
import './db'; // open the SQLite database / run schema at startup

const app = createApp();
app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`🎰 Lucky Spin Casino API running on http://localhost:${config.port}`);
  console.log(`   Bank API:  ${config.bank.apiUrl}`);
  console.log(`   Bank web:  ${config.bank.webUrl} (hosted Connect page)`);
});
