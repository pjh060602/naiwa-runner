import { defineConfig } from 'vite';

// GitHub Pages 项目站点部署在子路径上：https://<user>.github.io/naiwa-runner/
// 只有生产构建走子路径；本地 dev / preview 仍用 '/'。
export const PAGES_BASE = '/naiwa-runner/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? PAGES_BASE : '/',
  server: {
    port: 5173,
    strictPort: true,
    // 手机真机联调要局域网可访问
    host: true,
    watch: {
      // 另一个执行者（naiwa-rig）用临时目录写文件，Windows 上会 EBUSY 把 watcher 打崩
      ignored: ['**/.*.tmpdir/**', '**/*.tmp', '**/node_modules/**', '**/dist/**'],
    },
  },
  preview: {
    port: 5174,
    strictPort: true,
    host: true,
  },
  build: {
    target: 'es2020',
    // three 本身约 500kB，这个提示对单页游戏没意义
    chunkSizeWarningLimit: 800,
  },
}));
