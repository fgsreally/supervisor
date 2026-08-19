export interface PendingChatImage {
  id: string;
  name: string;
  mimeType: string;
  /** Local blob preview only (not sent to API). */
  previewUrl: string;
  /** Session media id after upload. */
  mediaId: string;
  /** Placeholder retained in the editor document. */
  placeholder: string;
}

export interface PendingPastedText {
  id: string;
  text: string;
  chars: number;
}

export interface PendingChatAttachment {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
}

export interface ChatSendPayload {
  text: string;
  images: PendingChatImage[];
  pastedTexts: PendingPastedText[];
  attachments: PendingChatAttachment[];
}
