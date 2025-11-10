
export interface ChatAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
  storagePath?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  attachments?: ChatAttachment[];
}
