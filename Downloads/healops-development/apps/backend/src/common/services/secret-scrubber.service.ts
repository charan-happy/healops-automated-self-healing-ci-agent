// ─── Secret Scrubber Service ────────────────────────────────────────────────
// Injectable NestJS wrapper around the secret-scrubber utility.
// Every string entering the LangGraph state passes through here first.

import { Injectable } from '@nestjs/common';
import { scrubSecrets, scrubObject, type ScrubResult } from '@common/utils/secret-scrubber';

@Injectable()
export class SecretScrubberService {
  scrub(text: string): ScrubResult {
    return scrubSecrets(text);
  }

  scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
    return scrubObject(obj);
  }
}
