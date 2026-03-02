// ─── Common Module ──────────────────────────────────────────────────────────
// Global module exporting shared services available across the application.

import { Global, Module } from '@nestjs/common';
import { SecretScrubberService } from './services/secret-scrubber.service';

@Global()
@Module({
  providers: [SecretScrubberService],
  exports: [SecretScrubberService],
})
export class CommonModule {}
