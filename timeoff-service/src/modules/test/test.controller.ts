import { Controller, Post } from '@nestjs/common';
import { TestService } from './test.service';

/**
 * Test-only controller for integration tests
 * Provides endpoints for test setup/teardown
 */
@Controller('test')
export class TestController {
  constructor(private readonly testService: TestService) {}

  /**
   * POST /test/reset-db
   * Clear all tables — used in test beforeEach hooks
   */
  @Post('reset-db')
  async resetDb() {
    await this.testService.clearDatabase();
    return { message: 'Database reset' };
  }
}
