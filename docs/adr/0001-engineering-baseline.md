# ADR 0001：工程基线

- 状态：已采纳
- 日期：2026-07-24

## 决策

- 使用 Expo SDK 57、React Native 0.86、React 19.2 和 TypeScript 6。
- 使用 pnpm Monorepo，移动端位于 `apps/mobile`，纯业务规则位于 `packages/domain`。
- 使用 Vitest 统一运行 Domain 与首批 smoke tests。
- 第一阶段以简体中文为默认语言，结构上保留国际化入口。
- 暂定应用标识为 `app.wakewake.mobile`，接入商店前必须确认所有权与可用性。
- 无日期事项通过显式 `timing_kind = unscheduled` 表达，允许所有时间字段为空；这解决了规划文档中收集箱需求与非空时间约束的冲突。

## 后果

纯业务规则不得依赖 React Native。页面不得直接连接 Supabase。原生模块要求使用 Development Build，Expo Go 仅用于不依赖这些模块的早期 UI 预览。
