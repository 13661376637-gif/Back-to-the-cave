# BACK TO THE CAVE WebXR VR 版

## 目标

在保留原版深蓝色洞穴、网格、中心球体、文字叙事、跑马灯和成功反馈的基础上，增加 Meta Quest 3 的 WebXR 模式。

## 输入模式

- 桌面浏览器：轨迹球控制球体，作为调试回退。
- Quest 3：头显姿态控制视角。
- 右手柄扳机：抓取球体并旋转。
- 右手柄摇杆：微调球体角度。
- `Esc`：退出桌面端指针锁定。

## 本地启动

在本目录运行 `start-transition-game.ps1`，默认地址为 `http://127.0.0.1:8790/index.html`。这个地址只适合电脑调试；Quest 3 需要访问部署后的 HTTPS 地址。

## Quest 3 部署

1. 将本目录作为静态网站根目录部署到 HTTPS 托管服务。
2. 在 Quest Browser 打开 HTTPS 地址。
3. 点击 `ENTER VR`，授权沉浸式 VR。
4. 首次加载完成后，可根据浏览器提示安装为 PWA。

## 重要结构

- `src/main.js`：主 Three.js 场景、统一动画时钟和 XR 渲染循环。
- `src/sphere-node.js`：原版球体造型、桌面轨迹球回退和 XR 球体桥接。
- `src/webxr.js`：Quest 3 头显、控制器、抓取旋转和摇杆输入。
- `manifest.webmanifest`：PWA 安装描述。
- `service-worker.js`：离线缓存核心资源。
- `assets/person-*.png`：八个人物的原始表情与反应表情。

## 后续现场优化

- 将人物 PNG 压缩到适合 Quest 3 的纹理尺寸。
- 在真实 Quest 3 上检查帧率和热量。
- 以 `local-floor` 为基准校准虚拟地面高度。
- 将成功提示和调试信息改成 XR 世界空间 UI。
