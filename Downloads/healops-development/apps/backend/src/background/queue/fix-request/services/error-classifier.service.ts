// ─── Error Classifier Service ───────────────────────────────────────────────
// Uses LLM to classify errors into one of the 10 supported types.
// Returns "out_of_scope" for errors that don't match any supported type.

import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '@ai/ai.service';
import {
  SUPPORTED_ERROR_TYPES,
  ErrorCategory,
  isErrorTypeSupported,
} from '../constants/error-types.constant';

/**
 * Strip markdown code fences (```json ... ```) that some LLMs wrap around JSON responses.
 */
function stripMarkdownFences(text: string): string {
  const fenced = text.match(/```(?:\w*)\s*\n?([\s\S]*?)\n?\s*```/);
  return fenced ? fenced[1]!.trim() : text.trim();
}

export interface ClassificationResult {
  errorType: string;
  category: ErrorCategory;
  confidence: number;
  isInScope: boolean;
  scopeReason: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

@Injectable()
export class ErrorClassifierService {
  private readonly logger = new Logger(ErrorClassifierService.name);

  constructor(private readonly aiService: AiService) {}

  async classify(
    errorMessage: string,
    codeSnippet: string,
    filePath?: string,
    language?: string,
  ): Promise<ClassificationResult> {
    const errorTypesDescription = SUPPORTED_ERROR_TYPES.map(
      (t) => `- "${t.code}": ${t.description}`,
    ).join('\n');

    const response = await this.aiService.structuredOutput(
      {
        messages: [
          {
            role: 'user' as const,
            content: [
              'Classify the following error into one of the supported types.',
              'If the error does NOT match any of the supported types, set error_type to "out_of_scope".',
              '',
              '## Supported Error Types',
              errorTypesDescription,
              '',
              '## Error Details',
              `Error message: ${errorMessage}`,
              filePath ? `File: ${filePath}` : '',
              language ? `Language: ${language}` : '',
              `Code snippet:\n\`\`\`\n${codeSnippet.slice(0, 3000)}\n\`\`\``,
              '',
              'Respond with JSON only.',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
        schema: {
          type: 'object',
          properties: {
            error_type: {
              type: 'string',
              description:
                'One of the supported error type codes, or "out_of_scope"',
            },
            confidence: {
              type: 'number',
              description: 'Confidence score between 0 and 1',
            },
            reasoning: {
              type: 'string',
              description: 'Brief explanation of why this classification was chosen',
            },
          },
          required: ['error_type', 'confidence', 'reasoning'],
        },
        schemaName: 'ErrorClassification',
      },
    );

    const content = response.data.content;
    let errorType = 'out_of_scope';
    let confidence = 0;
    let reasoning = '';

    try {
      const parsed = JSON.parse(stripMarkdownFences(content)) as Record<string, unknown>;
      const rawType = String(parsed['error_type'] ?? 'out_of_scope');
      errorType = rawType.toLowerCase();
      confidence = Number(parsed['confidence'] ?? 0);
      reasoning = String(parsed['reasoning'] ?? '');

      this.logger.log(
        `[CLASSIFY_RAW] LLM returned: type="${rawType}" → normalized="${errorType}" confidence=${String(confidence)}`,
      );
    } catch {
      this.logger.warn(`Failed to parse classification response: ${content.slice(0, 200)}`);
    }

    const isInScope = isErrorTypeSupported(errorType) && confidence >= 0.4;
    const matchedType = SUPPORTED_ERROR_TYPES.find((t) => t.code === errorType);

    const category = matchedType?.category ?? ErrorCategory.OUT_OF_SCOPE;
    const scopeReason = isInScope
      ? `Classified as ${errorType} with ${String(Math.round(confidence * 100))}% confidence: ${reasoning}`
      : `Out of scope: ${reasoning || 'Error type not in supported list or confidence too low'}`;

    this.logger.log(
      `Classification: type=${errorType} confidence=${String(confidence)} inScope=${String(isInScope)}`,
    );

    return {
      errorType: isInScope ? errorType : 'out_of_scope',
      category,
      confidence,
      isInScope,
      scopeReason,
      inputTokens: response.usage.promptTokens,
      outputTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
    };
  }
}
