import { TestService } from './test.service';
export declare class TestController {
    private readonly testService;
    constructor(testService: TestService);
    resetDb(): Promise<{
        message: string;
    }>;
}
