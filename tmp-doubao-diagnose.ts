import { readSupervisorSettings, doubaoSpeechPresetsToTry, resolveDoubaoSpeechPreset, buildDoubaoSpeechWsHeaders } from './packages/supervisor/src/utils/supervisor-settings.ts';
import { decryptApiKey } from './packages/supervisor/src/utils/encrypt.ts';
import { createOutboundWebSocket, formatOutboundHandshakeError } from './packages/supervisor/src/utils/outbound-ws.ts';
const settings = readSupervisorSettings();
if (!settings.doubaoSpeechAccessTokenEncrypted) { console.log('NOT_CONFIGURED'); process.exit(2); }
const key = decryptApiKey(settings.doubaoSpeechAccessTokenEncrypted);
console.log('credentialLength=' + key.trim().length + ', preset=' + (settings.doubaoSpeechPreset ?? 'default'));
for (const id of doubaoSpeechPresetsToTry(settings.doubaoSpeechPreset)) {
  const preset = resolveDoubaoSpeechPreset(id);
  await new Promise((resolve) => {
    const ws = createOutboundWebSocket(preset.wsUrl, buildDoubaoSpeechWsHeaders(key, preset.resourceId), 8000);
    ws.once('open', () => { console.log(id + ': OK'); ws.close(); resolve(); });
    ws.on('error', (e) => { console.log(id + ': ' + formatOutboundHandshakeError(e, '豆包语音', '')); resolve(); });
  });
}
