export interface PendingChatImage {
  id: string;
  name: string;
  mimeType: string;
  previewUrl: string;
  data: string;
}

export interface ChatSendPayload {
  text: string;
  images: PendingChatImage[];
}
