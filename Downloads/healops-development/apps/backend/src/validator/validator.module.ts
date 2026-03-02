// ─── Validator Module ───────────────────────────────────────────────────────
// Language-aware pre-check validation before pushing to GitHub.
// Runs tsc --noEmit (TS), python -m py_compile (Python), or go build (Go)
// to catch obvious compilation errors before triggering the full CI pipeline.

import { Module } from '@nestjs/common';
import { ValidatorService } from './validator.service';

@Module({
  providers: [ValidatorService],
  exports: [ValidatorService],
})
export class ValidatorModule {}
