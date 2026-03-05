import { Module } from '@nestjs/common';
import { DevToolsController } from './dev-tools.controller';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'views'),
      renderPath: '/dev-tools',
    }),
  ],
  controllers: [DevToolsController],
  providers: [],
})
export class DevToolsModule {}
