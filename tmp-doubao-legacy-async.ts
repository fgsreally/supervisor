import { readSupervisorSettings, doubaoSpeechPresetsToTry, resolveDoubaoSpeechPreset, buildLegacyDoubaoSpeechWsHeaders } from './packages/supervisor/src/utils/supervisor-settings.ts';
import { decryptApiKey } from './packages/supervisor/src/utils/encrypt.ts';
import { createOutboundWebSocket, formatOutboundHandshakeError } from './packages/supervisor/src/utils/outbound-ws.ts';
const settings = readSupervisorSettings();
const token = decryptApiKey(settings.doubaoSpeechAccessTokenEncrypted);
for (const id of doubaoSpeechPresetsToTry(settings.doubaoSpeechPreset)) {
 const p=resolveDoubaoSpeechPreset(id);
 await new Promise(resolve=>{const ws=createOutboundWebSocket("wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async",buildLegacyDoubaoSpeechWsHeaders(settings.doubaoSpeechAppId,token,p.resourceId),8000); ws.once('open',()=>{console.log(id+': OK');ws.close();resolve();});ws.on('error',e=>{console.log(id+': '+formatOutboundHandshakeError(e,'豆包语音',''));resolve();});});
}
