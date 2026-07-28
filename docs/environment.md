# 环境与密钥

## V1 运行边界

个人日用 V1 以 Android 为首要发布和真机验证平台。应用不要求账号或网络，业务数据只写入设备上的单用户 SQLite；提醒由设备本地通知完成，备份由用户主动导出和导入 JSON 文件。

账号、Supabase 同步和远程推送不在 V1 运行链路内。仓库继续保留 `supabase/` 骨架，供后续开发和数据库契约验证使用，但未启动 Supabase 不应阻塞 V1 的本地功能。

## 环境

| 名称        | V1 用途                                  | EAS profile |
| ----------- | ---------------------------------------- | ----------- |
| development | 本地开发、Android Development Build      | development |
| preview     | Android 内部测试与备份/通知真机验证      | preview     |
| production  | Android 商店构建；iOS 后续按同一配置兼容 | production  |

复制 `.env.example` 为 `.env.local` 并填入需要的本地值。V1 核心流程不依赖 Supabase 环境变量。所有 `EXPO_PUBLIC_` 变量都会进入客户端包，不能包含 Service Role、数据库密码、Sentry Auth Token 等秘密。

## 本地前置条件

- Node 22、Corepack 与 pnpm 11.17。
- Android（首要目标）：JDK 17、Android SDK、ADB，以及模拟器或受支持真机。
- iOS（后续兼容验证）：macOS/Xcode 或 EAS 云构建。
- Supabase（V1 后续能力，可选）：Docker daemon 与 Supabase CLI。

当前 Linux 主机已配置用户级 Android 构建工具链：

```text
JAVA_HOME=/home/lkk/.local/jdk-17
ANDROID_HOME=/home/lkk/Android/Sdk
ANDROID_SDK_ROOT=/home/lkk/Android/Sdk
```

已验证版本：Temurin JDK `17.0.20+8`、Android command-line tools `22.0`、Platform Tools `37.0.0`、Platform 36、Build Tools `36.0.0`、NDK `27.1.12297006`、CMake `3.30.5`。Docker daemon 是否运行不影响个人本地版 V1；Supabase 仍不是 V1 验收前置条件。

## 本地独立 APK

在已经执行 Expo Android prebuild 的工作区，可构建仅面向当前 arm64 真机的 release APK：

```bash
JAVA_HOME=/home/lkk/.local/jdk-17 \
ANDROID_HOME=/home/lkk/Android/Sdk \
ANDROID_SDK_ROOT=/home/lkk/Android/Sdk \
PATH=/home/lkk/.local/jdk-17/bin:/home/lkk/Android/Sdk/platform-tools:$PATH \
apps/mobile/android/gradlew \
  -p apps/mobile/android \
  assembleRelease \
  -PreactNativeArchitectures=arm64-v8a
```

2026-07-28 的个人侧载制品：

```text
文件：/home/lkk/WakeWake-1.0.0-personal.apk
包名：app.wakewake.mobile
版本：1.0.0（versionCode 1）
架构：arm64-v8a
大小：48,181,354 bytes
SHA-256：f26fdd730e3f4a2ee62806415fc346de140a259c0748e9ab4501b92a77a8aad3
```

该制品内嵌 JavaScript bundle，不依赖 Expo Go 或 Metro。它使用生成工程的 Android debug 证书签名，仅适合个人侧载和同签名覆盖安装，不是应用商店发布制品。Expo Go 的包名为 `host.exp.exponent`，可与独立应用共存；二者 SQLite 沙箱独立，数据需通过 WakeWake JSON 备份迁移。

## Android 通知验证

- Android 13+ 应在价值说明后请求通知权限；拒绝权限不影响事项管理和 JSON 备份。
- V1 不声明或申请 `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`，也不把精确闹钟能力作为启动前置条件。
- 提醒按系统允许的非精确本地通知调度，必须在通知开启/关闭、省电模式、应用前后台、进程终止、设备重启和时区变化场景下真机验证。
- 测试文案不得承诺绝对准时；系统或厂商可能延迟通知。
- JSON 导出和导入应使用系统文件选择器或分享能力，并在真实设备上验证权限、覆盖确认、损坏文件处理和恢复结果。

## Linux React Native DevTools

默认的 `dev`、`web`、`android`、`ios` 脚本设置 `EXPO_UNSTABLE_HEADLESS=1`，只关闭 Expo 自动下载和启动的独立 React Native DevTools，不影响 Metro、浏览器开发工具、应用调试菜单或设备连接。这可以避免某些 Linux 环境中 Electron/Chromium 的 `chrome-sandbox` 缺少 root 所有权和 `4755` 权限而报错。

需要独立 DevTools 时运行：

```bash
corepack pnpm --filter @wakewake/mobile start:devtools
```

若再次出现 SUID sandbox 错误，应由系统管理员将报错路径中的 `chrome-sandbox` 设置为 `root:root` 和模式 `4755`。不要使用 `--no-sandbox`，也不要为了解决开发工具问题让整个 Expo 进程以 root 运行。
