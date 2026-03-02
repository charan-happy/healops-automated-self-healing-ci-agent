// ─── Validator Service ──────────────────────────────────────────────────────
// Pre-check validation — runs language-specific compilation/lint checks
// on the patched code before pushing to the healops/fix branch.

import { Injectable, Logger } from '@nestjs/common';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface PreCheckInput {
  attemptId: string;
  language: string;
  patchedFiles: Record<string, string>;
}

export interface PreCheckOutput {
  passed: boolean;
  buildOutput: string;
  errorMessage: string;
}

const SUBPROCESS_TIMEOUT_MS = 30_000;

@Injectable()
export class ValidatorService {
  private readonly logger = new Logger(ValidatorService.name);

  constructor(private readonly jobsRepository: HealopsJobsRepository) {}

  /**
   * Run language-specific pre-check validation on patched files.
   */
  async runPreCheck(input: PreCheckInput): Promise<PreCheckOutput> {
    this.logger.log(`Running pre-check for attempt ${input.attemptId} (${input.language})`);

    const lang = input.language.toLowerCase();
    let result: PreCheckOutput;

    switch (lang) {
      case 'typescript':
      case 'ts':
        result = this.checkTypeScript(input.patchedFiles);
        break;
      case 'python':
      case 'py':
        result = this.checkPython(input.patchedFiles);
        break;
      case 'go':
      case 'golang':
        result = this.checkGo(input.patchedFiles);
        break;
      default:
        this.logger.warn(`No pre-check available for language "${input.language}" — skipping`);
        result = {
          passed: true,
          buildOutput: `No pre-check available for language "${input.language}"`,
          errorMessage: '',
        };
        break;
    }

    // Record validation result
    await this.jobsRepository.createValidation({
      attemptId: input.attemptId,
      stage: 'pre_check',
      buildStatus: result.passed ? 'success' : 'failed',
      buildLogExcerpt: result.buildOutput.slice(0, 8000) || undefined,
      testStatus: 'skipped',
    });

    return result;
  }

  private checkTypeScript(patchedFiles: Record<string, string>): PreCheckOutput {
    const tempDir = mkdtempSync(join(tmpdir(), 'healops-ts-'));
    try {
      // Write patched files to temp directory
      for (const [filePath, content] of Object.entries(patchedFiles)) {
        const fullPath = join(tempDir, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
      }

      // Write a minimal tsconfig for isolated syntax/type checking
      writeFileSync(
        join(tempDir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            moduleResolution: 'node',
            target: 'ES2022',
            module: 'commonjs',
            esModuleInterop: true,
          },
          include: ['**/*.ts', '**/*.tsx'],
        }),
        'utf-8',
      );

      execSync('npx tsc --noEmit --pretty', {
        cwd: tempDir,
        timeout: SUBPROCESS_TIMEOUT_MS,
        stdio: 'pipe',
      });

      return { passed: true, buildOutput: 'TypeScript compilation succeeded', errorMessage: '' };
    } catch (error) {
      const stderr = (error as { stderr?: Buffer })?.stderr?.toString() ?? '';
      const stdout = (error as { stdout?: Buffer })?.stdout?.toString() ?? '';
      const output = (stderr || stdout).slice(0, 8000);
      this.logger.warn(`TypeScript pre-check failed:\n${output}`);
      return { passed: false, buildOutput: output, errorMessage: output };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private checkPython(patchedFiles: Record<string, string>): PreCheckOutput {
    const tempDir = mkdtempSync(join(tmpdir(), 'healops-py-'));
    try {
      const errors: string[] = [];

      for (const [filePath, content] of Object.entries(patchedFiles)) {
        const fullPath = join(tempDir, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');

        try {
          execSync(`python3 -m py_compile "${fullPath}"`, {
            cwd: tempDir,
            timeout: SUBPROCESS_TIMEOUT_MS,
            stdio: 'pipe',
          });
        } catch (fileError) {
          const stderr = (fileError as { stderr?: Buffer })?.stderr?.toString() ?? '';
          errors.push(`${filePath}: ${stderr.trim()}`);
        }
      }

      if (errors.length > 0) {
        const output = errors.join('\n').slice(0, 8000);
        this.logger.warn(`Python pre-check failed:\n${output}`);
        return { passed: false, buildOutput: output, errorMessage: output };
      }

      return { passed: true, buildOutput: 'Python compilation succeeded', errorMessage: '' };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private checkGo(patchedFiles: Record<string, string>): PreCheckOutput {
    const tempDir = mkdtempSync(join(tmpdir(), 'healops-go-'));
    try {
      for (const [filePath, content] of Object.entries(patchedFiles)) {
        const fullPath = join(tempDir, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
      }

      execSync('go build ./...', {
        cwd: tempDir,
        timeout: SUBPROCESS_TIMEOUT_MS,
        stdio: 'pipe',
      });

      return { passed: true, buildOutput: 'Go build succeeded', errorMessage: '' };
    } catch (error) {
      const stderr = (error as { stderr?: Buffer })?.stderr?.toString() ?? '';
      const stdout = (error as { stdout?: Buffer })?.stdout?.toString() ?? '';
      const output = (stderr || stdout).slice(0, 8000);
      this.logger.warn(`Go pre-check failed:\n${output}`);
      return { passed: false, buildOutput: output, errorMessage: output };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
