import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RouteNames } from '@common/route-names';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller({ path: RouteNames.USERS, version: '1' })
@ApiTags('Users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List all users with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    const result = await this.usersService.findAll(page, pageSize);

    return {
      data: result.data.map((user) => UserResponseDto.fromUserProfile(user)),
      meta: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getMyProfile(@CurrentUser() user: AuthUser) {
    const profile = await this.usersService.getProfile(user.id);
    return UserResponseDto.fromUserProfile(profile);
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const profile = await this.usersService.getProfile(id);
    return UserResponseDto.fromUserProfile(profile);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  async updateMyProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateUserDto,
  ) {
    const profile = await this.usersService.updateProfile(user.id, dto);
    return UserResponseDto.fromUserProfile(profile);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Soft delete a user' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.usersService.deactivateUser(id);
    return { message: 'User deactivated successfully' };
  }
}
