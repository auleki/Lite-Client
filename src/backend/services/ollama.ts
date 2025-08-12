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

// No caching for models - always fetch fresh data

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

// Fetch models from Ollama registry - always fresh data, no caching
export const getAvailableModelsFromRegistry = async (
  offset = 0,
  limit = 20,
  searchQuery?: string,
  sortBy?: 'name' | 'downloads' | 'pulls' | 'updated_at' | 'last_updated' | 'created_at',
  sortOrder?: 'asc' | 'desc',
) => {
  logger.info(
    `Fetching fresh data from Ollama registry (offset: ${offset}, limit: ${limit}, search: ${searchQuery || 'none'}, sort: ${sortBy || 'default'}, order: ${sortOrder || 'default'})`,
  );

  // Build URL with confirmed working parameters
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });

  if (searchQuery && searchQuery.trim()) {
    params.append('search', searchQuery.trim());
  }
  if (sortBy) {
    params.append('sort_by', sortBy);
  }
  if (sortOrder) {
    params.append('order', sortOrder);
  }

  const url = `https://ollamadb.dev/api/v1/models?${params}`;
  logger.info(
    `🔍 DEBUG: API Call - offset:${offset}, limit:${limit}, search:'${searchQuery || 'none'}', sortBy:'${sortBy || 'none'}', sortOrder:'${sortOrder || 'none'}'`,
  );
  logger.info(`API URL: ${url}`);

  // Use the community API with search and sort support
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Morpheus-Client/1.0',
    },
  });

  logger.info(`Community API response status: ${response.status}`);

  if (!response.ok) {
    throw new Error(`Community API request failed: ${response.status} ${response.statusText}`);
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

  // Transform the data to match our expected format
  // The community API returns {models: [...]} format
  const models = data.models
    ? data.models.map((model: any, index: number) => {
        // Use model_name first (from ollamadb.dev), then fallback to name, then index-based fallback
        const modelName = model.model_name || model.name || `unknown-${index}`;

        // Debug log for first few models to check name extraction
        if (index < 5) {
          logger.info(
            `🔍 DEBUG Model ${index}: raw.model_name='${model.model_name}', raw.name='${model.name}', final='${modelName}'`,
          );
        }

        return {
          name: modelName,
          description: model.description || '',
          modifiedAt: model.last_updated || '2024-01-01T00:00:00Z',
          digest: model.digest || 'sha256:1234567890abcdef',
          tags: model.tags || ['ai', 'llm'],
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
    logger.info(`Found ${localModels.length} locally installed models: ${localModels.join(', ')}`);
  } catch (err) {
    logger.error('Failed to get local models for comparison:', err);
  }

  // Update the isInstalled flag for each model
  const updatedModels = models.map((model: any) => ({
    ...model,
    isInstalled: localModels.includes(model.name),
  }));

  // Check for duplicates in the final models array
  const modelNames = updatedModels.map((m) => m.name);
  const uniqueNames = new Set(modelNames);
  if (modelNames.length !== uniqueNames.size) {
    logger.warn(
      `🚨 DEBUG: Found ${modelNames.length - uniqueNames.size} duplicate model names in final array!`,
    );
    const duplicates = modelNames.filter((name, index) => modelNames.indexOf(name) !== index);
    logger.warn(`🚨 DEBUG: Duplicate names: ${duplicates.slice(0, 10).join(', ')}`);
  }

  logger.info(
    `Fetched ${updatedModels.length} models from registry (${uniqueNames.size} unique names)`,
  );
  return updatedModels;
};

// No cache functions needed - models are always fetched fresh

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

// Function to get the currently loaded model using /api/ps endpoint
export const getCurrentModel = async () => {
  try {
    // Use the /api/ps endpoint to get currently running/loaded models
    const response = await fetch(`${DEFAULT_OLLAMA_URL}api/ps`);

    if (!response.ok) {
      logger.warn(`Failed to fetch running models: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Return the first running model if any exist
    if (data.models && data.models.length > 0) {
      return data.models[0];
    }

    return null;
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
