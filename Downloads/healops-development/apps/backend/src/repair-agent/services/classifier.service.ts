// ─── Classifier Service ─────────────────────────────────────────────────────
// Classifies CI/CD failures into one of the 26 supported error types.
// Delegates pattern matching to LogParserService (single source of truth),
// then enriches with DB metadata (isAutoFixable, confidence).

import { Injectable } from '@nestjs/common';
import { FailuresRepository } from '@db/repositories/healops/failures.repository';
import { LogParserService } from './log-parser.service';

export interface ClassificationResult {
  errorTypeCode: string;
  confidence: number;
  isAutoFixable: boolean;
}

@Injectable()
export class ClassifierService {

  constructor(
    private readonly failuresRepository: FailuresRepository,
    private readonly logParserService: LogParserService,
  ) {}

  /**
   * Classify an error snippet into a known error type.
   * Delegates pattern matching to LogParserService to avoid duplicate regex sets.
   */
  async classify(
    errorSnippet: string,
    language: string,
  ): Promise<ClassificationResult> {
    const errorTypeCode = this.logParserService.classifyErrorType(errorSnippet, language);

    // Look up error type in DB to check if auto-fixable
    const errorType = await this.failuresRepository.findErrorTypeByCode(errorTypeCode);

    return {
      errorTypeCode,
      confidence: errorType ? 0.85 : 0.5,
      isAutoFixable: errorType?.isAutoFixable ?? false,
    };
  }
}
