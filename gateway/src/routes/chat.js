/**
 * Chat Completions Routes
 * Handles OpenAI-compatible chat completion requests
 */

import { logSecurityEvent } from '../logger.js';

/**
 * Chat completions route
 * Accepts OpenAI-compatible requests
 */
export default async function chatRoutes(fastify, options) {
  /**
   * POST /v1/chat/completions
   * OpenAI-compatible chat completion endpoint
   * Currently returns 501 Not Implemented (skeleton phase)
   */
  fastify.post('/v1/chat/completions', {
    schema: {
      description: 'Chat completion endpoint (OpenAI-compatible)',
      tags: ['chat'],
      body: {
        type: 'object',
        required: ['messages'],
        properties: {
          model: {
            type: 'string',
            description: 'Model to use for completion',
            default: 'gpt-4',
          },
          messages: {
            type: 'array',
            description: 'Array of message objects',
            items: {
              type: 'object',
              required: ['role', 'content'],
              properties: {
                role: {
                  type: 'string',
                  enum: ['system', 'user', 'assistant'],
                },
                content: {
                  type: 'string',
                },
                name: {
                  type: 'string',
                },
              },
            },
          },
          temperature: {
            type: 'number',
            minimum: 0,
            maximum: 2,
            default: 1,
          },
          max_tokens: {
            type: 'integer',
            minimum: 1,
          },
          stream: {
            type: 'boolean',
            default: false,
          },
        },
      },
      response: {
        501: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                message: { type: 'string' },
                requestId: { type: 'string' },
                timestamp: { type: 'string' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
                requestId: { type: 'string' },
                timestamp: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { messages, model, temperature, max_tokens, stream } = request.body;

    // Validate request
    if (!messages || messages.length === 0) {
      return reply.badRequest('Messages array is required and must not be empty');
    }

    // Validate content length
    const totalContentLength = messages
      .map(msg => msg.content?.length || 0)
      .reduce((sum, len) => sum + len, 0);

    if (totalContentLength < fastify.config.security.minContentLength) {
      return reply.badRequest(
        `Content too short. Minimum length: ${fastify.config.security.minContentLength} characters`
      );
    }

    if (totalContentLength > fastify.config.security.maxContentLength) {
      return reply.badRequest(
        `Content too long. Maximum length: ${fastify.config.security.maxContentLength} characters`
      );
    }

    // Extract user content for logging
    const userMessages = messages.filter(msg => msg.role === 'user');
    const userContent = userMessages.map(msg => msg.content).join(' ');

    // Log the request (for debugging in skeleton phase)
    fastify.log.info({
      requestId: request.id,
      model,
      messageCount: messages.length,
      contentLength: totalContentLength,
      temperature,
      max_tokens,
      stream,
    }, 'Chat completion request received');

    // TODO: Phase 2.3 - Implement actual security checks:
    // 1. Call analyzer service via gRPC to check content
    // 2. If is_safe=false, return 403 with detected issues
    // 3. If is_safe=true, forward to LLM provider

    // For skeleton phase, return 501 Not Implemented
    reply.status(501);
    return {
      error: {
        type: 'NotImplementedError',
        message: 'Chat completion endpoint is not yet implemented. This is a skeleton service. Full implementation will be added in Phase 2.3 (Gateway-Analyzer gRPC Integration).',
        requestId: request.id,
        timestamp: new Date().toISOString(),
        details: {
          phase: 'Phase 1.2 - Gateway Service Skeleton',
          nextPhase: 'Phase 2.3 - Gateway-Analyzer gRPC Integration',
          receivedRequest: {
            model,
            messageCount: messages.length,
            contentLength: totalContentLength,
          },
        },
      },
    };
  });

  /**
   * GET /v1/models
   * List available models (OpenAI-compatible)
   */
  fastify.get('/v1/models', {
    schema: {
      description: 'List available models',
      tags: ['models'],
      response: {
        200: {
          type: 'object',
          properties: {
            object: { type: 'string' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  object: { type: 'string' },
                  created: { type: 'number' },
                  owned_by: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    // Return mock model list for skeleton phase
    return {
      object: 'list',
      data: [
        {
          id: fastify.config.llm.openai.model,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'openai',
        },
        {
          id: fastify.config.llm.anthropic.model,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'anthropic',
        },
      ],
    };
  });
}
