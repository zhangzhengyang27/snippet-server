import { SetMetadata } from '@nestjs/common';

/** 角色元数据键：由 `@Roles()` 写入，由 `RolesGuard` 读取。 */
export const ROLES_KEY = 'roles';

/**
 * 声明访问该 handler / controller 所需的角色（任一命中即可）。
 *
 * 用法：`@UseGuards(RequireAuthGuard, RolesGuard)` + `@Roles('admin')`。
 * 未标注 `@Roles` 的 handler 一律放行（由其他守卫决定鉴权）。
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
