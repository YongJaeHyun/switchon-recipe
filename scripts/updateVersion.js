import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { pathToFileURL } from 'url';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되어 있지 않습니다.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function updateVersion() {
  try {
    const appConfigPath = path.resolve(process.cwd(), 'app.config.js');
    const appConfigModule = await import(pathToFileURL(appConfigPath).href);

    const config = appConfigModule.default;

    const version = config.expo?.version;
    if (!version) {
      throw new Error('app.config.js에서 expo.version을 찾을 수 없습니다.');
    }

    console.log(`📦 현재 앱 버전: ${version}`);

    const { error: updateError } = await supabase
      .from('version')
      .update({ latest_version: version })
      .eq('id', 1);

    if (updateError) throw updateError;

    console.log('✅ version 테이블 업데이트 완료 (update)');
  } catch (e) {
    console.error('❌ version 업데이트 실패:', e.message);
    process.exit(1);
  }
}

// 프로덕션 출시를 확인한 뒤 scripts/announceUpdate.sh로 실행하므로 바로 반영한다
updateVersion();
