export interface PendingChatImage {
  id: string;
  name: string;
  mimeType: string;
  /** Local blob preview only (not sent to API). */
  previewUrl: string;
  /** Session media id after upload. */
  mediaId: string;
}

export interface ChatSendPayload {
  text: string;
  images: PendingChatImage[];
}
