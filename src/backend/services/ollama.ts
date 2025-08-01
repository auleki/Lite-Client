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
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

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

export const askOllama = async (model: string, message: string) => {
  return await ollama.chat({
    model,
    messages: [
      {
        role: 'system',
        content: MOR_PROMPT,
      },
      {
        role: 'user',
        content: `Answer the following query in a valid formatted JSON object without comments with both the response and action fields deduced from the user's question. Adhere strictly to JSON syntax without comments. Query: ${message}. Response: { "response":`,
      },
    ],
  });
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

// New function to fetch models from Ollama registry with caching
export const getAvailableModelsFromRegistry = async (forceRefresh = false) => {
  try {
    // Load from persistent storage if in-memory cache is empty
    if (!registryCache) {
      loadCacheFromStorage();
    }

    // Check cache first (unless force refresh is requested)
    if (!forceRefresh && registryCache && Date.now() - registryCache.timestamp < CACHE_DURATION) {
      logger.info('Returning cached registry data');
      return registryCache.data;
    }

    logger.info('Fetching fresh data from Ollama registry');
    // Use the community API that provides access to the full model registry
    let response;
    try {
      // Fetch all models with pagination - get 200 models to ensure we get everything
      response = await fetch('https://ollamadb.dev/api/v1/models?limit=200', {
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

    // Transform the data to match our expected format
    // The community API returns {models: [...]} format
    const models = data.models
      ? data.models.map((model: any) => {
          // Generate tags based on model name, description, and URL
          const generateTags = (modelName: string, description: string, url?: string) => {
            const tags: string[] = [];

            // Extract model family from name
            if (modelName.includes('llama')) tags.push('llama');
            if (modelName.includes('mistral')) tags.push('mistral');
            if (modelName.includes('gemma')) tags.push('gemma');
            if (modelName.includes('qwen')) tags.push('qwen');
            if (modelName.includes('phi')) tags.push('phi');
            if (modelName.includes('deepseek')) tags.push('deepseek');
            if (modelName.includes('nomic')) tags.push('nomic');
            if (modelName.includes('llava')) tags.push('llava');
            if (modelName.includes('orca')) tags.push('orca');
            if (modelName.includes('neural')) tags.push('neural');
            if (modelName.includes('code')) tags.push('code');
            if (modelName.includes('codellama')) tags.push('code');

            // Extract size indicators
            if (modelName.includes('3b') || modelName.includes('3B')) tags.push('3b');
            if (modelName.includes('7b') || modelName.includes('7B')) tags.push('7b');
            if (modelName.includes('13b') || modelName.includes('13B')) tags.push('13b');
            if (modelName.includes('70b') || modelName.includes('70B')) tags.push('70b');

            // Extract capabilities from description and URL
            const descriptionLower = description.toLowerCase();
            const urlLower = url?.toLowerCase() || '';

            if (
              descriptionLower.includes('code') ||
              modelName.includes('code') ||
              urlLower.includes('code')
            )
              tags.push('programming');
            if (descriptionLower.includes('chat') || urlLower.includes('chat')) tags.push('chat');
            if (
              descriptionLower.includes('vision') ||
              modelName.includes('llava') ||
              urlLower.includes('vision')
            )
              tags.push('vision');
            if (descriptionLower.includes('embed') || urlLower.includes('embed'))
              tags.push('embedding');
            if (descriptionLower.includes('text') || urlLower.includes('text')) tags.push('text');
            if (descriptionLower.includes('instruct') || urlLower.includes('instruct'))
              tags.push('instruct');

            // Add general tags
            tags.push('ai');
            tags.push('llm');

            return [...new Set(tags)]; // Remove duplicates
          };

          return {
            name: model.model_name || model.model_identifier,
            description: model.description || '',
            size: model.size || 4.1 * 1024 * 1024 * 1024, // Default to 4.1GB if not specified
            modifiedAt: model.last_updated || '2024-01-01T00:00:00Z',
            digest: model.digest || 'sha256:1234567890abcdef',
            tags: generateTags(
              model.model_name || model.model_identifier,
              model.description || '',
              model.url,
            ),
            url: model.url || '',
            isInstalled: false, // Will be computed by comparing with local models
          };
        })
      : [];

    logger.info(`Transformed ${models.length} models from API`);
    if (models.length > 0) {
      logger.info(`First model: ${models[0].name}`);
    }

    // If we get very few models from the API (less than 10), supplement with curated list
    if (models.length < 10) {
      logger.info(`API returned only ${models.length} models, supplementing with curated list`);

      // Get existing model names to avoid duplicates
      const existingNames = new Set(models.map((m: any) => m.name));

      // Add curated models that aren't already in the list
      const curatedModels = POPULAR_MODELS.filter((model) => !existingNames.has(model.name));

      // Combine API models with curated models
      const combinedModels = [...models, ...curatedModels];

      // Update cache with combined list
      registryCache = {
        data: combinedModels,
        timestamp: Date.now(),
      };

      // Save to persistent storage
      saveCacheToStorage(combinedModels);

      logger.info(
        `Combined ${models.length} API models with ${curatedModels.length} curated models (total: ${combinedModels.length})`,
      );
      return combinedModels;
    }

    // Update cache
    registryCache = {
      data: models,
      timestamp: Date.now(),
    };

    // Save to persistent storage
    saveCacheToStorage(models);

    logger.info(`Fetched ${models.length} models from registry and cached`);
    return models;
  } catch (err) {
    logger.error('Failed to fetch models from registry:', err);

    // Return cached data if available (even if expired) as fallback
    if (registryCache) {
      logger.info('Returning stale cached data as fallback');
      return registryCache.data;
    }

    // If no cache and API fails, return curated list as final fallback
    logger.info('API failed and no cache available, returning curated model list');
    return POPULAR_MODELS;
  }
};

// Function to clear cache (useful for testing or manual refresh)
export const clearRegistryCache = () => {
  registryCache = null;
  logger.info('Registry cache cleared');
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
    tags: ['llama', 'meta', 'chat'],
    isInstalled: false,
  },
  {
    name: 'llama2:7b',
    description: 'Llama 2 7B parameter model - good balance of performance and resource usage',
    size: 3.8 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['llama', 'meta', '7b'],
    isInstalled: false,
  },
  {
    name: 'llama2:13b',
    description: 'Llama 2 13B parameter model - higher quality responses',
    size: 7.3 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['llama', 'meta', '13b'],
    isInstalled: false,
  },
  {
    name: 'llama2:70b',
    description: 'Llama 2 70B parameter model - highest quality, requires more resources',
    size: 39 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['llama', 'meta', '70b'],
    isInstalled: false,
  },
  {
    name: 'codellama',
    description: 'Code Llama is a collection of pretrained and fine-tuned generative text models',
    size: 3.8 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['code', 'llama', 'programming'],
    isInstalled: false,
  },
  {
    name: 'codellama:7b',
    description: 'Code Llama 7B - specialized for code generation and understanding',
    size: 3.8 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['code', 'llama', '7b', 'programming'],
    isInstalled: false,
  },
  {
    name: 'mistral',
    description: 'Mistral 7B is a 7.3B parameter model that demonstrates high performance',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['mistral', '7b'],
    isInstalled: false,
  },
  {
    name: 'mistral:7b',
    description: 'Mistral 7B - high performance 7B parameter model',
    size: 4.1 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['mistral', '7b'],
    isInstalled: false,
  },
  {
    name: 'orca-mini',
    description: 'Orca Mini is a 3B parameter model from Microsoft',
    size: 1.9 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['orca', 'microsoft', '3b'],
    isInstalled: false,
  },
  {
    name: 'orca-mini:3b',
    description: 'Orca Mini 3B - lightweight model good for basic tasks',
    size: 1.9 * 1024 * 1024 * 1024,
    modifiedAt: '2024-01-01T00:00:00Z',
    digest: 'sha256:1234567890abcdef',
    tags: ['orca', 'microsoft', '3b'],
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
    // Get current model
    const currentModel = await getCurrentModel();

    // Pull the new model first
    await sendOllamaStatusToRenderer(`Pulling new model: ${newModelName}`);
    await installModelWithStatus(newModelName);

    // If there was a current model, delete it to save space
    if (currentModel) {
      await sendOllamaStatusToRenderer(`Deleting old model: ${currentModel.name} to save space`);
      await deleteModel(currentModel.name);
    }

    // Initialize the new model
    await sendOllamaStatusToRenderer(`Initializing new model: ${newModelName}`);
    await ollama.chat({ model: newModelName });

    logger.info(`Successfully replaced model: ${currentModel?.name || 'none'} -> ${newModelName}`);
    return true;
  } catch (err) {
    logger.error(`Failed to pull and replace model ${newModelName}:`, err);
    return false;
  }
};
