import { ChatResponse, GenerateResponse, ListResponse, ModelResponse } from 'ollama';

export interface BackendBridge {
  main: {
    init: () => Promise<boolean>;
    onInit: (callback: (result: boolean) => void) => Electron.IpcRenderer;
    sendInit: () => void;
    getFolderPath: () => Promise<string>;
    setFolderPath: () => Promise<boolean>;
    close: () => void;
    minimize: () => void;
  };
  ollama: {
    init: () => Promise<boolean>;
    onStatusUpdate: (callback: (status: string) => void) => Electron.IpcRenderer;
    question: ({ model, question }: OllamaQuestion) => Promise<ChatResponse>;
    onAnswer: (callback: (response: ChatResponse) => void) => Electron.IpcRenderer;
    getAllModels: () => Promise<ListResponse>;
    getAvailableModels: () => Promise<string[]>;
    getModel: (model: string) => Promise<ModelResponse>;
  };
  removeAllListeners: (channel: string) => void;
}

export interface OllamaQuestion {
  model: string;
  query: string;
}

declare global {
  interface Window {
    backendBridge: BackendBridge;
  }
}
