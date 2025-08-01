import axios, { AxiosInstance } from 'axios';
import { logger } from './logger';

// Constants
const MORPHEUS_API_BASE_URL = 'https://api.mor.org/api/v1';

// Types
export interface MorpheusModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface MorpheusModelsResponse {
  object: string;
  data: MorpheusModel[];
}

export interface MorpheusChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MorpheusChatRequest {
  model: string;
  messages: MorpheusChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface MorpheusChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: MorpheusChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface MorpheusConfig {
  apiKey: string;
  baseUrl?: string;
}

class MorpheusAPIService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(config: MorpheusConfig) {
    this.apiKey = config.apiKey;

    this.client = axios.create({
      baseURL: config.baseUrl || MORPHEUS_API_BASE_URL,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 60000, // 60 second timeout
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info(`Morpheus API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Morpheus API Request Error:', error);
        return Promise.reject(error);
      },
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info(`Morpheus API Response: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        logger.error('Morpheus API Response Error:', error.response?.data || error.message);
        return Promise.reject(error);
      },
    );
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/models');
      return response.status === 200;
    } catch (error) {
      logger.error('Morpheus API connection test failed:', error);
      return false;
    }
  }

  /**
   * Get available models from Morpheus API
   */
  async getModels(): Promise<MorpheusModel[]> {
    try {
      const response = await this.client.get<MorpheusModelsResponse>('/models');
      return response.data.data || [];
    } catch (error) {
      logger.error('Failed to fetch Morpheus models:', error);
      throw new Error('Failed to fetch models from Morpheus API');
    }
  }

  /**
   * Send a chat completion request to Morpheus API
   */
  async chat(request: MorpheusChatRequest): Promise<MorpheusChatResponse> {
    try {
      const response = await this.client.post<MorpheusChatResponse>('/chat/completions', request);
      return response.data;
    } catch (error) {
      logger.error('Morpheus chat request failed:', error);
      throw new Error('Failed to get response from Morpheus API');
    }
  }

  /**
   * Stream chat completion (for future implementation)
   */
  async chatStream(request: MorpheusChatRequest, onChunk: (chunk: string) => void): Promise<void> {
    try {
      const streamRequest = { ...request, stream: true };

      const response = await this.client.post('/chat/completions', streamRequest, {
        responseType: 'stream',
      });

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
      });
    } catch (error) {
      logger.error('Morpheus stream chat failed:', error);
      throw new Error('Failed to stream from Morpheus API');
    }
  }

  /**
   * Simple question/answer interface for compatibility with existing Ollama interface
   */
  async ask(query: string, model: string = 'llama-3.3-70b'): Promise<string> {
    const request: MorpheusChatRequest = {
      model,
      messages: [
        {
          role: 'user',
          content: query,
        },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    };

    try {
      const response = await this.chat(request);
      return response.choices[0]?.message?.content || 'No response received';
    } catch (error) {
      logger.error('Morpheus ask failed:', error);
      throw error;
    }
  }
}

// Global instance management
let morpheusAPIInstance: MorpheusAPIService | null = null;

export const initializeMorpheusAPI = (config: MorpheusConfig): MorpheusAPIService => {
  morpheusAPIInstance = new MorpheusAPIService(config);
  return morpheusAPIInstance;
};

export const getMorpheusAPI = (): MorpheusAPIService | null => {
  return morpheusAPIInstance;
};

export const destroyMorpheusAPI = (): void => {
  morpheusAPIInstance = null;
};

// Export the service for external use
export { MorpheusAPIService };
