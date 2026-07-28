# WakeWake

把每件事放回它该在的时间。WakeWake 是一款 **Android 优先**的个人日程/待办应用；个人日用 V1 采用本地优先方案，无需账号即可使用。

## 个人日用 V1

V1 的目标是在一台 Android 设备上可靠完成“记录 → 查看 → 提醒 → 完成 → 备份”的日常闭环：

- 单用户数据以 SQLite 保存在设备本地，界面不依赖网络。
- 使用系统本地通知；通知可能受系统权限、省电策略和厂商限制影响，不承诺绝对准时。
- 支持普通、全天、无日期事项，以及多条提醒。
- 重复仅支持每日或每周，`interval = 1` 且永不结束；系列的时间锚点创建后锁定。
- 全天事项的提醒基准为事项日期的设备当地 09:00。
- 通过用户主动导出和导入版本化 JSON 文件完成备份与恢复。
- 不申请 Android 精确闹钟权限，按系统允许的非精确方式调度提醒。

账号体系、Supabase 云同步、多设备冲突处理和远程推送均延期到 V1 之后。仓库中的 `supabase/` 配置、迁移和 RLS 继续作为后续能力的骨架保留，但不进入 V1 运行链路。

详细范围见 `APP_BUILD_PLAN.md`，架构和时间语义见 `docs/adr/`。

## 开始开发

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

常用命令：

```bash
corepack pnpm check       # 格式、Lint、类型与测试
corepack pnpm web         # Web 原型，不代表 V1 发布平台
corepack pnpm android     # 首要目标（需要 Android SDK 或连接设备）
corepack pnpm ios         # 后续兼容验证（需要 macOS，Linux 请使用 EAS Build）
corepack pnpm --filter @wakewake/mobile start:devtools  # 启用独立 React Native DevTools
```

## 仓库结构

- `apps/mobile`：Expo Router 移动应用。
- `packages/domain`：不依赖 React Native 的领域规则和 Zod Schema。
- `supabase`：为后续账号与同步保留的配置、迁移和数据库测试骨架。
- `docs`：工程决策与环境说明。
- `APP_BUILD_PLAN.md`：个人日用 V1 的产品和技术构建基线。

## 视觉方向

界面以“时间刻度纸”为隐喻：数字时间使用等宽字体，内容文本保持清晰的系统字体，单一靛蓝作为操作重点；分类通过小色标、名称和位置共同表达，不仅依赖颜色。浅色背景为冷灰纸面，深色模式单独选色而非简单反转。

## 数据与隐私

V1 不要求登录，也不会把事项发送到 WakeWake 服务端。事项标题、备注、分类、提醒和设置保存在本机 SQLite 中；JSON 备份只有在用户主动导出时生成，并由用户决定保存位置。日志不得采集事项正文或备份内容。

## 当前里程碑

当前工程已具备 Expo Router 四入口原型、快速新建流程、共享领域 Schema、CI，以及保留的 Supabase 数据/RLS 骨架。接下来优先完成 SQLite Repository、核心事项闭环、本地通知对账与 JSON 备份恢复；静态演示数据不会作为 V1 持久化方案。

## 当前环境限制

当前 Linux 主机尚未配置完整 JDK/Android SDK，Docker daemon 也未运行。JS/TS、Web 和文档检查可执行；Android Development Build 需先补齐 Android 环境。本地 Supabase 不阻塞个人日用 V1，具体说明见 `docs/environment.md`。
