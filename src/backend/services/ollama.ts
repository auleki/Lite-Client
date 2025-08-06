import { app, ipcMain } from 'electron';
import { Ollama } from 'ollama';
import { execFile, ChildProcess } from 'child_process';
import fs from 'fs';
import { sendOllamaStatusToRenderer } from '..';
import { MOR_PROMPT } from './prompts';
import path from 'path';
import checkDiskSpace from 'check-disk-space';

// events
import { IpcMainChannel } from '../../events';
import {
  createDirectoryElevated,
  executeCommandElevated,
  getExecutablePathByPlatform,
  killProcess,
  runDelayed,
} from './system';

// storage
import { getModelPathFromStorage } from '../storage';
import { logger } from './logger';

// constants
const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434/';

// Cache configuration
const CACHE_DURATION = 1 * 1000; // 1 second for testing

// In-memory cache
let registryCache: {
  data: any[];
  timestamp: number;
} | null = null;

// Persistent cache functions
const saveCacheToStorage = (data: any[]) => {
  try {
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    const cachePath = path.join(app.getPath('userData'), 'cache.json');
    fs.writeFileSync(cachePath, JSON.stringify(cacheData));
    logger.info('Cache saved to persistent storage');
  } catch (err) {
    logger.error('Failed to save cache to storage:', err);
  }
};

const loadCacheFromStorage = () => {
  try {
    const cachePath = path.join(app.getPath('userData'), 'cache.json');
    if (fs.existsSync(cachePath)) {
      const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      registryCache = cacheData;
      logger.info('Cache loaded from persistent storage');
      return true;
    }
  } catch (err) {
    logger.error('Failed to load cache from storage:', err);
  }
  return false;
};

// commands
export const SERVE_OLLAMA_CMD = 'ollama serve';
export const WSL_SERVE_OLLAMA_CMD = 'wsl ollama serve';

// ollama instance
let ollama: Ollama;
let ollamaProcess: ChildProcess | null;

export const loadOllama = async () => {
  let runningInstance = await isOllamaInstanceRunning();

  if (runningInstance) {
    // connect to local instance
    ollama = new Ollama({
      host: DEFAULT_OLLAMA_URL,
    });

    await sendOllamaStatusToRenderer(
      `local instance of ollama is running and connected at ${DEFAULT_OLLAMA_URL}`,
    );

    return true;
  }

  const customAppData = getModelPathFromStorage();
  runningInstance = await packedExecutableOllamaSpawn(customAppData);

  if (runningInstance) {
    // connect to local instance
    ollama = new Ollama({
      host: DEFAULT_OLLAMA_URL,
    });

    await sendOllamaStatusToRenderer(
      `local instance of ollama is running and connected at ${DEFAULT_OLLAMA_URL}`,
    );

    return true;
  }

  ipcMain.emit(IpcMainChannel.Error, `Couldn't start Ollama locally.`);

  return false;
};

export const isOllamaInstanceRunning = async (url?: string): Promise<boolean> => {
  try {
    const usedUrl = url ?? DEFAULT_OLLAMA_URL;

    await sendOllamaStatusToRenderer(`checking if ollama instance is running at ${usedUrl}`);

    const ping = await fetch(usedUrl);

    return ping.status === 200;
  } catch (err) {
    return false;
  }
};

export const packedExecutableOllamaSpawn = async (customDataPath?: string) => {
  await sendOllamaStatusToRenderer(`trying to spawn locally installed ollama`);

  try {
    spawnLocalExecutable(customDataPath);
  } catch (err) {
    console.error(err);
  }

  return await runDelayed(isOllamaInstanceRunning, 10000);
};

export const devRunLocalWSLOllama = (customDataPath?: string) => {
  executeCommandElevated(
    WSL_SERVE_OLLAMA_CMD,
    customDataPath ? { OLLAMA_MODELS: customDataPath } : undefined,
  );
};

