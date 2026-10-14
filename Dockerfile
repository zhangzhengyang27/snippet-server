# 代码块 后端（snippet-server）— NAS 部署镜像
FROM node:20-alpine

WORKDIR /app

# 国内 npm 镜像，避免拉包超时（与 NAS dockerd 国内源互补）
RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# 迁移由部署脚本显式执行（app.module.ts: migrationsRun=false）
EXPOSE 3000
CMD ["node", "dist/main"]
