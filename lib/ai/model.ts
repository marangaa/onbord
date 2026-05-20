import { google } from '@ai-sdk/google';
import { wrapLanguageModel } from 'ai';
import { devToolsMiddleware } from '@ai-sdk/devtools';

export const modelName = 'gemini-3.1-flash-lite';

const baseModel = google(modelName);

const isDev = process.env.NODE_ENV === 'development';

export const model = isDev
  ? wrapLanguageModel({ model: baseModel, middleware: devToolsMiddleware() })
  : baseModel;