export const spawnLocalExecutable = async (customDataPath?: string) => {
  try {
    const { executablePath, appDataPath } = getOllamaExecutableAndAppDataPath(customDataPath);

    if (!fs.existsSync(appDataPath)) {
      createDirectoryElevated(appDataPath);
    }

    const env = {
      ...process.env,
      OLLAMA_MODELS: appDataPath,
    };

    ollamaProcess = execFile(executablePath, ['serve'], { env }, (err, stdout, stderr) => {
      if (err) {
        throw new Error(`exec error: ${err.message}`);
      }

      if (stderr) {
        throw new Error(`stderr: ${stderr}`);
      }
    });
  } catch (err) {
    logger.error(err);
  }
};

export const getOllamaExecutableAndAppDataPath = (
  customDataPath?: string,
): {
  executablePath: string;
  appDataPath: string;
} => {
  const appDataPath = customDataPath || app.getPath('userData');
  const executablePath = getExecutablePathByPlatform();

  return {
    executablePath,
    appDataPath,
  };
};

/**
 * Warm up a model by loading it into memory (no response needed)
 */
export const warmUpModel = async (model: string): Promise<void> => {
  if (!ollama) {
    logger.warn('Cannot warm up model - Ollama not initialized');
    return;
  }

  try {
    logger.info(`Warming up model: ${model}`);

    // Create a timeout wrapper for the warmup operation
    const warmupPromise = ollama.chat({
      model,
      messages: [{ role: 'user', content: 'hello' }],
      keep_alive: '10m',
    });

    // Set a generous 60-second timeout for warmup
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Model warmup timeout')), 60000);
    });

    await Promise.race([warmupPromise, timeoutPromise]);
    logger.info(`Model ${model} warmed up successfully`);
  } catch (error) {
    if (error.message === 'Model warmup timeout') {
      logger.warn(`Model ${model} warmup timed out after 60 seconds`);
    } else {
      logger.warn(`Failed to warm up model ${model}:`, error);
    }
  }
};

export const askOllama = async (model: string, message: string, conversationHistory?: any[]) => {
  console.log(`[askOllama] Called with model: ${model}, message length: ${message.length}`);
  console.log(`[askOllama] Conversation history length: ${conversationHistory?.length || 0}`);
  console.log(`[askOllama] Ollama instance exists: ${!!ollama}`);

  if (!ollama) {
    console.error('[askOllama] Ollama instance is not initialized!');
    throw new Error('Ollama instance is not initialized');
  }

  try {
    // Build messages array with conversation history
    const messages: any[] = [
      {
        role: 'system',
        content: MOR_PROMPT,
      },
    ];

    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      // Convert chat messages to Ollama format and add to messages
      for (const historyMessage of conversationHistory) {
        if (historyMessage.role === 'user' || historyMessage.role === 'assistant') {
          messages.push({
            role: historyMessage.role,
            content: historyMessage.content,
          });
        }
      }
    }

    // Add the current user message
    messages.push({
      role: 'user',
      content: message,
    });

    console.log(`[askOllama] Sending ${messages.length} messages to model`);

    const result = await ollama.chat({
      model,
      messages,
      keep_alive: '10m', // Keep model loaded for 10 minutes to avoid reload delays
    });
    console.log('[askOllama] Chat completed successfully');
    return result;
  } catch (error) {
    console.error('[askOllama] Error during chat:', error);
    throw error;
  }
};

export const getOrPullModel = async (model: string) => {
  await installModelWithStatus(model);

  // init the model on pull to load into memory
  await ollama.chat({ model });

  return findModel(model);
};

export const installModelWithStatus = async (model: string) => {
  const stream = await ollama.pull({
    model,
    stream: true,
  });

  for await (const part of stream) {
    if (part.digest) {
      let percent = 0;

      if (part.completed && part.total) {
        percent = Math.round((part.completed / part.total) * 100);

        await sendOllamaStatusToRenderer(`${part.status} ${percent}%`);
      }
    } else {
      await sendOllamaStatusToRenderer(`${part.status}`);
    }
  }
};

export const findModel = async (model: string) => {
  const allModels = await ollama.list();

  return allModels.models.find((m) => m.name.toLowerCase().includes(model));
};

export const getAllLocalModels = async () => {
  return await ollama.list();
};

