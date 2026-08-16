import { writeSupervisorSettings } from './packages/supervisor/src/utils/supervisor-settings.ts';
import { encryptApiKey } from './packages/supervisor/src/utils/encrypt.ts';
writeSupervisorSettings({ doubaoSpeechApiKeyEncrypted: encryptApiKey(process.env.DOUBAO_NEW_KEY), speechRecognitionMode: 'doubao' });
console.log('new-only config saved');
