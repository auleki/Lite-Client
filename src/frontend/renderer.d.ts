import { ChatResponse, GenerateResponse, ListResponse, ModelResponse } from 'ollama';

export interface DiskSpaceInfo {
  free: number;
  freeGB: string;
  total: number;
  totalGB: string;
  used: number;
  usedGB: string;
  error?: any;
}

export interface DiskSpaceForModel {
  hasEnoughSpace: boolean;
  freeSpace: number;
  freeSpaceGB: string;
  requiredSpaceGB: string;
  modelSize: number;
  error?: any;
}

export interface BackendBridge {
  main: {
    init: () => Promise<boolean>;
    onInit: (callback: (result: boolean) => void) => void;
    sendInit: () => void;
    getFolderPath: () => Promise<string>;
    setFolderPath: () => Promise<boolean>;
    close: () => void;
    minimize: () => void;
  };
  ollama: {
    init: (result: boolean) => Promise<boolean>;
    onStatusUpdate: (callback: (status: string) => void) => void;
    question: ({ model, query }: OllamaQuestion) => Promise<ChatResponse>;
    onAnswer: (callback: (response: ChatResponse) => void) => void;
    getAllModels: () => Promise<ListResponse>;
    getModel: (model: string) => Promise<ModelResponse>;
    getAvailableModelsFromRegistry: () => Promise<RegistryModel[]>;
    forceRefreshRegistry: () => Promise<RegistryModel[]>;
    clearRegistryCache: () => Promise<boolean>;
    getRegistryCacheStatus: () => Promise<CacheStatus>;
    checkDiskSpaceForModel: (modelSize: number) => Promise<DiskSpaceForModel>;
    getDiskSpaceInfo: () => Promise<DiskSpaceInfo>;
  };
  removeAllListeners: (channel: string) => void;
}

// New type for registry models
export interface RegistryModel {
  name: string;
  description: string;
  size: number;
  modifiedAt: string;
  digest: string;
  tags: string[];
  isInstalled: boolean;
}

// New type for cache status
export interface CacheStatus {
  hasCache: boolean;
  age: number | null;
  isExpired: boolean;
  cacheDuration?: number;
}

declare global {
  interface Window {
    backendBridge: BackendBridge;
  }
}