export const stopOllama = async () => {
  if (!ollamaProcess) {
    return;
  }

  killProcess(ollamaProcess);

  ollamaProcess.removeAllListeners();
  ollamaProcess = null;
};

// Function to estimate model size based on parameter count in name
const estimateModelSize = (modelName: string): number => {
  if (!modelName) {
    return 4.1 * 1024 * 1024 * 1024; // Default size for unknown models
  }
  const name = modelName.toLowerCase();

  // Extract parameter count indicators based on research data
  if (name.includes('0.5b') || name.includes('0.6b')) {
    return 0.7 * 1024 * 1024 * 1024; // ~0.7GB for 0.5B models
  }
  if (name.includes('1.5b') || name.includes('1.7b')) {
    return 1.2 * 1024 * 1024 * 1024; // ~1.2GB for 1.5B models
  }
  if (name.includes('1b') || (name.includes('1.') && name.includes('b'))) {
    return 1.0 * 1024 * 1024 * 1024; // ~1.0GB for 1B models
  }
  if (name.includes('3b') || name.includes('2.7b')) {
    return 2.0 * 1024 * 1024 * 1024; // ~2.0GB for 3B models
  }
  if (name.includes('4b')) {
    return 2.5 * 1024 * 1024 * 1024; // ~2.5GB for 4B models
  }
  if (name.includes('7b') || name.includes('8b') || name.includes('6b')) {
    return 4.1 * 1024 * 1024 * 1024; // ~4.1GB for 7B models
  }
  if (
    name.includes('13b') ||
    name.includes('14b') ||
    name.includes('11b') ||
    name.includes('12b')
  ) {
    return 9.0 * 1024 * 1024 * 1024; // ~9.0GB for 14B models
  }
  if (name.includes('30b') || name.includes('32b') || name.includes('33b')) {
    return 18 * 1024 * 1024 * 1024; // ~18GB for 30B models
  }
  if (name.includes('70b') || name.includes('72b')) {
    return 40 * 1024 * 1024 * 1024; // ~40GB for 70B models
  }
  if (name.includes('235b') || name.includes('200b')) {
    return 140 * 1024 * 1024 * 1024; // ~140GB for 235B models
  }
  if (name.includes('671b') || name.includes('600b')) {
    return 400 * 1024 * 1024 * 1024; // ~400GB for 671B models
  }

  // Special cases for specific model families
  if (name.includes('orca-mini')) {
    return 1.9 * 1024 * 1024 * 1024; // ~1.9GB for Orca Mini (3B)
  }
  if (name.includes('phi') && !name.includes('dolphin')) {
    if (name.includes('phi-2') || name.includes('phi2')) {
      return 1.7 * 1024 * 1024 * 1024; // ~1.7GB for Phi-2
    }
    if (name.includes('phi-3') || name.includes('phi3')) {
      return 2.3 * 1024 * 1024 * 1024; // ~2.3GB for Phi-3
    }
    if (name.includes('phi-4') || name.includes('phi4')) {
      return 9.1 * 1024 * 1024 * 1024; // ~9.1GB for Phi-4 (14B)
    }
  }
  if (name.includes('gemma')) {
    if (name.includes('2b')) {
      return 1.4 * 1024 * 1024 * 1024; // ~1.4GB for Gemma 2B
    }
    return 4.8 * 1024 * 1024 * 1024; // ~4.8GB for Gemma 7B
  }

  // Default fallback for unknown sizes (assume 7B-class)
  return 4.1 * 1024 * 1024 * 1024; // ~4.1GB for 7B-class models
};

