import { RouteNames } from '@common/route-names';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class CookieAuthMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    let isDevToolRequest = req.path.includes(RouteNames.DEV_TOOLS);
    const isAdmin = isDevToolRequest;

    // TODO: Add admin app/user app check based on refferrer or some other logic
    // const isAdmin = isDevToolRequest || getAdminOrUser(req);

    const accessToken = !isAdmin ? req.cookies?.['sid'] : req.cookies?.['admin_sid'];
    const refreshToken = !isAdmin
      ? req.cookies?.['refresh_token']
      : req.cookies?.['admin_refresh_token'];
    const tempToken = !isAdmin ? req.cookies?.['temp_sid'] : req.cookies?.['admin_temp_sid'];

    if (accessToken && !req.headers['authorization']) {
      req.headers['authorization'] = `Bearer ${accessToken}`;
    } else if (refreshToken && !req.headers['authorization']) {
      req.headers['authorization'] = `Bearer ${refreshToken}`;
    } else if (tempToken && !req.headers['authorization']) {
      req.headers['authorization'] = `Bearer ${tempToken}`;
    }

    next();
  }
}
