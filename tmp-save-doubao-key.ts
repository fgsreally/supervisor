import { readSupervisorSettings, writeSupervisorSettings } from './packages/supervisor/src/utils/supervisor-settings.ts';
import { encryptApiKey } from './packages/supervisor/src/utils/encrypt.ts';
const settings=readSupervisorSettings();
writeSupervisorSettings({
  doubaoSpeechAccessTokenEncrypted: encryptApiKey(process.env.DOUBAO_NEW_KEY),
  doubaoSpeechAppId: undefined,
  doubaoSpeechPreset: settings.doubaoSpeechPreset ?? '2.0-duration',
  speechRecognitionMode: 'doubao',
});
console.log('豆包配置已切换为新版 API Key，旧 App ID 已移除');