// New function to fetch models from Ollama registry with caching
export const getAvailableModelsFromRegistry = async (forceRefresh = false) => {
  try {
    // Disable all caching for now
    // if (!registryCache) {
    //   loadCacheFromStorage();
    // }

    // Check cache first (unless force refresh is requested)
    // if (!forceRefresh && registryCache && Date.now() - registryCache.timestamp < CACHE_DURATION) {
    //   logger.info('Returning cached registry data');
    //   return registryCache.data;
    // }

    logger.info('Fetching fresh data from Ollama registry');
    // Use the community API that provides access to the full model registry
    let response;
    try {
      // Fetch all models without limit
      response = await fetch('https://ollamadb.dev/api/v1/models', {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Morpheus-Client/1.0',
        },
      });

      logger.info(`Community API response status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`Community API request failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Failed to fetch from community API:', error);
      // Fall back to the original API
      logger.info('Falling back to original Ollama API');
      response = await fetch('https://ollama.com/api/tags', {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Morpheus-Client/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch registry: ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    logger.info(`API response received: ${JSON.stringify(data).substring(0, 200)}...`);
    logger.info(`API response structure: models array length = ${data.models?.length || 0}`);
    if (data.total_count) {
      logger.info(`Total models available: ${data.total_count}`);
    }

    // Debug: Log the structure of the first model if it exists
    if (data.models && data.models.length > 0) {
      logger.info('First model structure:', JSON.stringify(data.models[0], null, 2));
    }

    // Debug: Log the first few models to see their structure
    if (data.models && data.models.length > 0) {
      logger.info('First 3 models from API:');
      data.models.slice(0, 3).forEach((model: any, index: number) => {
        logger.info(`Model ${index + 1}: ${JSON.stringify(model)}`);
      });
    }

    // Transform the data to match our expected format
    // The community API returns {models: [...]} format
    const models = data.models
      ? data.models.map((model: any, index: number) => {
          const modelName = model.name || model.model_name || model.model_identifier || 'unknown';

          return {
            name: modelName,
            description: model.description || '',
            size: model.size || estimateModelSize(modelName), // Use intelligent size estimation
            modifiedAt: model.last_updated || '2024-01-01T00:00:00Z',
            digest: model.digest || 'sha256:1234567890abcdef',
            tags: model.tags || ['ai', 'llm'], // Use API tags or fallback to basic tags
            url: model.url || '',
            isInstalled: false, // Will be computed by comparing with local models
          };
        })
      : [];

    // Get locally installed models for comparison
    let localModels: string[] = [];
    try {
      const localModelsResponse = await ollama.list();
      localModels = localModelsResponse.models.map((m: any) => m.name);
      logger.info(
        `Found ${localModels.length} locally installed models: ${localModels.join(', ')}`,
      );
    } catch (err) {
      logger.error('Failed to get local models for comparison:', err);
    }

    // Update the isInstalled flag for each model
    const updatedModels = models.map((model: any) => ({
      ...model,
      isInstalled: localModels.includes(model.name),
    }));

    // Disable caching for now
    // registryCache = {
    //   data: updatedModels,
    //   timestamp: Date.now(),
    // };

    // Save to persistent storage
    // saveCacheToStorage(updatedModels);

    logger.info(`Fetched ${updatedModels.length} models from registry and cached`);
    return updatedModels;
  } catch (err) {
    logger.error('Failed to fetch models from registry:', err);

    // Disable fallback caching for now
    // if (registryCache) {
    //   logger.info('Returning stale cached data as fallback');
    //   return registryCache.data;
    // }

    // If no cache and API fails, return curated list as final fallback
    logger.info('API failed and no cache available, returning curated model list');
    return POPULAR_MODELS;
  }
};

// Function to clear cache (useful for testing or manual refresh)
export const clearRegistryCache = () => {
  registryCache = null;
  // Clear persistent storage by overwriting with empty data
  try {
    saveCacheToStorage([]);
    logger.info('Registry cache and persistent storage cleared');
  } catch (err) {
    logger.info('Registry cache cleared (persistent storage clear failed)');
  }
};

// Function to get cache status
export const getRegistryCacheStatus = () => {
  if (!registryCache) {
    return { hasCache: false, age: null, isExpired: true };
  }

  const age = Date.now() - registryCache.timestamp;
  const isExpired = age > CACHE_DURATION;

  return {
    hasCache: true,
    age: age,
    isExpired: isExpired,
    cacheDuration: CACHE_DURATION,
  };
};

// Curated list of popular models as fallback
const POPULAR_MODELS = [
  {
    name: 'llama2',
    description:
      "Meta's Llama 2 is a collection of pretrained and fine-tuned generative text models",
    size: 3.8 * 1024 * 1024 * 1024, // ~3.8GB
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['ai', 'llm'],
    isInstalled: false,
  },
  {
    name: 'llama2:7b',
    description: 'Llama 2 7B parameter model - good balance of performance and resource usage',
    size: 3.8 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['ai', 'llm'],
    isInstalled: false,
  },
  {
    name: 'llama2:13b',
    description: 'Llama 2 13B parameter model - higher quality responses',
    size: 7.3 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['ai', 'llm'],
    isInstalled: false,
  },
  {
    name: 'llama2:70b',
    description: 'Llama 2 70B parameter model - highest quality, requires more resources',
    size: 39 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['ai', 'llm'],
    isInstalled: false,
  },
  {
    name: 'codellama',
    description: 'Code Llama is a collection of pretrained and fine-tuned generative text models',
    size: 3.8 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['ai', 'llm'],
    isInstalled: false,
  },
  {
    name: 'codellama:7b',
    description: 'Code Llama 7B - specialized for code generation and understanding',
    size: 3.8 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['ai', 'llm'],
    isInstalled: false,
  },
  {
    name: 'mistral',
    description: 'Mistral 7B is a 7.3B parameter model that demonstrates high performance',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['ai', 'llm'],
    isInstalled: false,
  },
  {
    name: 'mistral:7b',
    description: 'Mistral 7B - high performance 7B parameter model',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['ai', 'llm'],
    isInstalled: false,
  },
  {
    name: 'orca-mini',
    description: 'Orca Mini is a 3B parameter model from Microsoft',
    size: 1.9 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['ai', 'llm'],
    isInstalled: false,
  },
  {
    name: 'orca-mini:3b',
    description: 'Orca Mini 3B - lightweight model good for basic tasks',
    size: 1.9 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['ai', 'llm'],
    isInstalled: false,
  },
  {
    name: 'neural-chat',
    description: 'Neural Chat is a 7B parameter model fine-tuned for chat',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['neural', 'chat', '7b'],
    isInstalled: false,
  },
  {
    name: 'deepseek-r1',
    description:
      'DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models',
    size: 1275 * 1024 * 1024 * 1024, // 1275GB
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['deepseek', 'reasoning', 'tools', '671b'],
    isInstalled: false,
  },
  {
    name: 'gemma3',
    description: 'Gemma 3 is the current, most capable model that runs on a single GPU',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['gemma', 'google', 'vision'],
    isInstalled: false,
  },
  {
    name: 'qwen3',
    description: 'Qwen3 is the latest generation of large language models in Qwen series',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['qwen', 'alibaba', 'tools', 'thinking'],
    isInstalled: false,
  },
  {
    name: 'llama3.1',
    description:
      'Llama 3.1 is a new state-of-the-art model from Meta available in 8B, 70B and 405B parameter sizes',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['llama', 'meta', 'tools'],
    isInstalled: false,
  },
  {
    name: 'mistral',
    description: 'The 7B model released by Mistral AI, updated to version 0.3',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['mistral', 'tools'],
    isInstalled: false,
  },
  {
    name: 'llava',
    description:
      'LLaVA is a novel end-to-end trained large multimodal model for visual and language understanding',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['llava', 'vision', 'multimodal'],
    isInstalled: false,
  },
  {
    name: 'phi3',
    description:
      'Phi-3 is a family of lightweight 3B (Mini) and 14B (Medium) state-of-the-art open models by Microsoft',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['phi', 'microsoft'],
    isInstalled: false,
  },
  {
    name: 'gemma2',
    description:
      'Google Gemma 2 is a high-performing and efficient model available in three sizes: 2B, 9B, and 27B',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['gemma', 'google'],
    isInstalled: false,
  },
  {
    name: 'qwen2.5-coder',
    description:
      'The latest series of Code-Specific Qwen models, with significant improvements in code generation',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['qwen', 'code', 'tools'],
    isInstalled: false,
  },
  {
    name: 'neural-chat:7b',
    description: 'Neural Chat 7B - optimized for conversational AI',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['neural', 'chat', '7b'],
    isInstalled: false,
  },
];

// Function to check if there's enough disk space for a model
export const checkDiskSpaceForModel = async (modelSize: number) => {
  try {
    const appDataPath = app.getPath('userData');
    const diskSpace = await checkDiskSpace(appDataPath);

    const hasEnoughSpace = diskSpace.free > modelSize;
    const freeSpaceGB = (diskSpace.free / (1024 * 1024 * 1024)).toFixed(2);
    const requiredSpaceGB = (modelSize / (1024 * 1024 * 1024)).toFixed(2);

    return {
      hasEnoughSpace,
      freeSpace: diskSpace.free,
      freeSpaceGB,
      requiredSpaceGB,
      modelSize,
    };
  } catch (err) {
    logger.error('Failed to check disk space:', err);
    return {
      hasEnoughSpace: false,
      freeSpace: 0,
      freeSpaceGB: '0',
      requiredSpaceGB: '0',
      modelSize,
      error: err,
    };
  }
};

// Function to get disk space information for display
export const getDiskSpaceInfo = async () => {
  try {
    const appDataPath = app.getPath('userData');
    const diskSpace = await checkDiskSpace(appDataPath);

    return {
      free: diskSpace.free,
      freeGB: (diskSpace.free / (1024 * 1024 * 1024)).toFixed(2),
      total: diskSpace.size,
      totalGB: (diskSpace.size / (1024 * 1024 * 1024)).toFixed(2),
      used: diskSpace.size - diskSpace.free,
      usedGB: ((diskSpace.size - diskSpace.free) / (1024 * 1024 * 1024)).toFixed(2),
    };
  } catch (err) {
    logger.error('Failed to get disk space info:', err);
    return {
      free: 0,
      freeGB: '0',
      total: 0,
      totalGB: '0',
      used: 0,
      usedGB: '0',
      error: err,
    };
  }
};

// Function to get the currently loaded model
export const getCurrentModel = async () => {
  try {
    const allModels = await ollama.list();
    // Return the first model that's currently loaded (if any)
    return allModels.models.find((m) => m.parameter_size) || null;
  } catch (err) {
    logger.error('Failed to get current model:', err);
    return null;
  }
};

// Function to delete a model
export const deleteModel = async (modelName: string) => {
  try {
    await ollama.delete({ model: modelName });
    logger.info(`Successfully deleted model: ${modelName}`);
    return true;
  } catch (err) {
    logger.error(`Failed to delete model ${modelName}:`, err);
    return false;
  }
};

// Function to pull and replace current model
export const pullAndReplaceModel = async (newModelName: string) => {
  try {
    // First, pull the new model
    await installModelWithStatus(newModelName);

    // Then replace the current model
    const success = await window.backendBridge.ollama.pullAndReplaceModel(newModelName);
    return success;
  } catch (error) {
    logger.error('Failed to pull and replace model:', error);
    return false;
  }
};

export const getModelDetails = async (modelName: string) => {
  try {
    const url = `https://ollama.com/library/${modelName}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch model details: ${response.status}`);
    }

    const html = await response.text();

    // Extract description from the HTML
    const descriptionMatch = html.match(/<p>([^<]+)<\/p>/);
    const description = descriptionMatch ? descriptionMatch[1] : '';

    // Extract parameter information from the URL or page content
    const parameterMatch = modelName.match(/(\d+b)/i);
    const parameters = parameterMatch ? parameterMatch[1] : '';

    // Extract features from the HTML
    const featuresMatch = html.match(/<li>([^<]+)<\/li>/g);
    const features = featuresMatch
      ? featuresMatch.map((match) => match.replace(/<\/?li>/g, ''))
      : [];

    return {
      name: modelName,
      description,
      parameters,
      features,
      url,
    };
  } catch (error) {
    logger.error(`Failed to fetch details for ${modelName}:`, error);
    return {
      name: modelName,
      description: 'Failed to load model details',
      parameters: '',
      features: [],
      url: `https://ollama.com/library/${modelName}`,
    };
  }
};
