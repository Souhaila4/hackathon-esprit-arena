/**
 * Premier import de main.ts : charge .env avant AppModule (DynamicModule / file Bull).
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const envPath = path.join(process.cwd(), '.env');
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('[bootstrap-env]', result.error.message);
} else {
  console.log(
    '[bootstrap-env]',
    Object.keys(result.parsed || {}).length,
    'keys,',
    envPath,
    fs.existsSync(envPath) ? 'ok' : 'missing',
  );
}
