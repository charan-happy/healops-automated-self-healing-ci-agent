import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersV2Controller } from './users-v2.controller';

@Module({
  controllers: [UsersV2Controller],
  providers: [UsersService],
})
export class UsersV2Module {}
