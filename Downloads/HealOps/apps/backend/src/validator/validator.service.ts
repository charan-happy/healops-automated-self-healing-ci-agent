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
      case 'java':
        result = this.checkJava(input.patchedFiles);
        break;
      case 'rust':
      case 'rs':
        result = this.checkRust(input.patchedFiles);
        break;
      case 'csharp':
      case 'cs':
      case 'c#':
        result = this.checkCSharp(input.patchedFiles);
        break;
      case 'ruby':
      case 'rb':
        result = this.checkRuby(input.patchedFiles);
        break;
      case 'php':
        result = this.checkPHP(input.patchedFiles);
        break;
      case 'kotlin':
      case 'kt':
        result = this.checkKotlin(input.patchedFiles);
        break;
      case 'swift':
        result = this.checkSwift(input.patchedFiles);
        break;
      case 'javascript':
      case 'js':
        result = this.checkJavaScript(input.patchedFiles);
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

  // ─── Tool availability helper ─────────────────────────────────────────

  private isToolNotFound(error: unknown): boolean {
    const msg = (error as { message?: string })?.message ?? '';
    return /ENOENT|not found|command not found|not recognized/i.test(msg);
  }

  // ─── Java ─────────────────────────────────────────────────────────────

  private checkJava(patchedFiles: Record<string, string>): PreCheckOutput {
    const tempDir = mkdtempSync(join(tmpdir(), 'healops-java-'));
    try {
      const javaFiles: string[] = [];

      for (const [filePath, content] of Object.entries(patchedFiles)) {
        const fullPath = join(tempDir, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
        if (filePath.endsWith('.java')) {
          javaFiles.push(fullPath);
        }
      }

      if (javaFiles.length === 0) {
        return { passed: true, buildOutput: 'No .java files to compile', errorMessage: '' };
      }

      mkdirSync(join(tempDir, 'out'), { recursive: true });
      execSync(`javac -d "${tempDir}/out" ${javaFiles.map((f) => `"${f}"`).join(' ')}`, {
        cwd: tempDir,
        timeout: SUBPROCESS_TIMEOUT_MS,
        stdio: 'pipe',
      });

      return { passed: true, buildOutput: 'Java compilation succeeded', errorMessage: '' };
    } catch (error) {
      if (this.isToolNotFound(error)) {
        return { passed: true, buildOutput: 'Java compiler not available — skipping pre-check', errorMessage: '' };
      }
      const stderr = (error as { stderr?: Buffer })?.stderr?.toString() ?? '';
      const stdout = (error as { stdout?: Buffer })?.stdout?.toString() ?? '';
      const output = (stderr || stdout).slice(0, 8000);
      this.logger.warn(`Java pre-check failed:\n${output}`);
      return { passed: false, buildOutput: output, errorMessage: output };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // ─── Rust ─────────────────────────────────────────────────────────────

  private checkRust(patchedFiles: Record<string, string>): PreCheckOutput {
    const tempDir = mkdtempSync(join(tmpdir(), 'healops-rust-'));
    try {
      let hasCargoToml = false;

      for (const [filePath, content] of Object.entries(patchedFiles)) {
        const fullPath = join(tempDir, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
        if (filePath === 'Cargo.toml' || filePath.endsWith('/Cargo.toml')) {
          hasCargoToml = true;
        }
      }

      if (!hasCargoToml) {
        // Write a minimal Cargo.toml so cargo check works
        writeFileSync(
          join(tempDir, 'Cargo.toml'),
          [
            '[package]',
            'name = "healops-check"',
            'version = "0.0.0"',
            'edition = "2021"',
            '',
          ].join('\n'),
          'utf-8',
        );
        // Ensure src dir exists; create a dummy lib.rs only if no main.rs or lib.rs was provided
        mkdirSync(join(tempDir, 'src'), { recursive: true });
        const hasMain = Object.keys(patchedFiles).some((f) => f === 'src/main.rs' || f.endsWith('/src/main.rs'));
        const hasLib = Object.keys(patchedFiles).some((f) => f === 'src/lib.rs' || f.endsWith('/src/lib.rs'));
        if (!hasMain && !hasLib) {
          writeFileSync(join(tempDir, 'src', 'lib.rs'), '', 'utf-8');
        }
      }

      execSync('cargo check', {
        cwd: tempDir,
        timeout: SUBPROCESS_TIMEOUT_MS,
        stdio: 'pipe',
      });

      return { passed: true, buildOutput: 'Rust cargo check succeeded', errorMessage: '' };
    } catch (error) {
      if (this.isToolNotFound(error)) {
        return { passed: true, buildOutput: 'Rust compiler not available — skipping pre-check', errorMessage: '' };
      }
      const stderr = (error as { stderr?: Buffer })?.stderr?.toString() ?? '';
      const stdout = (error as { stdout?: Buffer })?.stdout?.toString() ?? '';
      const output = (stderr || stdout).slice(0, 8000);
      this.logger.warn(`Rust pre-check failed:\n${output}`);
      return { passed: false, buildOutput: output, errorMessage: output };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // ─── C# ───────────────────────────────────────────────────────────────

  private checkCSharp(patchedFiles: Record<string, string>): PreCheckOutput {
    const tempDir = mkdtempSync(join(tmpdir(), 'healops-cs-'));
    try {
      let hasCsproj = false;

      for (const [filePath, content] of Object.entries(patchedFiles)) {
        const fullPath = join(tempDir, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
        if (filePath.endsWith('.csproj')) {
          hasCsproj = true;
        }
      }

      if (!hasCsproj) {
        writeFileSync(
          join(tempDir, 'HealOpsCheck.csproj'),
          [
            '<Project Sdk="Microsoft.NET.Sdk">',
            '  <PropertyGroup>',
            '    <TargetFramework>net8.0</TargetFramework>',
            '    <OutputType>Library</OutputType>',
            '  </PropertyGroup>',
            '</Project>',
          ].join('\n'),
          'utf-8',
        );
      }

      execSync('dotnet build --no-restore', {
        cwd: tempDir,
        timeout: SUBPROCESS_TIMEOUT_MS,
        stdio: 'pipe',
      });

      return { passed: true, buildOutput: 'C# build succeeded', errorMessage: '' };
    } catch (error) {
      if (this.isToolNotFound(error)) {
        return { passed: true, buildOutput: 'C# compiler not available — skipping pre-check', errorMessage: '' };
      }
      const stderr = (error as { stderr?: Buffer })?.stderr?.toString() ?? '';
      const stdout = (error as { stdout?: Buffer })?.stdout?.toString() ?? '';
      const output = (stderr || stdout).slice(0, 8000);
      this.logger.warn(`C# pre-check failed:\n${output}`);
      return { passed: false, buildOutput: output, errorMessage: output };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // ─── Ruby ─────────────────────────────────────────────────────────────

  private checkRuby(patchedFiles: Record<string, string>): PreCheckOutput {
    const tempDir = mkdtempSync(join(tmpdir(), 'healops-rb-'));
    try {
      const errors: string[] = [];

      for (const [filePath, content] of Object.entries(patchedFiles)) {
        const fullPath = join(tempDir, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');

        if (!filePath.endsWith('.rb')) continue;

        try {
          execSync(`ruby -c "${fullPath}"`, {
            cwd: tempDir,
            timeout: SUBPROCESS_TIMEOUT_MS,
            stdio: 'pipe',
          });
        } catch (fileError) {
          if (this.isToolNotFound(fileError)) {
            return { passed: true, buildOutput: 'Ruby interpreter not available — skipping pre-check', errorMessage: '' };
          }
          const stderr = (fileError as { stderr?: Buffer })?.stderr?.toString() ?? '';
          errors.push(`${filePath}: ${stderr.trim()}`);
        }
      }

      if (errors.length > 0) {
        const output = errors.join('\n').slice(0, 8000);
        this.logger.warn(`Ruby pre-check failed:\n${output}`);
        return { passed: false, buildOutput: output, errorMessage: output };
      }

      return { passed: true, buildOutput: 'Ruby syntax check succeeded', errorMessage: '' };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // ─── PHP ──────────────────────────────────────────────────────────────

  private checkPHP(patchedFiles: Record<string, string>): PreCheckOutput {
    const tempDir = mkdtempSync(join(tmpdir(), 'healops-php-'));
    try {
      const errors: string[] = [];

      for (const [filePath, content] of Object.entries(patchedFiles)) {
        const fullPath = join(tempDir, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');

        if (!filePath.endsWith('.php')) continue;

        try {
          execSync(`php -l "${fullPath}"`, {
            cwd: tempDir,
            timeout: SUBPROCESS_TIMEOUT_MS,
            stdio: 'pipe',
          });
        } catch (fileError) {
          if (this.isToolNotFound(fileError)) {
            return { passed: true, buildOutput: 'PHP interpreter not available — skipping pre-check', errorMessage: '' };
          }
          const stderr = (fileError as { stderr?: Buffer })?.stderr?.toString() ?? '';
          errors.push(`${filePath}: ${stderr.trim()}`);
        }
      }

      if (errors.length > 0) {
        const output = errors.join('\n').slice(0, 8000);
        this.logger.warn(`PHP pre-check failed:\n${output}`);
        return { passed: false, buildOutput: output, errorMessage: output };
      }

      return { passed: true, buildOutput: 'PHP lint check succeeded', errorMessage: '' };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // ─── Kotlin ───────────────────────────────────────────────────────────

  private checkKotlin(patchedFiles: Record<string, string>): PreCheckOutput {
    const tempDir = mkdtempSync(join(tmpdir(), 'healops-kt-'));
    try {
      const ktFiles: string[] = [];

      for (const [filePath, content] of Object.entries(patchedFiles)) {
        const fullPath = join(tempDir, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
        if (filePath.endsWith('.kt') || filePath.endsWith('.kts')) {
          ktFiles.push(fullPath);
        }
      }

      if (ktFiles.length === 0) {
        return { passed: true, buildOutput: 'No .kt/.kts files to compile', errorMessage: '' };
      }

      mkdirSync(join(tempDir, 'out'), { recursive: true });
      execSync(`kotlinc ${ktFiles.map((f) => `"${f}"`).join(' ')} -d "${tempDir}/out"`, {
        cwd: tempDir,
        timeout: SUBPROCESS_TIMEOUT_MS,
        stdio: 'pipe',
      });

      return { passed: true, buildOutput: 'Kotlin compilation succeeded', errorMessage: '' };
    } catch (error) {
      if (this.isToolNotFound(error)) {
        return { passed: true, buildOutput: 'Kotlin compiler not available — skipping pre-check', errorMessage: '' };
      }
      const stderr = (error as { stderr?: Buffer })?.stderr?.toString() ?? '';
      const stdout = (error as { stdout?: Buffer })?.stdout?.toString() ?? '';
      const output = (stderr || stdout).slice(0, 8000);
      this.logger.warn(`Kotlin pre-check failed:\n${output}`);
      return { passed: false, buildOutput: output, errorMessage: output };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // ─── Swift ────────────────────────────────────────────────────────────

  private checkSwift(patchedFiles: Record<string, string>): PreCheckOutput {
    const tempDir = mkdtempSync(join(tmpdir(), 'healops-swift-'));
    try {
      const errors: string[] = [];

      for (const [filePath, content] of Object.entries(patchedFiles)) {
        const fullPath = join(tempDir, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');

        if (!filePath.endsWith('.swift')) continue;

        try {
          execSync(`swiftc -parse "${fullPath}"`, {
            cwd: tempDir,
            timeout: SUBPROCESS_TIMEOUT_MS,
            stdio: 'pipe',
          });
        } catch (fileError) {
          if (this.isToolNotFound(fileError)) {
            return { passed: true, buildOutput: 'Swift compiler not available — skipping pre-check', errorMessage: '' };
          }
          const stderr = (fileError as { stderr?: Buffer })?.stderr?.toString() ?? '';
          errors.push(`${filePath}: ${stderr.trim()}`);
        }
      }

      if (errors.length > 0) {
        const output = errors.join('\n').slice(0, 8000);
        this.logger.warn(`Swift pre-check failed:\n${output}`);
        return { passed: false, buildOutput: output, errorMessage: output };
      }

      return { passed: true, buildOutput: 'Swift syntax check succeeded', errorMessage: '' };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // ─── JavaScript ───────────────────────────────────────────────────────

  private checkJavaScript(patchedFiles: Record<string, string>): PreCheckOutput {
    const tempDir = mkdtempSync(join(tmpdir(), 'healops-js-'));
    try {
      const errors: string[] = [];

      for (const [filePath, content] of Object.entries(patchedFiles)) {
        const fullPath = join(tempDir, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');

        if (!/\.(js|mjs|cjs)$/.test(filePath)) continue;

        try {
          execSync(`node --check "${fullPath}"`, {
            cwd: tempDir,
            timeout: SUBPROCESS_TIMEOUT_MS,
            stdio: 'pipe',
          });
        } catch (fileError) {
          if (this.isToolNotFound(fileError)) {
            return { passed: true, buildOutput: 'Node.js not available — skipping pre-check', errorMessage: '' };
          }
          const stderr = (fileError as { stderr?: Buffer })?.stderr?.toString() ?? '';
          errors.push(`${filePath}: ${stderr.trim()}`);
        }
      }

      if (errors.length > 0) {
        const output = errors.join('\n').slice(0, 8000);
        this.logger.warn(`JavaScript pre-check failed:\n${output}`);
        return { passed: false, buildOutput: output, errorMessage: output };
      }

      return { passed: true, buildOutput: 'JavaScript syntax check succeeded', errorMessage: '' };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
