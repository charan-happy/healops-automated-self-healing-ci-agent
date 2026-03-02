import { CostTrackingService } from './cost-tracking.service';
import { CostTrackingRepository } from '@db/repositories/healops/cost-tracking.repository';
import { ConfigService } from '@nestjs/config';

describe('CostTrackingService', () => {
  let service: CostTrackingService;
  let mockRepository: jest.Mocked<CostTrackingRepository>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockRepository = {
      isBudgetExhausted: jest.fn(),
      upsertMonthlyCost: jest.fn(),
      findCurrentMonthCost: jest.fn(),
      isOnCooldown: jest.fn(),
    } as unknown as jest.Mocked<CostTrackingRepository>;

    mockConfigService = {
      get: jest.fn().mockReturnValue({
        cost: {
          inputPricePerToken: 0.000003,
          outputPricePerToken: 0.000015,
        },
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new CostTrackingService(mockRepository, mockConfigService);
  });

  describe('hasBudget()', () => {
    it('should return true when budget is not exhausted', async () => {
      mockRepository.isBudgetExhausted.mockResolvedValue(false);
      const result = await service.hasBudget('org-1');
      expect(result).toBe(true);
    });

    it('should return false when budget is exhausted', async () => {
      mockRepository.isBudgetExhausted.mockResolvedValue(true);
      const result = await service.hasBudget('org-1');
      expect(result).toBe(false);
    });
  });

  describe('recordUsage()', () => {
    it('should call upsertMonthlyCost twice (repo + org level)', async () => {
      mockRepository.upsertMonthlyCost.mockResolvedValue(null);

      await service.recordUsage({
        organizationId: 'org-1',
        repositoryId: 'repo-1',
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(mockRepository.upsertMonthlyCost).toHaveBeenCalledTimes(2);

      // First call: repo-level with repositoryId
      const firstCall = mockRepository.upsertMonthlyCost.mock.calls[0]?.[0];
      expect(firstCall).toMatchObject({
        organizationId: 'org-1',
        repositoryId: 'repo-1',
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalJobs: 1,
      });

      // Second call: org-level without repositoryId
      const secondCall = mockRepository.upsertMonthlyCost.mock.calls[1]?.[0];
      expect(secondCall).toMatchObject({
        organizationId: 'org-1',
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalJobs: 1,
      });
    });

    it('should calculate estimated cost correctly', async () => {
      mockRepository.upsertMonthlyCost.mockResolvedValue(null);

      await service.recordUsage({
        organizationId: 'org-1',
        repositoryId: 'repo-1',
        inputTokens: 10000,
        outputTokens: 5000,
      });

      // Expected: 10000 * 0.000003 + 5000 * 0.000015 = 0.03 + 0.075 = 0.105
      const call = mockRepository.upsertMonthlyCost.mock.calls[0]?.[0];
      expect(parseFloat(call?.estimatedCostUsd ?? '0')).toBeCloseTo(0.105, 6);
    });
  });

  describe('getMonthlyUsage()', () => {
    it('should return null when no row exists', async () => {
      mockRepository.findCurrentMonthCost.mockResolvedValue(null);
      const result = await service.getMonthlyUsage('org-1');
      expect(result).toBeNull();
    });

    it('should return formatted cost summary', async () => {
      mockRepository.findCurrentMonthCost.mockResolvedValue({
        id: 'uuid-1',
        organizationId: 'org-1',
        repositoryId: null,
        periodMonth: '2026-02-01',
        totalInputTokens: 50000,
        totalOutputTokens: 20000,
        totalJobs: 10,
        totalJobsSucceeded: 8,
        totalJobsEscalated: 2,
        estimatedCostUsd: '0.4500',
        budgetLimitUsd: '100.0000',
        budgetExhausted: false,
        updatedAt: new Date(),
      });

      const result = await service.getMonthlyUsage('org-1');
      expect(result).toMatchObject({
        organizationId: 'org-1',
        totalJobs: 10,
        totalJobsSucceeded: 8,
        totalJobsEscalated: 2,
        estimatedCostUsd: '0.4500',
        budgetExhausted: false,
      });
    });
  });

  describe('isOnCooldown()', () => {
    it('should delegate to repository', async () => {
      mockRepository.isOnCooldown.mockResolvedValue(true);
      const result = await service.isOnCooldown('repo-1', 'main', 'TYPE_ERROR');
      expect(result).toBe(true);
      expect(mockRepository.isOnCooldown).toHaveBeenCalledWith('repo-1', 'main', 'TYPE_ERROR');
    });
  });
});
