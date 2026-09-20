# transplantation-dashboard-web（公有 · 前端）

检验报告看板的**公开前端**，部署到 GitHub Pages 供互联网访问。
本仓库**不含任何数据或令牌**，所有数据在浏览器端经私有 API 鉴权后加载并渲染。

## 目录结构
```
transplantation-dashboard-web/
├── index.html              # 页面骨架（静态）
├── assets/
│   ├── config.js           # 仅含 API_BASE（部署前请修改）
│   ├── app.js             # 渲染逻辑（拉取 bundle → 图表/表格/弹层）
│   ├── app.css            # 医疗健康风样式（响应式）
│   └── chart.umd.min.js   # 图表库（离线内置，无 CDN）
└── .github/workflows/
    └── deploy.yml         # 推送 main 自动部署到 GitHub Pages
```

## 配置（部署前必做）
编辑 `assets/config.js`，将 `API_BASE` 改为你的私有 API 域名：
```js
window.DASH_CONFIG = {
  API_BASE: "https://api.your-private-domain.example",  // ← 改为真实私有服务地址
  ...
};
```
本地调试可用临时覆盖（不提交）：
- URL 参数：`index.html?api=http://127.0.0.1:8000`
- localStorage：键 `transplant_dashboard_api_base`

## 访问方式
1. 打开 Pages 站点后，页面会要求输入 **Bearer 令牌**（即私有仓库 `secrets/.env` 里的 `API_TOKEN`）。
2. 令牌仅保存在本浏览器 `localStorage`，不上传、不入库。
3. 输入正确后即从私有 API 拉取数据并渲染全部看板。

## 部署到 GitHub Pages
1. 将本仓库推送到 GitHub（公开仓库）。
2. Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
3. 推送到 `main` 分支即自动部署（`.github/workflows/deploy.yml`，无需任何 Secrets）。
4. 在私有仓库侧把 `ALLOW_ORIGINS` 设为你的 Pages 实际地址，例如：
   `https://<你的用户名>.github.io/transplantation-dashboard-web`

## 安全边界
- 前端永远拿不到 `data/` 原始数据，只接收结构化 bundle。
- 任何数据接口都需要 Bearer Token；CORS 仅放行 Pages 源。
- 本仓库零机密：无令牌、无 API 地址硬编码以外的敏感信息。
