/**
 * Chat Completions Routes
 * Handles OpenAI-compatible chat completion requests
 */

import { logSecurityEvent } from '../logger.js';
import { analyzerClient } from '../grpc-client.js';
import { recordPiiDetection, recordPromptInjection } from '../observability.js';

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

    // Extract user content for analysis
    const userMessages = messages.filter(msg => msg.role === 'user');
    const userContent = userMessages.map(msg => msg.content).join('\n');

    // Log the request
    fastify.log.info({
      requestId: request.id,
      model,
      messageCount: messages.length,
      contentLength: totalContentLength,
      temperature,
      max_tokens,
      stream,
    }, 'Chat completion request received');

    try {
      // Phase 2.3 - Call Analyzer service to check content
      const analysisResult = await analyzerClient.checkContent({
        content: userContent,
        requestId: request.id,
        metadata: {
          client_ip: request.ip,
          user_agent: request.headers['user-agent'] || 'unknown',
          model: model || 'unknown',
        },
      });

      // Check if content is safe
      if (!analysisResult.is_safe) {
        // Set audit context for blocked request
        request.setAuditContext({
          is_blocked: true,
          block_reason: 'CONTENT_POLICY_VIOLATION',
          detected_issues_count: analysisResult.detected_issues.length,
          security_confidence: analysisResult.confidence_score,
        });

        // Content is not safe - return 403 with detected issues
        logSecurityEvent(
          'CONTENT_BLOCKED',
          {
            requestId: request.id,
            detectedIssuesCount: analysisResult.detected_issues.length,
            confidenceScore: analysisResult.confidence_score,
          },
          request
        );

        // Record metrics for detected security issues
        const piiIssues = analysisResult.detected_issues.filter(i =>
          ['API_KEY', 'EMAIL', 'PHONE', 'SSN', 'CREDIT_CARD', 'IP_ADDRESS', 'PERSON', 'LOCATION'].includes(i.type)
        );
        const injectionIssues = analysisResult.detected_issues.filter(i =>
          ['PROMPT_INJECTION', 'JAILBREAK', 'ENCODED_PAYLOAD', 'EXCESSIVE_SPECIAL_CHARS'].includes(i.type)
        );

        if (piiIssues.length > 0) {
          recordPiiDetection(piiIssues.length, piiIssues.map(i => i.type));
        }
        if (injectionIssues.length > 0) {
          recordPromptInjection(injectionIssues.length, injectionIssues.map(i => i.type));
        }

        // Format detected issues for response
        const issues = analysisResult.detected_issues.map(issue => ({
          type: issue.type,
          text: issue.text,
          position: { start: issue.start, end: issue.end },
          confidence: issue.confidence,
        }));

        reply.status(403);
        return {
          error: {
            type: 'ContentPolicyViolation',
            message: 'Content contains potential security issues and was blocked',
            requestId: request.id,
            timestamp: new Date().toISOString(),
            details: {
              is_safe: false,
              detected_issues: issues,
              confidence_score: analysisResult.confidence_score,
              redacted_preview: analysisResult.redacted_text?.substring(0, 100),
            },
          },
        };
      }

      // Content is safe - log and proceed
      fastify.log.info({
        requestId: request.id,
        is_safe: true,
        confidence_score: analysisResult.confidence_score,
      }, 'Content passed security checks');

      // TODO: Phase 3+ - Forward request to actual LLM provider
      // For now, return a mock response indicating content was safe
      reply.status(501);
      return {
        error: {
          type: 'NotImplementedError',
          message: 'Content passed security checks, but LLM integration is not yet implemented. This will be added in future phases.',
          requestId: request.id,
          timestamp: new Date().toISOString(),
          details: {
            security_check: {
              is_safe: true,
              confidence_score: analysisResult.confidence_score,
              detected_issues_count: analysisResult.detected_issues.length,
            },
            next_phase: 'LLM Provider Integration',
          },
        },
      };

    } catch (error) {
      // Handle Analyzer service errors
      fastify.log.error({
        requestId: request.id,
        error: error.message,
        stack: error.stack,
      }, 'Error calling Analyzer service');

      return reply.serviceUnavailable(
        'Security analysis service is temporarily unavailable. Please try again later.'
      );
    }
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
