
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, Chat } from '@google/genai';
import type { ChatAttachment, ChatMessage } from '../types';
import { BotIcon, SendIcon, UserIcon } from './Icons';
import { supabase } from '../utils/supabaseClient';

const ATTACHMENT_BUCKET = import.meta.env.VITE_SUPABASE_ATTACHMENTS_BUCKET ?? 'chat-attachments';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24 hours

type PendingAttachment = {
  file: File;
  previewUrl: string;
};

type PersistedAttachment = {
  name: string;
  type: string;
  size: number;
  storagePath: string;
};

interface ChatBotProps {
  hasMemory: boolean;
  userName: string | null;
  userId: string | null;
}

const ChatBot: React.FC<ChatBotProps> = ({ hasMemory, userName, userId }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const chatRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializeChat = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        chatRef.current = ai.chats.create({
          model: 'gemini-2.5-flash',
          config: {
            systemInstruction: `You are VibeChat, a supportive study assistant for students. ${
              hasMemory
                ? 'You remember important context from earlier conversations when giving advice.'
                : 'You are in guest mode and must rely only on messages in this session.'
            } Provide clear, encouraging responses. ${userName ? `The student you are helping is named ${userName}.` : ''}`,
          },
        });
      } catch (error) {
        console.error('Failed to initialize chat:', error);
      }

      const greeting = `Hello${userName ? ` ${userName.split(' ')[0]}` : ''}! I'm VibeChat. How can I support your studies today?`;

      if (hasMemory && userId) {
        setIsHistoryLoading(true);
        try {
          const history = await fetchHistory(userId);
          setMessages([{ role: 'model', content: greeting }, ...history]);
        } catch (error) {
          console.error('Failed to load chat history:', error);
          setMessages([{ role: 'model', content: greeting }]);
        } finally {
          setIsHistoryLoading(false);
        }
      } else {
        setMessages([{ role: 'model', content: greeting }]);
      }

      // clear any pending attachments when auth state changes
      setPendingAttachments(current => {
        current.forEach(item => URL.revokeObjectURL(item.previewUrl));
        return [];
      });
    };

    initializeChat();

    return () => {
      chatRef.current = null;
    };
  }, [hasMemory, userId, userName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      pendingAttachments.forEach(item => URL.revokeObjectURL(item.previewUrl));
    };
  }, [pendingAttachments]);

  const canPersistConversation = hasMemory && Boolean(userId);

  const fetchHistory = async (currentUserId: string): Promise<ChatMessage[]> => {
    const { data, error } = await supabase
      .from('messages')
      .select('role, content, attachments, created_at')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    if (!data) {
      return [];
    }

    const resolvedMessages: ChatMessage[] = [];

    for (const entry of data) {
      let attachments: ChatAttachment[] | undefined;
      if (entry.attachments && Array.isArray(entry.attachments)) {
        const persisted = entry.attachments as PersistedAttachment[];
        attachments = await Promise.all(
          persisted.map(async attachment => {
            const { data: signed, error: signedError } = await supabase.storage
              .from(ATTACHMENT_BUCKET)
              .createSignedUrl(attachment.storagePath, SIGNED_URL_TTL_SECONDS);
            if (signedError || !signed?.signedUrl) {
              console.error('Failed to create signed URL for attachment', signedError);
              return {
                name: attachment.name,
                type: attachment.type,
                size: attachment.size,
                storagePath: attachment.storagePath,
                url: '#',
              };
            }
            return {
              name: attachment.name,
              type: attachment.type,
              size: attachment.size,
              storagePath: attachment.storagePath,
              url: signed.signedUrl,
            };
          }),
        );
      }

      resolvedMessages.push({
        role: entry.role,
        content: entry.content,
        attachments,
      });
    }

    return resolvedMessages;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const selected = Array.from(files).map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setPendingAttachments(prev => [...prev, ...selected]);
    event.target.value = '';
  };

  const handleRemoveAttachment = (attachment: PendingAttachment) => {
    URL.revokeObjectURL(attachment.previewUrl);
    setPendingAttachments(prev => prev.filter(item => item.previewUrl !== attachment.previewUrl));
  };

  const uploadAttachments = async (): Promise<{ persisted: PersistedAttachment[]; display: ChatAttachment[] }> => {
    if (!userId) {
      throw new Error('Please sign in to share files.');
    }

    const timestamp = Date.now();
    const persisted: PersistedAttachment[] = [];
    const display: ChatAttachment[] = [];

    for (const [index, pending] of pendingAttachments.entries()) {
      const extension = pending.file.name.split('.').pop();
      const sanitizedName = pending.file.name.replace(/[^a-zA-Z0-9.\-]/g, '_');
      const storagePath = `${userId}/${timestamp}-${index}-${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(storagePath, pending.file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

      if (signedError || !signedData?.signedUrl) {
        throw signedError ?? new Error('Failed to generate download link for an attachment.');
      }

      persisted.push({
        name: pending.file.name,
        type: pending.file.type,
        size: pending.file.size,
        storagePath,
      });

      display.push({
        name: pending.file.name,
        type: pending.file.type,
        size: pending.file.size,
        storagePath,
        url: signedData.signedUrl,
      });
    }

    pendingAttachments.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setPendingAttachments([]);

    return { persisted, display };
  };

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput && pendingAttachments.length === 0) return;
    if (isLoading || !chatRef.current) return;

    setIsLoading(true);

    try {
      let attachmentsForDisplay: ChatAttachment[] | undefined;
      let attachmentsForStorage: PersistedAttachment[] | undefined;

      if (pendingAttachments.length > 0) {
        if (!canPersistConversation) {
          throw new Error('Please sign in to upload files and keep them in your chat history.');
        }
        const uploaded = await uploadAttachments();
        attachmentsForDisplay = uploaded.display;
        attachmentsForStorage = uploaded.persisted;
      }

      const userMessage: ChatMessage = {
        role: 'user',
        content: trimmedInput || 'Shared attachments.',
        attachments: attachmentsForDisplay,
      };

      setMessages(prev => [...prev, userMessage]);
      setInput('');

      if (canPersistConversation) {
        await supabase.from('messages').insert({
          user_id: userId,
          role: 'user',
          content: userMessage.content,
          attachments: attachmentsForStorage ?? null,
        });
      }

      const attachmentSummary = attachmentsForDisplay
        ?.map(att => `- ${att.name} (${Math.round(att.size / 1024)} KB)`)
        .join('\n');

      const prompt = `${trimmedInput || 'Review the files I just shared.'}${
        attachmentSummary ? `\n\nAttachments:\n${attachmentSummary}` : ''
      }`;

      const response = await chatRef.current.sendMessage({ message: prompt });
      const assistantMessage: ChatMessage = {
        role: 'model',
        content: response.text,
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (canPersistConversation) {
        await supabase.from('messages').insert({
          user_id: userId,
          role: 'model',
          content: assistantMessage.content,
          attachments: null,
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: ChatMessage = {
        role: 'model',
        content: error instanceof Error ? error.message : "I'm having trouble responding right now. Please try again later.",
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderAttachmentPreview = (attachment: PendingAttachment, index: number) => {
    const isImage = attachment.file.type.startsWith('image/');
    return (
      <div
        key={attachment.previewUrl}
        className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm"
      >
        {isImage ? (
          <img src={attachment.previewUrl} alt={attachment.file.name} className="h-10 w-10 rounded-lg object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            {index + 1}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-gray-800">{attachment.file.name}</p>
          <p className="text-xs">{Math.max(1, Math.round(attachment.file.size / 1024))} KB</p>
        </div>
        <button
          type="button"
          onClick={() => handleRemoveAttachment(attachment)}
          className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        >
          ✕
        </button>
      </div>
    );
  };

  const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isUser = message.role === 'user';
    const hasAttachments = Boolean(message.attachments && message.attachments.length > 0);
    return (
      <div className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100">
            <BotIcon className="h-5 w-5 text-indigo-600" />
          </div>
        )}
        <div
          className={`max-w-md md:max-w-lg lg:max-w-xl rounded-2xl px-4 py-3 shadow-sm ${
            isUser ? 'rounded-br-none bg-indigo-600 text-white' : 'rounded-bl-none bg-gray-100 text-gray-900'
          }`}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          {hasAttachments && (
            <div className="mt-3 space-y-3">
              {message.attachments!.map(attachment => {
                const isImage = attachment.type.startsWith('image/');
                const containerClass = isUser
                  ? 'overflow-hidden rounded-xl border border-indigo-200 bg-indigo-500/20 text-indigo-50'
                  : 'overflow-hidden rounded-xl border border-gray-200 bg-white/70 text-gray-600';
                const metaTextClass = isUser ? 'text-indigo-100' : 'text-gray-600';
                return (
                  <div key={`${attachment.storagePath ?? attachment.url}`} className={containerClass}>
                    {isImage && attachment.url !== '#' ? (
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        className="max-h-56 w-full object-cover"
                      />
                    ) : null}
                    <div className={`flex items-center justify-between px-3 py-2 text-xs ${metaTextClass}`}>
                      <span className="truncate font-medium">{attachment.name}</span>
                      {attachment.url !== '#' && (
                        <a
                          href={attachment.url}
                          download={attachment.name}
                          className={`rounded-lg border px-2 py-1 text-xs transition ${
                            isUser
                              ? 'border-indigo-200 text-indigo-50 hover:bg-indigo-500/40'
                              : 'border-indigo-100 text-indigo-600 hover:bg-indigo-50'
                          }`}
                        >
                          Download
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {isUser && (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500">
            <UserIcon className="h-5 w-5 text-white" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Study Session</h2>
          {isHistoryLoading && <p className="mt-1 text-xs text-gray-400">Loading your saved chats…</p>}
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-indigo-500">
          {hasMemory ? 'Memory On' : 'Guest Mode'}
        </span>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto bg-gray-50 px-6 py-6">
        {messages.map((msg, index) => (
          <MessageBubble key={index} message={msg} />
        ))}
        {isLoading && (
          <div className="flex items-start gap-3 justify-start">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100">
              <BotIcon className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="max-w-md rounded-2xl rounded-bl-none bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-300"></span>
                <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-300 delay-150"></span>
                <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-300 delay-300"></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {pendingAttachments.length > 0 && (
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Ready to share</p>
          <div className="flex flex-wrap gap-3">
            {pendingAttachments.map(renderAttachmentPreview)}
          </div>
        </div>
      )}
      <div className="border-t border-gray-200 px-6 py-4">
        <form onSubmit={handleSendMessage} className="flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Ask for study tips${userName ? `, ${userName.split(' ')[0]}` : ''}…`}
            className="w-full flex-1 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            disabled={isLoading}
          />
          <label className={`relative ${!canPersistConversation ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}>
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.txt"
              onChange={handleFileSelect}
              disabled={!canPersistConversation}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-indigo-600 transition hover:bg-indigo-50">
              +
            </div>
          </label>
          <button
            type="submit"
            disabled={isLoading || (!input.trim() && pendingAttachments.length === 0)}
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors duration-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-200"
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </form>
        {!canPersistConversation && (
          <p className="mt-2 text-xs text-gray-400">
            Sign in to upload files and save your chat history.
          </p>
        )}
      </div>
    </div>
  );
};

export default ChatBot;