import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import {
  detectResources,
  envDetector,
  osDetector,
  processDetector,
} from '@opentelemetry/resources';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { context, trace } from '@opentelemetry/api';
import { EnvConfig } from '@config/env.config';

@Injectable()
export class OtelService implements OnModuleInit, OnModuleDestroy {
  private sdk: NodeSDK | null = null;
  private readonly logger = new Logger(OtelService.name);

  constructor(private readonly config: ConfigService<EnvConfig>) {}

  async onModuleInit() {
    try {
      const env = this.config.get<string>('NODE_ENV') || 'development';
      const enableOtel = env === 'development';
      if (!enableOtel) {
        this.logger.log(`OpenTelemetry is disabled in ${env} mode.`);
        return;
      }

      const serviceName = this.config.get<string>('OTEL_SERVICE_NAME') || 'nestjs-app';
      // Fix: Use localhost instead of jaeger hostname for host connectivity
      const otlpEndpoint = 'http://localhost:4318/v1/traces';

      this.logger.log(`🚀 Initializing OpenTelemetry for service: ${serviceName}`);
      this.logger.log(`📤 OTLP Endpoint: ${otlpEndpoint}`);

      // Set up context manager
      context.setGlobalContextManager(new AsyncLocalStorageContextManager());

      // Detect resources and ensure service name is set
      const resource = await detectResources({
        detectors: [envDetector, processDetector, osDetector],
      });

      // Add service information to the resource
      resource.attributes['service.name'] = serviceName;
      resource.attributes['service.version'] = '1.0.0';

      // Create trace exporter with proper configuration
      const traceExporter = new OTLPTraceExporter({
        url: otlpEndpoint,
        headers: {
          'Content-Type': 'application/x-protobuf',
        },
      });

      // Initialize SDK
      this.sdk = new NodeSDK({
        serviceName,
        resource,
        contextManager: new AsyncLocalStorageContextManager(),
        traceExporter,
        instrumentations: [
          getNodeAutoInstrumentations({
            // Disable some instrumentations that might cause issues
            '@opentelemetry/instrumentation-fs': {
              enabled: false,
            },
            '@opentelemetry/instrumentation-dns': {
              enabled: false,
            },
          }),
        ],
      });

      // Start the SDK
      await this.sdk.start();

      this.logger.log(`✅ OpenTelemetry tracing started for: ${serviceName}`);
      this.logger.log(`📤 Exporting traces to: ${otlpEndpoint}`);

      // Test trace generation
      this.generateTestTrace();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Failed to initialize OpenTelemetry: ${errorMessage}`, errorStack);
    }
  }

  async onModuleDestroy() {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.logger.log('🛑 OpenTelemetry SDK shut down');
    }
  }

  /**
   * Generate a test trace to verify OpenTelemetry is working
   */
  private generateTestTrace() {
    try {
      const tracer = trace.getTracer('nestjs-app', '1.0.0');
      const span = tracer.startSpan('otel-test-trace');

      span.setAttributes({
        'test.type': 'initialization',
        'test.status': 'success',
        'service.name': 'nestjs-app',
      });

      span.addEvent('OpenTelemetry initialized successfully');
      span.end();

      this.logger.log('🧪 Test trace generated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`⚠️ Failed to generate test trace: ${errorMessage}`);
    }
  }

  /**
   * Get the current tracer instance
   */
  getTracer(name: string, version?: string) {
    return trace.getTracer(name, version);
  }

  /**
   * Check if OpenTelemetry is active
   */
  isActive(): boolean {
    return this.sdk !== null;
  }
}
